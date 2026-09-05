import { Router } from 'express';
import supabase from '../config/database.js';
import { analyzeException, generateBatchInsight, financeQA } from '../services/ai-service.js';
import { validateFinanceQA } from '../middleware/validation.js';

const router = Router();

// POST /ai/exception-analysis - Analyze a specific exception
router.post('/exception-analysis', async (req, res) => {
  try {
    const { transaction_id, run_id } = req.body;

    if (!transaction_id) {
      return res.status(400).json({ error: 'transaction_id is required' });
    }

    // Get reconciliation result
    let query = supabase
      .from('reconciliation_results')
      .select('*')
      .eq('transaction_id', transaction_id);

    if (run_id) query = query.eq('run_id', run_id);

    const { data: result } = await query.order('created_at', { ascending: false }).limit(1).single();

    if (!result) {
      return res.status(404).json({ error: 'No reconciliation result found for this transaction' });
    }

    // Get payment details
    let payment = null;
    if (result.payment_id) {
      const { data: p } = await supabase.from('payments').select('*').eq('id', result.payment_id).single();
      payment = p;
    }

    // Get settlement details
    let settlement = null;
    if (result.settlement_id) {
      const { data: s } = await supabase.from('settlements').select('*').eq('id', result.settlement_id).single();
      settlement = s;
    }

    const analysis = await analyzeException({
      transaction_id,
      payment_amount: payment?.amount || result.expected_amount,
      settlement_gross: settlement?.gross_amount,
      settlement_net: settlement?.net_amount,
      fee: settlement?.fee_amount,
      refund: settlement?.refund_amount,
      expected_net: result.expected_amount,
      actual_net: result.actual_amount,
      difference: result.difference,
      settlement_date: settlement?.settlement_date,
      status: result.status,
      deterministic_reason: result.deterministic_reason,
      exception_type: result.exception_type,
    });

    // Log the AI analysis
    await supabase.from('audit_logs').insert({
      run_id: result.run_id,
      transaction_id,
      event_type: analysis.status === 'available' ? 'AI_ANALYSIS_GENERATED' : 'AI_ANALYSIS_FAILED',
      action: `AI exception analysis for ${transaction_id}`,
      details: JSON.stringify({ status: analysis.status }),
    });

    res.json(analysis);
  } catch (error) {
    console.error('Error in exception analysis:', error);
    res.status(500).json({ error: 'Failed to analyze exception' });
  }
});

// POST /ai/batch-insight - Generate batch insight
router.post('/batch-insight', async (req, res) => {
  try {
    // Get latest run
    const { data: run } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    if (!run) {
      return res.status(404).json({ error: 'No completed run found' });
    }

    // Get exception breakdown
    const { data: exceptions } = await supabase
      .from('exceptions')
      .select('exception_type')
      .eq('run_id', run.id);

    const exceptionBreakdown = {};
    if (exceptions) {
      for (const exc of exceptions) {
        exceptionBreakdown[exc.exception_type] = (exceptionBreakdown[exc.exception_type] || 0) + 1;
      }
    }

    const insight = await generateBatchInsight({
      totalRecords: run.total_records,
      matched: run.matched_count,
      partial: run.partial_count,
      unresolved: run.unresolved_count,
      matchRate: run.match_rate,
      accuracy: run.accuracy,
      precision: run.precision_score,
      recall: run.recall_score,
      exceptionDetectionRate: run.exception_detection_rate,
      durationMs: run.duration_ms,
      exceptionBreakdown,
    });

    res.json(insight);
  } catch (error) {
    console.error('Error generating batch insight:', error);
    res.status(500).json({ error: 'Failed to generate batch insight' });
  }
});

// POST /ai/finance-qna - Finance Q&A
router.post('/finance-qna', validateFinanceQA, async (req, res) => {
  try {
    const { question } = req.body;

    // Get context data from database
    const { data: latestRun } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    let contextData = {
      totalRecords: 0,
      matchRate: 0,
      matched: 0,
      partial: 0,
      unresolved: 0,
      grossPayment: 0,
      netSettled: 0,
      fees: 0,
      refunds: 0,
      exceptionBreakdown: {},
      topDiscrepancies: [],
    };

    if (latestRun) {
      contextData.totalRecords = latestRun.total_records;
      contextData.matchRate = latestRun.match_rate;
      contextData.matched = latestRun.matched_count;
      contextData.partial = latestRun.partial_count;
      contextData.unresolved = latestRun.unresolved_count;

      // Get financial totals
      if (latestRun.dataset_id) {
        const { data: payments } = await supabase
          .from('payments')
          .select('amount')
          .eq('dataset_id', latestRun.dataset_id);

        const { data: settlements } = await supabase
          .from('settlements')
          .select('gross_amount, net_amount, fee_amount, refund_amount')
          .eq('dataset_id', latestRun.dataset_id);

        if (payments) contextData.grossPayment = payments.reduce((s, p) => s + Number(p.amount), 0);
        if (settlements) {
          contextData.netSettled = settlements.reduce((s, t) => s + Number(t.net_amount), 0);
          contextData.fees = settlements.reduce((s, t) => s + Number(t.fee_amount), 0);
          contextData.refunds = settlements.reduce((s, t) => s + Number(t.refund_amount), 0);
        }
      }

      // Get exception breakdown
      const { data: exceptions } = await supabase
        .from('exceptions')
        .select('exception_type, difference_amount')
        .eq('run_id', latestRun.id);

      if (exceptions) {
        for (const exc of exceptions) {
          if (!contextData.exceptionBreakdown[exc.exception_type]) {
            contextData.exceptionBreakdown[exc.exception_type] = { count: 0, totalAmount: 0 };
          }
          contextData.exceptionBreakdown[exc.exception_type].count++;
          contextData.exceptionBreakdown[exc.exception_type].totalAmount += Number(exc.difference_amount);
        }

        // Get top discrepancies
        contextData.topDiscrepancies = exceptions
          .sort((a, b) => Number(b.difference_amount) - Number(a.difference_amount))
          .slice(0, 5)
          .map(e => ({
            transaction_id: e.transaction_id,
            type: e.exception_type,
            difference: e.difference_amount,
          }));
      }
    }

    // Log Q&A request
    await supabase.from('audit_logs').insert({
      run_id: latestRun?.id,
      event_type: 'FINANCE_QA',
      action: `Finance Q&A: ${question.substring(0, 100)}`,
      details: JSON.stringify({ question }),
    });

    const answer = await financeQA(question, contextData);
    res.json(answer);
  } catch (error) {
    console.error('Error in finance Q&A:', error);
    res.status(500).json({ error: 'Failed to process Q&A' });
  }
});

export default router;
