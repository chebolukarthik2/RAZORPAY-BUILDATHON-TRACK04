import { Router } from 'express';
import supabase from '../config/database.js';
import { runReconciliation } from '../services/reconciliation-engine.js';
import { handleValidation, validateRunId } from '../middleware/validation.js';

const router = Router();

// POST /reconciliation/runs - Start a new reconciliation run
router.post('/runs', async (req, res) => {
  try {
    let datasetId = req.body.dataset_id;

    if (!datasetId) {
      const { data: dataset } = await supabase
        .from('datasets')
        .select('id')
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      datasetId = dataset?.id;
    }

    if (!datasetId) {
      return res.status(400).json({ error: 'No dataset loaded. Please upload or load a dataset first.' });
    }

    const result = await runReconciliation(datasetId);
    res.json(result);
  } catch (error) {
    console.error('Error running reconciliation:', error);
    res.status(500).json({ error: 'Reconciliation failed', details: error.message });
  }
});

// GET /reconciliation/runs - List all runs
router.get('/runs', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('reconciliation_runs')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ runs: data });
  } catch (error) {
    console.error('Error fetching runs:', error);
    res.status(500).json({ error: 'Failed to fetch runs' });
  }
});

// GET /reconciliation/runs/:id - Get run details
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

    // Get financial summary for this run
    const { data: results } = await supabase
      .from('reconciliation_results')
      .select('expected_amount, actual_amount, difference')
      .eq('run_id', id);

    let grossPayment = 0, netSettled = 0;
    if (results) {
      grossPayment = results.reduce((sum, r) => sum + Number(r.expected_amount || 0), 0);
      netSettled = results.reduce((sum, r) => sum + Number(r.actual_amount || 0), 0);
    }

    res.json({
      run,
      financials: { grossPayment, netSettled },
    });
  } catch (error) {
    console.error('Error fetching run:', error);
    res.status(500).json({ error: 'Failed to fetch run' });
  }
});

// GET /reconciliation/runs/:id/results - Get run results
router.get('/runs/:id/results', validateRunId, async (req, res) => {
  try {
    const { id } = req.params;
    const { status, exception_type, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('reconciliation_results')
      .select('*', { count: 'exact' })
      .eq('run_id', id);

    if (status) query = query.eq('status', status.toUpperCase());
    if (exception_type) query = query.eq('exception_type', exception_type);

    query = query.order('transaction_id', { ascending: true });

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      results: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching run results:', error);
    res.status(500).json({ error: 'Failed to fetch run results' });
  }
});

export default router;
