import { randomUUID } from 'crypto';

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '"') {
        if (i + 1 < line.length && line[i + 1] === '"') {
          current += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        current += ch;
      }
    } else {
      if (ch === '"') {
        inQuotes = true;
      } else if (ch === ',') {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
  }
  result.push(current.trim());
  return result;
}

function parseCSV(buffer) {
  const text = buffer.toString('utf-8');
  const lines = text.split(/\r?\n/).filter(l => l.trim());
  if (lines.length < 2) throw new Error('CSV must have a header row and at least one data row');

  const headers = parseCSVLine(lines[0]).map(h => h.toLowerCase().replace(/\s+/g, '_'));
  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    const row = {};
    headers.forEach((h, idx) => {
      row[h] = values[idx] || '';
    });
    rows.push(row);
  }

  return { headers, rows };
}

function normalizePayment(row, datasetId) {
  return {
    dataset_id: datasetId,
    transaction_id: row.transaction_id || row.txn_id || row.id || row.payment_id || '',
    order_id: row.order_id || row.merchant_order_id || '',
    customer_id: row.customer_id || row.user_id || '',
    payment_date: row.payment_date || row.date || row.created_at || new Date().toISOString().slice(0, 10),
    amount: parseFloat(row.amount || row.payment_amount || row.net || row.value || 0),
    status: row.status || row.payment_status || 'Captured',
    payment_method: row.payment_method || row.method || row.payment_mode || '',
  };
}

function normalizeSettlement(row, datasetId) {
  return {
    dataset_id: datasetId,
    transaction_id: row.transaction_id || row.txn_id || row.id || row.payment_id || '',
    settlement_date: row.settlement_date || row.date || row.settled_at || new Date().toISOString().slice(0, 10),
    gross_amount: parseFloat(row.gross_amount || row.gross || row.amount || row.value || 0),
    fee_amount: parseFloat(row.fee_amount || row.fee || row.platform_fee || 0),
    refund_amount: parseFloat(row.refund_amount || row.refund || 0),
    net_amount: parseFloat(row.net_amount || row.net || row.settled_amount || row.amount || 0),
    status: row.status || row.settlement_status || 'Settled',
    bank_utr: row.bank_utr || row.utr || '',
  };
}

export function parsePaymentCSV(buffer, datasetId) {
  const { rows } = parseCSV(buffer);
  return rows.map(row => normalizePayment(row, datasetId)).filter(p => p.transaction_id && p.amount > 0);
}

export function parseSettlementCSV(buffer, datasetId) {
  const { rows } = parseCSV(buffer);
  return rows.map(row => normalizeSettlement(row, datasetId)).filter(s => s.transaction_id && s.net_amount > 0);
}

export function getCSVHeaders(buffer) {
  const text = buffer.toString('utf-8');
  const firstLine = text.split(/\r?\n/)[0];
  return parseCSVLine(firstLine).map(h => h.toLowerCase().replace(/\s+/g, '_'));
}
