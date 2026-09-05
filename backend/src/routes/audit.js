import { Router } from 'express';
import supabase from '../config/database.js';
import { validateRunId } from '../middleware/validation.js';

const router = Router();

// GET /audit/runs - List all runs for audit trail
router.get('/runs', async (req, res) => {
  try {
    const { data: runs, error } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;

    // Get summary stats
    const totalRuns = runs.length;
    const totalRecords = runs.reduce((sum, r) => sum + (r.total_records || 0), 0);
    const avgMatchRate = totalRuns > 0
      ? runs.reduce((sum, r) => sum + (r.match_rate || 0), 0) / totalRuns
      : 0;
    const totalExceptions = runs.reduce((sum, r) => sum + (r.unresolved_count || 0), 0);

    res.json({
      runs,
      summary: {
        totalRuns,
        totalRecords,
        averageMatchRate: Math.round(avgMatchRate * 10) / 10,
        totalOpenExceptions: totalExceptions,
      },
    });
  } catch (error) {
    console.error('Error fetching audit runs:', error);
    res.status(500).json({ error: 'Failed to fetch audit runs' });
  }
});

// GET /audit/runs/:id - Get specific run details
router.get('/runs/:id', validateRunId, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: run, error } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !run) {
      return res.status(404).json({ error: 'Run not found' });
    }

    // Get financial summary
    const { data: results } = await supabase
      .from('reconciliation_results')
      .select('expected_amount, actual_amount, difference, status, exception_type')
      .eq('run_id', id);

    let grossPayment = 0, netSettled = 0, fees = 0;
    if (results) {
      grossPayment = results.reduce((sum, r) => sum + Number(r.expected_amount || 0), 0);
      netSettled = results.reduce((sum, r) => sum + Number(r.actual_amount || 0), 0);
    }

    // Get settlement totals
    if (run.dataset_id) {
      const { data: settlements } = await supabase
        .from('settlements')
        .select('fee_amount, refund_amount')
        .eq('dataset_id', run.dataset_id);

      if (settlements) {
        fees = settlements.reduce((sum, s) => sum + Number(s.fee_amount || 0), 0);
      }
    }

    res.json({
      run,
      financials: {
        grossPayment,
        netSettled,
        fees,
        refunds: grossPayment - netSettled - fees,
      },
    });
  } catch (error) {
    console.error('Error fetching audit run:', error);
    res.status(500).json({ error: 'Failed to fetch audit run' });
  }
});

// GET /audit/runs/:id/events - Get audit events for a run
router.get('/runs/:id/events', validateRunId, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: events, error } = await supabase
      .from('audit_logs')
      .select('*')
      .eq('run_id', id)
      .order('created_at', { ascending: true });

    if (error) throw error;

    res.json({ events: events || [] });
  } catch (error) {
    console.error('Error fetching audit events:', error);
    res.status(500).json({ error: 'Failed to fetch audit events' });
  }
});

export default router;
