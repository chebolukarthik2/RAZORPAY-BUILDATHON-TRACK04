import supabase from '../config/database.js';

const DATASET_NAME = 'Merchant Settlement Demo — September 2026';
const DATASET_DESC = 'Synthetic benchmark dataset for payment-settlement reconciliation. Contains 100 payment records with controlled mixture of matched, partial, and unresolved cases.';
const SEED = 42;

function seededRandom(seed) {
  let s = seed;
  return function() {
    s = (s * 16807 + 0) % 2147483647;
    return (s - 1) / 2147483646;
  };
}

function generateSyntheticData() {
  const rand = seededRandom(SEED);
  const payments = [];
  const settlements = [];
  const groundTruth = [];
  const exceptions = [];

  const paymentMethods = ['UPI / HDFC NetBanking', 'UPI / SBI', 'Card / Visa', 'Card / Mastercard', 'NetBanking / ICICI', 'UPI / Axis'];
  const statuses = ['Captured', 'Captured', 'Captured', 'Captured', 'Captured'];
  const settlementStatuses = ['Settled', 'Settled', 'Settled', 'Settled', 'Pending'];

  const baseDate = new Date('2026-09-01');

  // Transaction patterns
  const txnPatterns = [
    // 70 exact matches
    ...Array.from({length: 70}, (_, i) => ({
      type: 'exact_match',
      baseAmount: Math.round(1000 + rand() * 19000),
      feeRate: 0.02,
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: false,
      missingSettlement: false,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 8 fee-adjusted matches
    ...Array.from({length: 8}, (_, i) => ({
      type: 'fee_adjusted',
      baseAmount: Math.round(2000 + rand() * 15000),
      feeRate: 0.02 + rand() * 0.03,
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: false,
      missingSettlement: false,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 6 amount mismatches (unexplained)
    ...Array.from({length: 6}, (_, i) => ({
      type: 'amount_mismatch',
      baseAmount: Math.round(3000 + rand() * 12000),
      feeRate: 0.02,
      mismatchAmount: Math.round(100 + rand() * 2000),
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: false,
      missingSettlement: false,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 4 missing settlements
    ...Array.from({length: 4}, (_, i) => ({
      type: 'missing_settlement',
      baseAmount: Math.round(1500 + rand() * 10000),
      feeRate: 0.02,
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: false,
      missingSettlement: true,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 5 duplicate settlements
    ...Array.from({length: 5}, (_, i) => ({
      type: 'duplicate_settlement',
      baseAmount: Math.round(2000 + rand() * 8000),
      feeRate: 0.02,
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: true,
      missingSettlement: false,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 4 refund discrepancies
    ...Array.from({length: 4}, (_, i) => ({
      type: 'refund_discrepancy',
      baseAmount: Math.round(3000 + rand() * 10000),
      feeRate: 0.02,
      hasRefund: true,
      refundRate: 0.05 + rand() * 0.1,
      duplicateSettlement: false,
      missingSettlement: false,
      daysOffset: Math.floor(rand() * 4)
    })),
    // 3 date mismatches
    ...Array.from({length: 3}, (_, i) => ({
      type: 'date_mismatch',
      baseAmount: Math.round(2000 + rand() * 8000),
      feeRate: 0.02,
      hasRefund: false,
      refundRate: 0,
      duplicateSettlement: false,
      missingSettlement: false,
      daysOffset: 5 + Math.floor(rand() * 3) // Outside 4-day window
    })),
  ];

  // Ensure TXN_1042 is the required amount mismatch case (index 41 = TXN_1042)
  txnPatterns[41] = {
    type: 'amount_mismatch',
    baseAmount: 4500,
    feeRate: 0,
    mismatchAmount: 180,
    hasRefund: false,
    refundRate: 0,
    duplicateSettlement: false,
    missingSettlement: false,
    daysOffset: 3
  };

  for (let i = 0; i < 100; i++) {
    const txnNum = 1001 + i;
    const txnId = `TXN_${txnNum}`;
    const pattern = txnPatterns[i] || txnPatterns[0];
    const payDate = new Date(baseDate);
    payDate.setDate(payDate.getDate() + pattern.daysOffset);
    const dateStr = payDate.toISOString().split('T')[0];

    const paymentAmount = pattern.baseAmount;
    const fee = Math.round(paymentAmount * pattern.feeRate);
    const refund = pattern.hasRefund ? Math.round(paymentAmount * pattern.refundRate) : 0;
    const expectedNet = paymentAmount - fee - refund;

    let settlementNet, settlementGross, settlementFee, settlementRefund;
    let exceptionType = null;
    let expectedStatus = 'MATCHED';
    let expectedDiff = 0;

    if (pattern.missingSettlement) {
      settlementNet = null;
      settlementGross = null;
      settlementFee = null;
      settlementRefund = null;
      expectedStatus = 'UNRESOLVED';
      exceptionType = 'MISSING_SETTLEMENT';
      expectedDiff = paymentAmount;
    } else if (pattern.type === 'amount_mismatch') {
      settlementGross = paymentAmount - pattern.mismatchAmount;
      settlementFee = 0;
      settlementRefund = 0;
      settlementNet = settlementGross;
      expectedStatus = 'UNRESOLVED';
      exceptionType = 'AMOUNT_MISMATCH';
      expectedDiff = pattern.mismatchAmount;
    } else if (pattern.type === 'fee_adjusted') {
      settlementGross = paymentAmount;
      settlementFee = Math.round(paymentAmount * pattern.feeRate);
      settlementRefund = 0;
      settlementNet = settlementGross - settlementFee;
      expectedStatus = 'PARTIAL';
      exceptionType = 'FEE_DISCREPANCY';
      expectedDiff = Math.abs(expectedNet - settlementNet);
    } else if (pattern.type === 'refund_discrepancy') {
      settlementGross = paymentAmount;
      settlementFee = fee;
      settlementRefund = Math.round(paymentAmount * (pattern.refundRate + 0.05));
      settlementNet = settlementGross - settlementFee - settlementRefund;
      expectedStatus = 'PARTIAL';
      exceptionType = 'REFUND_DISCREPANCY';
      expectedDiff = Math.abs(expectedNet - settlementNet);
    } else if (pattern.type === 'date_mismatch') {
      settlementGross = paymentAmount;
      settlementFee = fee;
      settlementRefund = 0;
      settlementNet = settlementGross - settlementFee;
      expectedStatus = 'PARTIAL';
      exceptionType = 'DATE_MISMATCH';
      expectedDiff = 0;
    } else {
      // Exact match
      settlementGross = paymentAmount;
      settlementFee = fee;
      settlementRefund = refund;
      settlementNet = settlementGross - settlementFee - settlementRefund;
      expectedStatus = 'MATCHED';
      expectedDiff = 0;
    }

    payments.push({
      dataset_id: null, // Will be set after dataset creation
      transaction_id: txnId,
      order_id: `ORD_${998000 + i}`,
      customer_id: `cust_${1000 + Math.floor(rand() * 9000)}`,
      payment_date: dateStr,
      amount: paymentAmount,
      status: 'Captured',
      payment_method: paymentMethods[Math.floor(rand() * paymentMethods.length)],
    });

    if (!pattern.missingSettlement) {
      const settlementDate = new Date(payDate);
      if (pattern.type === 'date_mismatch') {
        settlementDate.setDate(settlementDate.getDate() + pattern.daysOffset);
      } else {
        settlementDate.setDate(settlementDate.getDate() + 1);
      }

      settlements.push({
        dataset_id: null,
        transaction_id: txnId,
        settlement_date: settlementDate.toISOString().split('T')[0],
        gross_amount: settlementGross,
        fee_amount: settlementFee,
        refund_amount: settlementRefund,
        net_amount: settlementNet,
        status: settlementStatuses[Math.floor(rand() * settlementStatuses.length)],
        bank_utr: `HDFC${2980000 + Math.floor(rand() * 20000)}`,
      });

      // Add duplicate settlement for some
      if (pattern.duplicateSettlement) {
        settlements.push({
          dataset_id: null,
          transaction_id: txnId,
          settlement_date: settlementDate.toISOString().split('T')[0],
          gross_amount: settlementGross,
          fee_amount: settlementFee,
          refund_amount: settlementRefund,
          net_amount: settlementNet,
          status: 'Settled',
          bank_utr: `HDFC${2980000 + Math.floor(rand() * 20000)}`,
        });
      }
    }

    groundTruth.push({
      dataset_id: null,
      transaction_id: txnId,
      expected_status: expectedStatus,
      expected_exception_type: exceptionType,
      expected_related_settlement: pattern.missingSettlement ? null : txnId,
      expected_difference: expectedDiff,
    });

    if (exceptionType) {
      exceptions.push({
        transaction_id: txnId,
        exception_type: exceptionType.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase()),
        payment_amount: paymentAmount,
        settlement_amount: settlementNet,
        difference: expectedDiff,
        expected_status: expectedStatus,
      });
    }
  }

  return { payments, settlements, groundTruth, exceptions };
}

export async function seedDataset() {
  console.log('Checking for existing dataset...');

  const { data: existing } = await supabase
    .from('datasets')
    .select('id')
    .eq('name', DATASET_NAME)
    .single();

  if (existing) {
    console.log('Dataset already exists. Skipping seed.');
    return { datasetId: existing.id, created: false };
  }

  console.log('Generating synthetic data...');
  const { payments, settlements, groundTruth, exceptions } = generateSyntheticData();

  // Create dataset
  const { data: dataset, error: dsError } = await supabase
    .from('datasets')
    .insert({
      name: DATASET_NAME,
      description: DATASET_DESC,
      source_type: 'synthetic',
      record_count: 100,
      benchmark_type: 'Payment-Settlement Reconciliation',
    })
    .select()
    .single();

  if (dsError) throw dsError;
  const datasetId = dataset.id;
  console.log(`Dataset created: ${datasetId}`);

  // Insert payments in batches
  const paymentRecords = payments.map(p => ({ ...p, dataset_id: datasetId }));
  const { error: payError } = await supabase.from('payments').insert(paymentRecords);
  if (payError) throw payError;
  console.log(`Inserted ${paymentRecords.length} payments`);

  // Insert settlements in batches
  const settlementRecords = settlements.map(s => ({ ...s, dataset_id: datasetId }));
  const { error: setError } = await supabase.from('settlements').insert(settlementRecords);
  if (setError) throw setError;
  console.log(`Inserted ${settlementRecords.length} settlements`);

  // Insert ground truth
  const gtRecords = groundTruth.map(g => ({ ...g, dataset_id: datasetId }));
  const { error: gtError } = await supabase.from('benchmark_ground_truth').insert(gtRecords);
  if (gtError) throw gtError;
  console.log(`Inserted ${gtRecords.length} ground truth records`);

  // Log the audit event
  await supabase.from('audit_logs').insert({
    event_type: 'DATASET_LOADED',
    action: 'Demo synthetic dataset loaded',
    details: JSON.stringify({
      dataset_name: DATASET_NAME,
      payment_count: paymentRecords.length,
      settlement_count: settlementRecords.length,
      ground_truth_count: gtRecords.length,
      exception_count: exceptions.length,
    }),
  });

  console.log('Seed completed successfully!');
  return { datasetId, created: true, stats: {
    payments: paymentRecords.length,
    settlements: settlementRecords.length,
    groundTruth: gtRecords.length,
    exceptions: exceptions.length,
  }};
}

export async function resetDataset() {
  console.log('Resetting demo dataset...');

  const { data: existing } = await supabase
    .from('datasets')
    .select('id')
    .eq('name', DATASET_NAME)
    .single();

  if (!existing) {
    console.log('No dataset to reset.');
    return { deleted: false };
  }

  // Delete in order (foreign keys)
  await supabase.from('audit_logs').delete().eq('run_id', null);
  await supabase.from('exceptions').delete().in('run_id',
    (await supabase.from('reconciliation_runs').select('id').eq('dataset_id', existing.id)).data?.map(r => r.id) || []
  );
  await supabase.from('reconciliation_results').delete().in('run_id',
    (await supabase.from('reconciliation_runs').select('id').eq('dataset_id', existing.id)).data?.map(r => r.id) || []
  );
  await supabase.from('reconciliation_runs').delete().eq('dataset_id', existing.id);
  await supabase.from('benchmark_ground_truth').delete().eq('dataset_id', existing.id);
  await supabase.from('settlements').delete().eq('dataset_id', existing.id);
  await supabase.from('payments').delete().eq('dataset_id', existing.id);
  await supabase.from('datasets').delete().eq('id', existing.id);

  console.log('Dataset reset complete.');
  return { deleted: true };
}

// Run directly
if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  seedDataset()
    .then(result => {
      console.log('Result:', JSON.stringify(result, null, 2));
      process.exit(0);
    })
    .catch(err => {
      console.error('Seed failed:', err);
      process.exit(1);
    });
}
