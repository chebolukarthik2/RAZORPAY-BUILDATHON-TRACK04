// ReconAI Frontend API Client
const API_BASE = window.RECONAI_API_URL || 'http://localhost:3000/api';

const api = {
  async fetch(endpoint, options = {}) {
    try {
      const res = await fetch(`${API_BASE}${endpoint}`, {
        headers: { 'Content-Type': 'application/json', ...options.headers },
        ...options,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: res.statusText }));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      return await res.json();
    } catch (error) {
      console.error(`API Error [${endpoint}]:`, error);
      throw error;
    }
  },

  // Datasets
  async loadDemoDataset() { return this.fetch('/datasets/demo/load', { method: 'POST' }); },
  async resetDemoDataset() { return this.fetch('/datasets/demo/reset', { method: 'POST' }); },
  async getDatasets() { return this.fetch('/datasets'); },
  async getDataset(id) { return this.fetch(`/datasets/${id}`); },

  // Dashboard
  async getDashboardSummary() { return this.fetch('/dashboard/summary'); },

  // Reconciliation
  async runReconciliation() { return this.fetch('/reconciliation/runs', { method: 'POST' }); },
  async getReconciliationRuns() { return this.fetch('/reconciliation/runs'); },
  async getReconciliationRun(id) { return this.fetch(`/reconciliation/runs/${id}`); },
  async getReconciliationResults(runId, params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.fetch(`/reconciliation/runs/${runId}/results${query ? '?' + query : ''}`);
  },

  // Exceptions
  async getExceptions(params = {}) {
    const query = new URLSearchParams(params).toString();
    return this.fetch(`/exceptions${query ? '?' + query : ''}`);
  },
  async getException(id) { return this.fetch(`/exceptions/${id}`); },
  async markForManualReview(id, status) {
    return this.fetch(`/exceptions/${id}/manual-review`, {
      method: 'PATCH',
      body: JSON.stringify({ status }),
    });
  },

  // Audit
  async getAuditRuns() { return this.fetch('/audit/runs'); },
  async getAuditRun(id) { return this.fetch(`/audit/runs/${id}`); },
  async getAuditEvents(runId) { return this.fetch(`/audit/runs/${runId}/events`); },

  // Evaluation
  async getEvaluation(runId) { return this.fetch(`/evaluation/${runId}`); },

  // AI
  async analyzeException(transactionId, runId) {
    return this.fetch('/ai/exception-analysis', {
      method: 'POST',
      body: JSON.stringify({ transaction_id: transactionId, run_id: runId }),
    });
  },
  async getBatchInsight() { return this.fetch('/ai/batch-insight', { method: 'POST' }); },
  async askFinanceQA(question) {
    return this.fetch('/ai/finance-qna', {
      method: 'POST',
      body: JSON.stringify({ question }),
    });
  },
};

// Utility functions for formatting
const fmt = {
  currency(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 0, maximumFractionDigits: 0 }).format(amount);
  },
  currencyFull(amount) {
    if (amount === null || amount === undefined) return '—';
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: 2 }).format(amount);
  },
  percent(value) {
    if (value === null || value === undefined) return '0%';
    return `${Number(value).toFixed(1)}%`;
  },
  date(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  },
  datetime(dateStr) {
    if (!dateStr) return '—';
    const d = new Date(dateStr);
    return d.toLocaleString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' });
  },
  statusBadge(status) {
    const colors = {
      MATCHED: { bg: '#ecfdf5', text: '#065f46', dot: '#10b981' },
      PARTIAL: { bg: '#fffbeb', text: '#92400e', dot: '#f59e0b' },
      UNRESOLVED: { bg: '#fef2f2', text: '#991b1b', dot: '#ef4444' },
    };
    const c = colors[status] || colors.MATCHED;
    return `<span class="inline-flex items-center gap-1.5 px-2 py-0.5 rounded font-label-sm text-label-sm font-semibold" style="background:${c.bg};color:${c.text}"><span class="w-1.5 h-1.5 rounded-full" style="background:${c.dot}"></span> ${status}</span>`;
  },
  confidenceBar(pct) {
    const color = pct >= 75 ? '#10b981' : pct >= 50 ? '#f59e0b' : '#ef4444';
    return `<div class="flex items-center gap-2"><div class="w-16 h-1.5 bg-surface-container rounded-full overflow-hidden"><div class="h-full rounded-full" style="width:${pct}%;background:${color}"></div></div><span class="font-mono-num-sm text-mono-num-sm font-medium">${pct}%</span></div>`;
  },
};
