import { Router } from 'express';
import multer from 'multer';
import supabase from '../config/database.js';
import { seedDataset, resetDataset } from '../services/seed.js';
import { parsePaymentCSV, parseSettlementCSV } from '../services/csv-parser.js';
import { handleValidation, validateDatasetId } from '../middleware/validation.js';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.originalname.endsWith('.csv')) {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files allowed'));
    }
  },
});

// GET /datasets - List all datasets
router.get('/', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('datasets')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ datasets: data });
  } catch (error) {
    console.error('Error fetching datasets:', error);
    res.status(500).json({ error: 'Failed to fetch datasets' });
  }
});

// POST /datasets/demo/load - Load demo dataset
router.post('/demo/load', async (req, res) => {
  try {
    const result = await seedDataset();
    res.json({
      message: result.created ? 'Demo dataset loaded successfully' : 'Demo dataset already exists',
      ...result,
    });
  } catch (error) {
    console.error('Error loading demo dataset:', error);
    res.status(500).json({ error: 'Failed to load demo dataset' });
  }
});

// POST /datasets/demo/reset - Reset demo dataset
router.post('/demo/reset', async (req, res) => {
  try {
    const result = await resetDataset();
    res.json({ message: 'Demo dataset reset successfully', ...result });
  } catch (error) {
    console.error('Error resetting demo dataset:', error);
    res.status(500).json({ error: 'Failed to reset demo dataset' });
  }
});

// POST /datasets/upload - Upload CSV files and create dataset
router.post('/upload', upload.fields([
  { name: 'payments', maxCount: 1 },
  { name: 'settlements', maxCount: 1 },
]), async (req, res) => {
  try {
    const paymentsFile = req.files?.payments?.[0];
    const settlementsFile = req.files?.settlements?.[0];

    if (!paymentsFile && !settlementsFile) {
      return res.status(400).json({ error: 'Upload at least one CSV file (payments or settlements)' });
    }

    const datasetName = req.body.name || `Upload - ${new Date().toISOString().slice(0, 10)}`;
    const datasetDesc = req.body.description || 'User-uploaded dataset';

    const { data: dataset, error: dsError } = await supabase
      .from('datasets')
      .insert({
        name: datasetName,
        description: datasetDesc,
        source_type: 'uploaded',
        record_count: 0,
      })
      .select()
      .single();

    if (dsError) throw dsError;

    const datasetId = dataset.id;
    let paymentCount = 0;
    let settlementCount = 0;

    if (paymentsFile) {
      const payments = parsePaymentCSV(paymentsFile.buffer, datasetId);
      if (payments.length > 0) {
        const { error } = await supabase.from('payments').insert(payments);
        if (error) throw error;
        paymentCount = payments.length;
      }
    }

    if (settlementsFile) {
      const settlements = parseSettlementCSV(settlementsFile.buffer, datasetId);
      if (settlements.length > 0) {
        const { error } = await supabase.from('settlements').insert(settlements);
        if (error) throw error;
        settlementCount = settlements.length;
      }
    }

    await supabase
      .from('datasets')
      .update({ record_count: paymentCount + settlementCount })
      .eq('id', datasetId);

    res.json({
      message: 'Dataset uploaded successfully',
      dataset: { ...dataset, record_count: paymentCount + settlementCount },
      stats: { payments: paymentCount, settlements: settlementCount },
    });
  } catch (error) {
    console.error('Error uploading dataset:', error);
    res.status(500).json({ error: error.message || 'Failed to upload dataset' });
  }
});

// GET /datasets/:id - Get dataset details
router.get('/:id', validateDatasetId, async (req, res) => {
  try {
    const { id } = req.params;

    const { data: dataset, error: dsError } = await supabase
      .from('datasets')
      .select('*')
      .eq('id', id)
      .single();

    if (dsError || !dataset) {
      return res.status(404).json({ error: 'Dataset not found' });
    }

    const [paymentsCount, settlementsCount, groundTruthCount] = await Promise.all([
      supabase.from('payments').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
      supabase.from('settlements').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
      supabase.from('benchmark_ground_truth').select('id', { count: 'exact', head: true }).eq('dataset_id', id),
    ]);

    const exceptionCount = groundTruthCount.data?.length || 0;

    res.json({
      dataset,
      stats: {
        paymentCount: paymentsCount.count || 0,
        settlementCount: settlementsCount.count || 0,
        groundTruthCount: groundTruthCount.count || 0,
        knownExceptions: exceptionCount,
      },
    });
  } catch (error) {
    console.error('Error fetching dataset:', error);
    res.status(500).json({ error: 'Failed to fetch dataset' });
  }
});

// DELETE /datasets/:id - Delete a dataset
router.delete('/:id', validateDatasetId, async (req, res) => {
  try {
    const { id } = req.params;
    const { error } = await supabase.from('datasets').delete().eq('id', id);
    if (error) throw error;
    res.json({ message: 'Dataset deleted successfully' });
  } catch (error) {
    console.error('Error deleting dataset:', error);
    res.status(500).json({ error: 'Failed to delete dataset' });
  }
});

export default router;
