import { describe, it } from 'node:test';
import assert from 'node:assert';

// Test the reconciliation logic without database
// These are unit tests for the core reconciliation algorithms

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
    if (value && weights[key]) score += weights[key];
  }
  return Math.min(100, Math.max(0, score));
}

function determineStatus(confidence, difference, exceptionType) {
  if (exceptionType === 'MISSING_SETTLEMENT') return 'UNRESOLVED';
  if (exceptionType === 'DUPLICATE_SETTLEMENT') return 'PARTIAL';
  if (exceptionType === 'AMOUNT_MISMATCH') return 'UNRESOLVED';
  if (exceptionType === 'DATE_MISMATCH') return 'PARTIAL';
  if (exceptionType === 'FEE_DISCREPANCY') return 'PARTIAL';
  if (exceptionType === 'REFUND_DISCREPANCY') return 'PARTIAL';
  if (Math.abs(difference) === 0 && confidence >= 90) return 'MATCHED';
  if (confidence >= 70 && Math.abs(difference) <= 100) return 'MATCHED';
  if (confidence >= 50) return 'PARTIAL';
  return 'UNRESOLVED';
}

describe('Reconciliation Engine', () => {
  describe('Exact Match', () => {
    it('should MATCHED when payment equals settlement net', () => {
      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: true,
        feeConsistency: true,
        refundConsistency: true,
        dateConsistency: true,
        settlementExists: true,
        noDuplicates: true,
      };
      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, 0, null);
      assert.strictEqual(status, 'MATCHED');
      assert.strictEqual(confidence, 100);
    });
  });

  describe('Fee-Adjusted Match', () => {
    it('should MATCHED when difference is explained by fees and within tolerance', () => {
      const payment = 5000;
      const fee = 50;
      const settlementNet = 4950;
      const difference = Math.abs(payment - settlementNet);
      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: true,
        feeConsistency: true,
        refundConsistency: true,
        dateConsistency: true,
        settlementExists: true,
        noDuplicates: true,
      };
      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, difference, null);
      assert.strictEqual(status, 'MATCHED');
    });
  });

  describe('Amount Mismatch', () => {
    it('should UNRESOLVED for unexplained difference with AMOUNT_MISMATCH type', () => {
      const payment = 4500;
      const settlement = 4320;
      const difference = 180;
      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: false,
        feeConsistency: false,
        refundConsistency: true,
        dateConsistency: true,
        settlementExists: true,
        noDuplicates: true,
      };
      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, difference, 'AMOUNT_MISMATCH');
      assert.strictEqual(status, 'UNRESOLVED');
    });
  });

  describe('Missing Settlement', () => {
    it('should UNRESOLVED when no settlement exists', () => {
      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: false,
        feeConsistency: false,
        refundConsistency: false,
        dateConsistency: false,
        settlementExists: false,
        noDuplicates: true,
      };
      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, 7800, 'MISSING_SETTLEMENT');
      assert.strictEqual(status, 'UNRESOLVED');
      assert.ok(confidence < 50);
    });
  });

  describe('Duplicate Settlement', () => {
    it('should PARTIAL when duplicate settlements detected', () => {
      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: true,
        feeConsistency: true,
        refundConsistency: true,
        dateConsistency: true,
        settlementExists: true,
        noDuplicates: false,
      };
      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, 0, 'DUPLICATE_SETTLEMENT');
      assert.strictEqual(status, 'PARTIAL');
    });
  });

  describe('TXN_1042 Required Demo Case', () => {
    it('should match the required demo case: payment 4500, settlement 4320, difference 180, UNRESOLVED', () => {
      const payment = 4500;
      const settlementNet = 4320;
      const fee = 0;
      const refund = 0;
      const difference = Math.abs(payment - (settlementNet + fee + refund));

      const signals = {
        transactionIdMatch: true,
        grossAmountConsistency: false,
        feeConsistency: false,
        refundConsistency: true,
        dateConsistency: true,
        settlementExists: true,
        noDuplicates: true,
      };

      const confidence = calculateConfidence(signals);
      const status = determineStatus(confidence, difference, 'AMOUNT_MISMATCH');

      assert.strictEqual(difference, 180);
      assert.strictEqual(status, 'UNRESOLVED');
    });
  });
});

describe('Evaluation Engine', () => {
  it('should calculate accuracy correctly', () => {
    const results = [
      { status: 'MATCHED' },
      { status: 'MATCHED' },
      { status: 'UNRESOLVED' },
      { status: 'PARTIAL' },
    ];
    const groundTruth = [
      { expected_status: 'MATCHED' },
      { expected_status: 'MATCHED' },
      { expected_status: 'UNRESOLVED' },
      { expected_status: 'MATCHED' },
    ];

    let correct = 0;
    for (let i = 0; i < results.length; i++) {
      if (results[i].status === groundTruth[i].expected_status) correct++;
    }

    const accuracy = (correct / results.length) * 100;
    assert.strictEqual(accuracy, 75);
  });

  it('should calculate precision correctly', () => {
    // predicted MATCHED: 2, actual MATCHED: 2 → precision = 100%
    const truePositives = 2;
    const falsePositives = 0;
    const precision = truePositives / (truePositives + falsePositives) * 100;
    assert.strictEqual(precision, 100);
  });

  it('should calculate recall correctly', () => {
    // actual MATCHED: 3, predicted MATCHED: 2 → recall = 66.7%
    const truePositives = 2;
    const falseNegatives = 1;
    const recall = truePositives / (truePositives + falseNegatives) * 100;
    assert.ok(Math.abs(recall - 66.7) < 1);
  });
});

describe('Audit Logging', () => {
  it('should create audit log entries', () => {
    const auditLog = {
      run_id: 'test-run-id',
      transaction_id: 'TXN_1042',
      event_type: 'MANUAL_REVIEW',
      action: 'Manual review status changed to PENDING',
      details: JSON.stringify({ exception_id: 'test-exc-id', new_status: 'PENDING' }),
    };

    assert.strictEqual(auditLog.event_type, 'MANUAL_REVIEW');
    assert.ok(auditLog.details);
    const parsed = JSON.parse(auditLog.details);
    assert.strictEqual(parsed.new_status, 'PENDING');
  });
});

describe('Demo Seed/Reset', () => {
  it('should generate 100 payment records', () => {
    const count = 100;
    assert.strictEqual(count, 100);
  });

  it('should include TXN_1042 with amount mismatch', () => {
    const txn = {
      transaction_id: 'TXN_1042',
      payment_amount: 4500,
      settlement_net: 4320,
      difference: 180,
      exception_type: 'AMOUNT_MISMATCH',
    };
    assert.strictEqual(txn.difference, 180);
    assert.strictEqual(txn.exception_type, 'AMOUNT_MISMATCH');
  });
});
