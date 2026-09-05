-- ReconAI Database Schema for Supabase PostgreSQL
-- Run this in Supabase SQL Editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Datasets table
CREATE TABLE IF NOT EXISTS datasets (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  source_type VARCHAR(50) NOT NULL DEFAULT 'synthetic',
  record_count INTEGER NOT NULL DEFAULT 0,
  benchmark_type VARCHAR(100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Payments table
CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  transaction_id VARCHAR(50) NOT NULL,
  order_id VARCHAR(50),
  customer_id VARCHAR(50),
  payment_date DATE NOT NULL,
  amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Captured',
  payment_method VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dataset_id, transaction_id)
);

-- Settlements table
CREATE TABLE IF NOT EXISTS settlements (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  transaction_id VARCHAR(50) NOT NULL,
  settlement_date DATE NOT NULL,
  gross_amount NUMERIC(12,2) NOT NULL,
  fee_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  refund_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  net_amount NUMERIC(12,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'Settled',
  bank_utr VARCHAR(50),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Benchmark ground truth table
CREATE TABLE IF NOT EXISTS benchmark_ground_truth (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  transaction_id VARCHAR(50) NOT NULL,
  expected_status VARCHAR(20) NOT NULL,
  expected_exception_type VARCHAR(50),
  expected_related_settlement VARCHAR(50),
  expected_difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(dataset_id, transaction_id)
);

-- Reconciliation runs table
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  dataset_id UUID NOT NULL REFERENCES datasets(id) ON DELETE CASCADE,
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  total_records INTEGER NOT NULL DEFAULT 0,
  matched_count INTEGER NOT NULL DEFAULT 0,
  partial_count INTEGER NOT NULL DEFAULT 0,
  unresolved_count INTEGER NOT NULL DEFAULT 0,
  match_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  accuracy NUMERIC(5,2) NOT NULL DEFAULT 0,
  precision_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  recall_score NUMERIC(5,2) NOT NULL DEFAULT 0,
  exception_detection_rate NUMERIC(5,2) NOT NULL DEFAULT 0,
  correct_decisions INTEGER NOT NULL DEFAULT 0,
  false_matches INTEGER NOT NULL DEFAULT 0,
  missed_exceptions INTEGER NOT NULL DEFAULT 0,
  started_at TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  duration_ms INTEGER,
  algorithm_version VARCHAR(50) NOT NULL DEFAULT 'v1.0-prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Reconciliation results table
CREATE TABLE IF NOT EXISTS reconciliation_results (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  transaction_id VARCHAR(50) NOT NULL,
  payment_id UUID REFERENCES payments(id),
  settlement_id UUID REFERENCES settlements(id),
  status VARCHAR(20) NOT NULL,
  confidence INTEGER NOT NULL DEFAULT 0,
  expected_amount NUMERIC(12,2),
  actual_amount NUMERIC(12,2),
  difference NUMERIC(12,2) NOT NULL DEFAULT 0,
  exception_type VARCHAR(50),
  deterministic_reason TEXT,
  ai_classification VARCHAR(100),
  ai_explanation TEXT,
  recommended_action TEXT,
  ai_status VARCHAR(20) DEFAULT 'pending',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(run_id, transaction_id)
);

-- Exceptions table
CREATE TABLE IF NOT EXISTS exceptions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID NOT NULL REFERENCES reconciliation_runs(id) ON DELETE CASCADE,
  reconciliation_result_id UUID REFERENCES reconciliation_results(id),
  transaction_id VARCHAR(50) NOT NULL,
  exception_type VARCHAR(50) NOT NULL,
  priority VARCHAR(20) NOT NULL DEFAULT 'Medium',
  confidence INTEGER NOT NULL DEFAULT 0,
  difference_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'Unresolved',
  ai_explanation TEXT,
  recommended_action TEXT,
  manual_review_status VARCHAR(20) DEFAULT 'NONE',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  run_id UUID REFERENCES reconciliation_runs(id) ON DELETE SET NULL,
  transaction_id VARCHAR(50),
  event_type VARCHAR(50) NOT NULL,
  action VARCHAR(100) NOT NULL,
  details JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_payments_dataset ON payments(dataset_id);
CREATE INDEX IF NOT EXISTS idx_payments_transaction ON payments(transaction_id);
CREATE INDEX IF NOT EXISTS idx_payments_date ON payments(payment_date);

CREATE INDEX IF NOT EXISTS idx_settlements_dataset ON settlements(dataset_id);
CREATE INDEX IF NOT EXISTS idx_settlements_transaction ON settlements(transaction_id);
CREATE INDEX IF NOT EXISTS idx_settlements_date ON settlements(settlement_date);

CREATE INDEX IF NOT EXISTS idx_ground_truth_dataset ON benchmark_ground_truth(dataset_id);
CREATE INDEX IF NOT EXISTS idx_ground_truth_transaction ON benchmark_ground_truth(transaction_id);

CREATE INDEX IF NOT EXISTS idx_recon_runs_dataset ON reconciliation_runs(dataset_id);
CREATE INDEX IF NOT EXISTS idx_recon_runs_status ON reconciliation_runs(status);
CREATE INDEX IF NOT EXISTS idx_recon_runs_created ON reconciliation_runs(created_at);

CREATE INDEX IF NOT EXISTS idx_recon_results_run ON reconciliation_results(run_id);
CREATE INDEX IF NOT EXISTS idx_recon_results_transaction ON reconciliation_results(transaction_id);
CREATE INDEX IF NOT EXISTS idx_recon_results_status ON reconciliation_results(status);

CREATE INDEX IF NOT EXISTS idx_exceptions_run ON exceptions(run_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_transaction ON exceptions(transaction_id);
CREATE INDEX IF NOT EXISTS idx_exceptions_type ON exceptions(exception_type);
CREATE INDEX IF NOT EXISTS idx_exceptions_status ON exceptions(status);
CREATE INDEX IF NOT EXISTS idx_exceptions_priority ON exceptions(priority);

CREATE INDEX IF NOT EXISTS idx_audit_logs_run ON audit_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_transaction ON audit_logs(transaction_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_event ON audit_logs(event_type);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created ON audit_logs(created_at);
