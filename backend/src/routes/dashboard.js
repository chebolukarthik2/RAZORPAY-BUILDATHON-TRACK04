import { Router } from 'express';
import supabase from '../config/database.js';

const router = Router();

// GET /dashboard/summary - Get dashboard summary
router.get('/summary', async (req, res) => {
  try {
    // Get the latest completed run
    const { data: latestRun } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get total runs
    const { count: totalRuns } = await supabase
      .from('reconciliation_runs')
      .select('id', { count: 'exact', head: true });

    // Get dataset info
    const { data: dataset } = await supabase
      .from('datasets')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    // Get payment/settlement totals
    let grossPayment = 0, netSettled = 0, fees = 0, refunds = 0;
    if (dataset) {
      const { data: payments } = await supabase
        .from('payments')
        .select('amount')
        .eq('dataset_id', dataset.id);

      const { data: settlements } = await supabase
        .from('settlements')
        .select('gross_amount, net_amount, fee_amount, refund_amount')
        .eq('dataset_id', dataset.id);

      if (payments) grossPayment = payments.reduce((sum, p) => sum + Number(p.amount), 0);
      if (settlements) {
        netSettled = settlements.reduce((sum, s) => sum + Number(s.net_amount), 0);
        fees = settlements.reduce((sum, s) => sum + Number(s.fee_amount), 0);
        refunds = settlements.reduce((sum, s) => sum + Number(s.refund_amount), 0);
      }
    }

    // Get exception breakdown
    let exceptionBreakdown = {};
    let recentExceptions = [];
    if (latestRun) {
      const { data: exceptions } = await supabase
        .from('exceptions')
        .select('*')
        .eq('run_id', latestRun.id)
        .order('created_at', { ascending: false });

      if (exceptions) {
        for (const exc of exceptions) {
          const type = exc.exception_type;
          if (!exceptionBreakdown[type]) {
            exceptionBreakdown[type] = { count: 0, totalDifference: 0 };
          }
          exceptionBreakdown[type].count++;
          exceptionBreakdown[type].totalDifference += Number(exc.difference_amount);
        }
        recentExceptions = exceptions.slice(0, 10);
      }
    }

    // Get historical runs for chart
    const { data: historicalRuns } = await supabase
      .from('reconciliation_runs')
      .select('id, matched_count, partial_count, unresolved_count, match_rate, created_at')
      .eq('status', 'COMPLETED')
      .order('created_at', { ascending: false })
      .limit(4);

    res.json({
      latestRun: latestRun || null,
      totalRuns: totalRuns || 0,
      dataset: dataset || null,
      financials: {
        grossPayment,
        netSettled,
        fees,
        refunds,
      },
      exceptionBreakdown,
      recentExceptions,
      historicalRuns: historicalRuns || [],
    });
  } catch (error) {
    console.error('Error fetching dashboard summary:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard summary' });
  }
});

export default router;
