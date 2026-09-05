import { body, param, validationResult } from 'express-validator';

export const handleValidation = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      error: 'Validation failed',
      details: errors.array().map(e => ({ field: e.path, message: e.msg })),
    });
  }
  next();
};

export const validateDatasetId = [
  param('id').isUUID().withMessage('Invalid dataset ID'),
  handleValidation,
];

export const validateRunId = [
  param('id').isUUID().withMessage('Invalid run ID'),
  handleValidation,
];

export const validateExceptionId = [
  param('id').isUUID().withMessage('Invalid exception ID'),
  handleValidation,
];

export const validateManualReview = [
  param('id').isUUID().withMessage('Invalid exception ID'),
  body('status').isIn(['NONE', 'PENDING', 'IN_REVIEW', 'RESOLVED']).withMessage('Invalid review status'),
  handleValidation,
];

export const validateFinanceQA = [
  body('question').isString().notEmpty().withMessage('Question is required'),
  handleValidation,
];
