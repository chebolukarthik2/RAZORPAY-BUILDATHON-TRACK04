import supabase from '../config/database.js';

const SETTLEMENT_WINDOW_DAYS = 4;
const ALGORITHM_VERSION = 'v1.0-prod';

function calculateConfidence(signals) {
  const weights = {
    transactionIdMatch: 25,
    grossAmountConsistency: 20,
    feeConsistency: 15,
    refundConsistency: 10,
    dateConsistency: 10,
    settlementExists: 15,
    noDuplicates: 5,
  };

  let score = 0;
  for (const [key, value] of Object.entries(signals)) {
    if (value && weights[key]) {
      score += weights[key];
    }
  }
  return Math.min(100, Math.max(0, score));
}

function determineStatus(confidence, difference, exceptionType) {
  if (exceptionType === 'MISSING_SETTLEMENT') return 'UNRESOLVED';
  if (exceptionType === 'DUPLICATE_SETTLEMENT') return 'PARTIAL';
  if (Math.abs(difference) === 0 && confidence >= 90) return 'MATCHED';
  if (confidence >= 70 && Math.abs(difference) <= 100) return 'MATCHED';
  if (confidence >= 50) return 'PARTIAL';
  return 'UNRESOLVED';
}

function getDeterministicReason(status, exceptionType, difference, payment, settlement) {
  const reasons = {
    MATCHED: `Payment amount ₹${payment.amount} reconciles with settlement net ₹${settlement?.net_amount || 0}. Difference: ₹${difference}.`,
    PARTIAL: `Partial match detected. ${exceptionType ? exceptionType.replace(/_/g, ' ').toLowerCase() + '.' : ''} Difference: ₹${difference}.`,
    UNRESOLVED: exceptionType === 'MISSING_SETTLEMENT'
      ? `No settlement record found for transaction. Payment of ₹${payment.amount} remains unsettled.`
      : `Unable to reconcile. ${exceptionType?.replace(/_/g, ' ').toLowerCase() || 'Unknown reason'}. Difference: ₹${difference}.`,
  };
  return reasons[status] || 'Insufficient evidence for determination.';
}

