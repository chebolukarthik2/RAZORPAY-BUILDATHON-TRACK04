# ReconAI - AI Finance Controller

A production-ready payment-settlement reconciliation system with AI-powered analysis. Built for Razorpay Build-a-thon 2026 (Track 04: AI-Powered Financial Workflows).

**Live:** [razorpay-buildathon-track-04.vercel.app](https://razorpay-buildathon-track-04.vercel.app/)

## Quick Start

### 1. Clone and Install

```bash
git clone <your-repo-url>
cd reconai-finance-controller
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your credentials:

```env
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_KEY=your-service-role-key
GEMINI_API_KEY=your-gemini-key
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

Open http://localhost:8080, sign in, and click **Load Demo Dataset** on the dashboard. Or via API:

```bash
curl -X POST http://localhost:8080/api/datasets/demo/load
```

### 5. Start Server

```bash
npm start
```

Open **http://localhost:8080** in your browser.

## Deploy to Vercel (Recommended)

1. Push code to GitHub
2. Go to [vercel.com](https://vercel.com) → **Import Project**
3. Select your repo
4. Vercel auto-detects the config from `vercel.json`
5. Add environment variables in **Settings → Environment Variables**:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_KEY`
   - `GEMINI_API_KEY`
6. Deploy → Your app is live at `https://your-app.vercel.app`

## Deploy to Render

1. Push code to GitHub
2. Go to [render.com](https://render.com) → **New Web Service**
3. Select your repo
4. Settings:
   - **Build Command:** `npm install`
   - **Start Command:** `npm start`
5. Add environment variables (see `.env.example`)
6. Deploy → Your app is live at `https://your-app.onrender.com`

## Features

- **Payment-Settlement Reconciliation** - Deterministic matching with confidence scoring
- **CSV Dataset Upload** - Upload your own payment/settlement CSV files
- **Dataset Selector** - Switch between datasets and run reconciliation on any of them
- **Demo Dataset** - 100-record synthetic benchmark with TXN_1042 demo case
- **User Registration** - Sign up for a new account or use demo credentials
- **Exception Management** - View, filter, and manually review flagged transactions
- **Audit Trail** - Complete history of all reconciliation runs with dataset tracking
- **AI-Powered Analysis** - Gemini 2.5 Flash for exception analysis, batch insights, and finance Q&A
- **Dashboard** - Real-time KPIs, settlement summary, and exception breakdown

## Demo Credentials

- Email: `demo@reconai.app`
- Password: `ReconAI@2026`

Or create your own account using the Sign Up option on the login page.

## API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/health` | Health check (shows Gemini & Supabase status) |
| GET | `/api/dashboard/summary` | Dashboard data |
| GET | `/api/datasets` | List all datasets |
| POST | `/api/datasets/demo/load` | Load demo dataset |
| POST | `/api/datasets/upload` | Upload CSV files (multipart) |
| POST | `/api/reconciliation/runs` | Run reconciliation (accepts `dataset_id`) |
| GET | `/api/reconciliation/runs` | List all runs (includes `dataset_name`) |
| GET | `/api/reconciliation/runs/:id/results` | Get run results |
| GET | `/api/exceptions` | List exceptions |
| PATCH | `/api/exceptions/:id/manual-review` | Update review status |
| GET | `/api/audit/runs` | Audit trail |
| POST | `/api/ai/finance-qna` | AI Finance Q&A (Gemini) |
| POST | `/api/ai/batch-insight` | AI Batch Insight (Gemini) |
| POST | `/api/ai/exception-analysis` | AI Exception Analysis (Gemini) |

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

- **Backend**: Node.js 22 + Express 4 (Vercel Serverless)
- **Database**: Supabase (PostgreSQL)
- **AI**: Google Gemini 2.5 Flash
- **Frontend**: HTML + Tailwind CSS (CDN) + Vanilla JS
- **Auth**: Client-side mock (localStorage-based)
- **Hosting**: Vercel (frontend + API), Render (alternative)

## Project Structure

```
├── api/index.js              # Vercel serverless entrypoint
├── vercel.json               # Vercel routing config
├── package.json              # Root dependencies
├── server.js                 # Local dev server (port 8080)
├── frontend/
│   ├── login.html            # Sign in / Sign up page
│   ├── dashboard.html        # Dashboard with KPIs
│   ├── reconciliation.html   # Dataset selector + reconciliation results
│   ├── exceptions.html       # Exception management
│   ├── audit.html            # Audit trail
│   ├── finance-qna.html      # AI Finance Q&A chat
│   ├── config.js             # API URL config
│   ├── api.js                # API client
│   └── auth.js               # Auth (register, login, logout)
├── backend/src/
│   ├── index.js              # Express app
│   ├── config/
│   │   ├── database.js       # Supabase client
│   │   └── schema.sql        # Database schema
│   ├── routes/               # API routes
│   ├── services/             # Business logic
│   └── middleware/           # Validation
└── .env.example              # Environment template
```

## License

MIT
