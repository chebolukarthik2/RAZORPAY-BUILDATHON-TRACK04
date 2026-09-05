# ReconAI - AI Finance Controller

A production-ready payment-settlement reconciliation system with AI-powered analysis. Built for Razorpay Build-a-thon 2026 (Track 04: AI-Powered Financial Workflows).

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd reconai-finance-controller

# Install backend dependencies
cd backend
npm install
cd ..
```

### 2. Configure Environment

```bash
cp .env.example backend/.env
```

Edit `backend/.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key        # Optional
PORT=3000
CORS_ORIGIN=http://localhost:8080
```

### 3. Set Up Database

Run `backend/src/config/schema.sql` in your Supabase SQL Editor to create all tables.

Then run these commands in SQL Editor:

```sql
-- Disable RLS for development
ALTER TABLE datasets DISABLE ROW LEVEL SECURITY;
ALTER TABLE payments DISABLE ROW LEVEL SECURITY;
ALTER TABLE settlements DISABLE ROW LEVEL SECURITY;
ALTER TABLE benchmark_ground_truth DISABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_runs DISABLE ROW LEVEL SECURITY;
ALTER TABLE reconciliation_results DISABLE ROW LEVEL SECURITY;
ALTER TABLE exceptions DISABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs DISABLE ROW LEVEL SECURITY;

-- Grant permissions
GRANT ALL ON ALL TABLES IN SCHEMA public TO service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO service_role;
```

### 4. Load Demo Data

```bash
cd backend
npm run seed
```

### 5. Start Servers

```bash
# Terminal 1 - Backend (port 3000)
cd backend
npm start

# Terminal 2 - Frontend (port 8080)
npm start
```

Open **http://localhost:8080** in your browser.

## Features

- **Payment-Settlement Reconciliation** - Deterministic matching with confidence scoring
- **CSV Dataset Upload** - Upload your own payment/settlement CSV files
- **Demo Dataset** - 100-record synthetic benchmark with TXN_1042 demo case
- **Exception Management** - View, filter, and manually review flagged transactions
- **Audit Trail** - Complete history of all reconciliation runs
- **AI-Powered Analysis** - Gemini integration for exception explanations and finance Q&A
- **Dashboard** - Real-time KPIs, settlement summary, and exception breakdown

## Demo Credentials

- Email: `demo@reconai.app`
- Password: `ReconAI@2026`

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check |
| GET | `/api/dashboard/summary` | Dashboard data |
| POST | `/api/datasets/demo/load` | Load demo dataset |
| POST | `/api/datasets/upload` | Upload CSV files |
| POST | `/api/reconciliation/runs` | Run reconciliation |
| GET | `/api/reconciliation/runs` | List all runs |
| GET | `/api/reconciliation/runs/:id/results` | Get run results |
| GET | `/api/exceptions` | List exceptions |
| PATCH | `/api/exceptions/:id/manual-review` | Update review status |
| GET | `/api/audit/runs` | Audit trail |
| POST | `/api/ai/finance-qna` | AI Finance Q&A |

## CSV Upload Format

### Payments CSV
```
transaction_id,order_id,customer_id,payment_date,amount,status,payment_method
TXN-001,ORD-001,CUST-001,2025-08-01,5000.00,Captured,UPI
```

### Settlements CSV
```
transaction_id,settlement_date,gross_amount,fee_amount,refund_amount,net_amount,status
TXN-001,2025-08-08,5000.00,100.00,0.00,4900.00,Settled
```

Column names are auto-mapped (e.g., `txn_id` → `transaction_id`, `date` → `payment_date`).

## Tech Stack

- **Backend**: Node.js 22 + Express 4
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini 2.0 Flash
- **Frontend**: HTML + Tailwind CSS (CDN) + Vanilla JS

## License

MIT