export async function runReconciliation(datasetId) {
  const startTime = Date.now();

  // Create run record
  const { data: run, error: runError } = await supabase
    .from('reconciliation_runs')
    .insert({
      dataset_id: datasetId,
      status: 'RUNNING',
      started_at: new Date().toISOString(),
      algorithm_version: ALGORITHM_VERSION,
    })
    .select()
    .single();

  if (runError) throw runError;
  const runId = run.id;

  try {
    // Load data
    const [paymentsRes, settlementsRes, groundTruthRes] = await Promise.all([
      supabase.from('payments').select('*').eq('dataset_id', datasetId),
      supabase.from('settlements').select('*').eq('dataset_id', datasetId),
      supabase.from('benchmark_ground_truth').select('*').eq('dataset_id', datasetId),
    ]);

    if (paymentsRes.error) throw paymentsRes.error;
    if (settlementsRes.error) throw settlementsRes.error;
    if (groundTruthRes.error) throw groundTruthRes.error;

    const payments = paymentsRes.data;
    const settlements = settlementsRes.data;
    const groundTruth = groundTruthRes.data;

    // Group settlements by transaction_id
    const settlementMap = {};
    for (const s of settlements) {
      if (!settlementMap[s.transaction_id]) {
        settlementMap[s.transaction_id] = [];
      }
      settlementMap[s.transaction_id].push(s);
    }

    // Group ground truth by transaction_id
    const gtMap = {};
    for (const gt of groundTruth) {
      gtMap[gt.transaction_id] = gt;
    }

    const results = [];
    const exceptionRecords = [];
    let matchedCount = 0, partialCount = 0, unresolvedCount = 0;
    let correctDecisions = 0, falseMatches = 0, missedExceptions = 0;

    // Process each payment
    for (const payment of payments) {
      const txnId = payment.transaction_id;
      const txnSettlements = settlementMap[txnId] || [];
      const gt = gtMap[txnId];

      let status, confidence, exceptionType, difference, expectedAmount, actualAmount;
      let deterministicReason;

      // Step 1: Find candidate settlement
      if (txnSettlements.length === 0) {
        // Missing settlement
        status = 'UNRESOLVED';
        exceptionType = 'MISSING_SETTLEMENT';
        difference = payment.amount;
        expectedAmount = payment.amount;
        actualAmount = null;
        confidence = calculateConfidence({
          transactionIdMatch: true,
          grossAmountConsistency: false,
          feeConsistency: false,
          refundConsistency: false,
          dateConsistency: false,
          settlementExists: false,
          noDuplicates: true,
        });
      } else {
        const settlement = txnSettlements[0];

        // Step 2: Detect duplicates
        if (txnSettlements.length > 1) {
          exceptionType = 'DUPLICATE_SETTLEMENT';
        }

        // Step 3: Calculate expected net
        const fee = settlement.fee_amount || 0;
        const refund = settlement.refund_amount || 0;
        expectedAmount = payment.amount;
        actualAmount = settlement.net_amount;
        difference = Math.abs(expectedAmount - (settlement.gross_amount - fee - refund));

        // Step 4: Check fee discrepancy
        const expectedFee = Math.round(payment.amount * 0.02);
        const feeDiff = Math.abs(fee - expectedFee);

        // Step 5: Check settlement date
        const payDate = new Date(payment.payment_date);
        const setDate = new Date(settlement.settlement_date);
        const daysDiff = Math.abs((setDate - payDate) / (1000 * 60 * 60 * 24));
        const dateOk = daysDiff <= SETTLEMENT_WINDOW_DAYS;

        // Step 6: Calculate confidence
        const signals = {
          transactionIdMatch: true,
          grossAmountConsistency: Math.abs(settlement.gross_amount - payment.amount) <= 1,
          feeConsistency: feeDiff <= 50,
          refundConsistency: refund <= payment.amount * 0.1,
          dateConsistency: dateOk,
          settlementExists: true,
          noDuplicates: txnSettlements.length === 1,
        };
        confidence = calculateConfidence(signals);

        // Step 7: Determine exception type
        if (!dateOk && !exceptionType) {
          exceptionType = 'DATE_MISMATCH';
        } else if (feeDiff > 100 && !exceptionType) {
          exceptionType = 'FEE_DISCREPANCY';
        } else if (difference > 100 && !exceptionType) {
          exceptionType = 'AMOUNT_MISMATCH';
        } else if (refund > 0 && Math.abs(refund - settlement.refund_amount) > 50 && !exceptionType) {
          exceptionType = 'REFUND_DISCREPANCY';
        }

        // Step 8: Determine status
        status = determineStatus(confidence, difference, exceptionType);
      }

      // Count outcomes
      if (status === 'MATCHED') matchedCount++;
      else if (status === 'PARTIAL') partialCount++;
      else unresolvedCount++;

      // Compare with ground truth
      if (gt) {
        const gtStatus = gt.expected_status;
        if (status === gtStatus) correctDecisions++;
        if (status === 'MATCHED' && gtStatus !== 'MATCHED') falseMatches++;
        if (status !== 'UNRESOLVED' && gtStatus === 'UNRESOLVED') missedExceptions++;
      }

      deterministicReason = getDeterministicReason(status, exceptionType, difference, payment,
        txnSettlements.length > 0 ? txnSettlements[0] : null);

      results.push({
        run_id: runId,
        transaction_id: txnId,
        payment_id: payment.id,
        settlement_id: txnSettlements.length > 0 ? txnSettlements[0].id : null,
        status,
        confidence,
        expected_amount: expectedAmount,
        actual_amount: actualAmount,
        difference,
        exception_type: exceptionType,
        deterministic_reason: deterministicReason,
        ai_status: 'pending',
      });

      // Create exception record if needed
      if (exceptionType && status !== 'MATCHED') {
        const priority = status === 'UNRESOLVED' ? 'High' :
          difference > 200 ? 'Medium' : 'Low';

        exceptionRecords.push({
          run_id: runId,
          transaction_id: txnId,
          exception_type: exceptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
          priority,
          confidence,
          difference_amount: difference,
          status,
        });
      }
    }

    // Batch insert results
    const { error: resError } = await supabase.from('reconciliation_results').insert(results);
    if (resError) throw resError;

    // Batch insert exceptions
    if (exceptionRecords.length > 0) {
      const { error: excError } = await supabase.from('exceptions').insert(exceptionRecords);
      if (excError) throw excError;
    }

    const endTime = Date.now();
    const durationMs = endTime - startTime;
    const totalRecords = payments.length;
    const matchRate = totalRecords > 0 ? (matchedCount / totalRecords * 100) : 0;

    // Calculate evaluation metrics against ground truth
    let tp = 0, fp = 0, fn = 0, tn = 0;
    let correctPredictedMatches = 0;
    let allPredictedMatches = 0;
    let allActualMatches = 0;
    let correctlyDetectedExceptions = 0;
    let allActualExceptions = 0;

    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const gt = groundTruth[i];
      if (!gt) continue;

      if (r.status === 'MATCHED' && gt.expected_status === 'MATCHED') {
        tp++;
        correctPredictedMatches++;
      } else if (r.status === 'MATCHED' && gt.expected_status !== 'MATCHED') {
        fp++;
      } else if (r.status !== 'MATCHED' && gt.expected_status === 'MATCHED') {
        fn++;
      } else {
        tn++;
      }

      if (r.status === 'MATCHED') allPredictedMatches++;
      if (gt.expected_status === 'MATCHED') allActualMatches++;
      if (gt.expected_status !== 'MATCHED') allActualExceptions++;
      if (r.status !== 'MATCHED' && gt.expected_status !== 'MATCHED') correctlyDetectedExceptions++;
    }

    const accuracy = totalRecords > 0 ? (correctDecisions / totalRecords * 100) : 0;
    const precision = allPredictedMatches > 0 ? (correctPredictedMatches / allPredictedMatches * 100) : 0;
    const recall = allActualMatches > 0 ? (correctPredictedMatches / allActualMatches * 100) : 0;
    const exceptionDetectionRate = allActualExceptions > 0 ? (correctlyDetectedExceptions / allActualExceptions * 100) : 0;

    // Update run record
    const { error: updateError } = await supabase
      .from('reconciliation_runs')
      .update({
        status: 'COMPLETED',
        total_records: totalRecords,
        matched_count: matchedCount,
        partial_count: partialCount,
        unresolved_count: unresolvedCount,
        match_rate: Math.round(matchRate * 10) / 10,
        accuracy: Math.round(accuracy * 10) / 10,
        precision_score: Math.round(precision * 10) / 10,
        recall_score: Math.round(recall * 10) / 10,
        exception_detection_rate: Math.round(exceptionDetectionRate * 10) / 10,
        correct_decisions: correctDecisions,
        false_matches: fp,
        missed_exceptions: fn,
        completed_at: new Date().toISOString(),
        duration_ms: durationMs,
      })
      .eq('id', runId);

    if (updateError) throw updateError;

    // Log audit
    await supabase.from('audit_logs').insert({
      run_id: runId,
      event_type: 'RECONCILIATION_COMPLETED',
      action: 'Batch reconciliation completed successfully',
      details: JSON.stringify({
        total_records: totalRecords,
        matched: matchedCount,
        partial: partialCount,
        unresolved: unresolvedCount,
        match_rate: matchRate,
        accuracy,
        duration_ms: durationMs,
      }),
    });

    return {
      runId,
      status: 'COMPLETED',
      totalRecords,
      matched: matchedCount,
      partial: partialCount,
      unresolved: unresolvedCount,
      matchRate: Math.round(matchRate * 10) / 10,
      accuracy: Math.round(accuracy * 10) / 10,
      precision: Math.round(precision * 10) / 10,
      recall: Math.round(recall * 10) / 10,
      exceptionDetectionRate: Math.round(exceptionDetectionRate * 10) / 10,
      durationMs,
      exceptionCount: exceptionRecords.length,
    };
  } catch (error) {
    // Mark run as failed
    await supabase
      .from('reconciliation_runs')
      .update({ status: 'FAILED', completed_at: new Date().toISOString() })
      .eq('id', runId);

    await supabase.from('audit_logs').insert({
      run_id: runId,
      event_type: 'RECONCILIATION_FAILED',
      action: 'Batch reconciliation failed',
      details: JSON.stringify({ error: error.message }),
    });

    throw error;
  }
}
