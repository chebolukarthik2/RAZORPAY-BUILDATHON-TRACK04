import { Router } from 'express';
import { evaluateRun } from '../services/evaluation-engine.js';
import { validateRunId } from '../middleware/validation.js';

const router = Router();

// GET /evaluation/:runId - Get evaluation metrics for a run
router.get('/:runId', validateRunId, async (req, res) => {
  try {
    const { runId } = req.params;
    const metrics = await evaluateRun(runId);
    res.json(metrics);
  } catch (error) {
    console.error('Error evaluating run:', error);
    res.status(500).json({ error: 'Failed to evaluate run' });
  }
});

export default router;
