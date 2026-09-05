import { Router } from 'express';
import supabase from '../config/database.js';
import { validateExceptionId, validateManualReview } from '../middleware/validation.js';

const router = Router();

// GET /exceptions - List all exceptions
router.get('/', async (req, res) => {
  try {
    const { status, exception_type, priority, run_id, page = 1, limit = 50 } = req.query;

    let query = supabase
      .from('exceptions')
      .select('*', { count: 'exact' });

    if (status) query = query.eq('status', status.toUpperCase());
    if (exception_type) query = query.eq('exception_type', exception_type);
    if (priority) query = query.eq('priority', priority.toUpperCase());
    if (run_id) query = query.eq('run_id', run_id);

    query = query.order('created_at', { ascending: false });

    // Pagination
    const offset = (page - 1) * limit;
    query = query.range(offset, offset + limit - 1);

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({
      exceptions: data,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('Error fetching exceptions:', error);
    res.status(500).json({ error: 'Failed to fetch exceptions' });
  }
});

// GET /exceptions/:id - Get exception details
router.get('/:id', validateExceptionId, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: exception, error } = await supabase
      .from('exceptions')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !exception) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    // Get related reconciliation result
    const { data: result } = await supabase
      .from('reconciliation_results')
      .select('*')
      .eq('transaction_id', exception.transaction_id)
      .eq('run_id', exception.run_id)
      .single();

    // Get payment details
    let payment = null;
    if (result?.payment_id) {
      const { data: p } = await supabase
        .from('payments')
        .select('*')
        .eq('id', result.payment_id)
        .single();
      payment = p;
    }

    // Get settlement details
    let settlement = null;
    if (result?.settlement_id) {
      const { data: s } = await supabase
        .from('settlements')
        .select('*')
        .eq('id', result.settlement_id)
        .single();
      settlement = s;
    }

    res.json({
      exception,
      result,
      payment,
      settlement,
    });
  } catch (error) {
    console.error('Error fetching exception:', error);
    res.status(500).json({ error: 'Failed to fetch exception' });
  }
});

// PATCH /exceptions/:id/manual-review - Mark for manual review
router.patch('/:id/manual-review', validateManualReview, async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    const { data: exception, error: fetchError } = await supabase
      .from('exceptions')
      .select('*')
      .eq('id', id)
      .single();

    if (fetchError || !exception) {
      return res.status(404).json({ error: 'Exception not found' });
    }

    const { data: updated, error: updateError } = await supabase
      .from('exceptions')
      .update({
        manual_review_status: status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (updateError) throw updateError;

    // Create audit log
    await supabase.from('audit_logs').insert({
      run_id: exception.run_id,
      transaction_id: exception.transaction_id,
      event_type: 'MANUAL_REVIEW',
      action: `Manual review status changed to ${status}`,
      details: JSON.stringify({
        exception_id: id,
        previous_status: exception.manual_review_status,
        new_status: status,
      }),
    });

    res.json({ exception: updated });
  } catch (error) {
    console.error('Error updating manual review:', error);
    res.status(500).json({ error: 'Failed to update manual review status' });
  }
});

export default router;
