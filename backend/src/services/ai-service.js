import { GoogleGenerativeAI } from '@google/generative-ai';
import supabase from '../config/database.js';

let genAI = null;
let model = null;

function initGemini() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY not set. AI features will be unavailable.');
    console.warn('Available env vars:', Object.keys(process.env).filter(k => k.includes('GEMINI') || k.includes('SUPABASE') || k.includes('API')).join(', '));
    return false;
  }
  try {
    genAI = new GoogleGenerativeAI(apiKey);
    model = genAI.getGenerativeModel({ model: 'gemini-2.0-flash' });
    console.log('Gemini AI initialized successfully');
    return true;
  } catch (err) {
    console.error('Failed to initialize Gemini:', err.message);
    return false;
  }
}

function validateAIResponse(response, requiredFields) {
  if (!response || typeof response !== 'object') return false;
  return requiredFields.every(field => field in response && response[field] !== null && response[field] !== undefined);
}

export async function analyzeException(exceptionData) {
  if (!model && !initGemini()) {
    return {
      status: 'unavailable',
      classification: exceptionData.exception_type || 'Unknown',
      explanation: 'AI analysis unavailable. Deterministic reconciliation completed successfully.',
      evidence_summary: 'AI service is not configured.',
      recommended_action: 'Review the transaction manually using the deterministic reconciliation data.',
    };
  }

  try {
    const prompt = `You are an AI Finance Controller for a payment reconciliation system.
Analyze this exception and provide a structured response.

Transaction Data:
- Transaction ID: ${exceptionData.transaction_id}
- Payment Amount: ₹${exceptionData.payment_amount}
- Settlement Gross Amount: ₹${exceptionData.settlement_gross || 'N/A'}
- Settlement Net Amount: ₹${exceptionData.settlement_net || 'N/A'}
- Fee: ₹${exceptionData.fee || 0}
- Refund: ₹${exceptionData.refund || 0}
- Expected Net: ₹${exceptionData.expected_net || exceptionData.payment_amount}
- Actual Net: ₹${exceptionData.actual_net || exceptionData.settlement_net || 'N/A'}
- Difference: ₹${exceptionData.difference}
- Settlement Date: ${exceptionData.settlement_date || 'N/A'}
- Deterministic Status: ${exceptionData.status}
- Deterministic Reason: ${exceptionData.deterministic_reason}

Respond in JSON format only:
{
  "classification": "string - category of exception",
  "explanation": "string - clear explanation of what happened",
  "evidence_summary": "string - summary of evidence analyzed",
  "recommended_action": "string - specific next steps"
}

Rules:
- Never invent transaction details
- Never change calculated differences
- Only reason over the supplied evidence
- State when evidence is insufficient
- Be specific and actionable`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Try to parse JSON from the response
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      if (validateAIResponse(parsed, ['classification', 'explanation', 'recommended_action'])) {
        return {
          status: 'available',
          ...parsed,
        };
      }
    }

    return {
      status: 'available',
      classification: exceptionData.exception_type || 'Unknown',
      explanation: text.substring(0, 500),
      evidence_summary: `Difference of ₹${exceptionData.difference} detected.`,
      recommended_action: 'Review the transaction manually.',
    };
  } catch (error) {
    console.error('AI analysis failed:', error.message, error.stack);
    return {
      status: 'unavailable',
      classification: exceptionData.exception_type || 'Unknown',
      explanation: 'AI analysis unavailable. Deterministic reconciliation completed successfully.',
      evidence_summary: `Difference of ₹${exceptionData.difference} detected.`,
      recommended_action: 'Review the transaction manually using the deterministic reconciliation data.',
    };
  }
}

export async function generateBatchInsight(summaryData) {
  if (!model && !initGemini()) {
    return {
      status: 'unavailable',
      finding: 'AI insight unavailable.',
      pattern: 'AI service is not configured.',
      implication: 'Please review the reconciliation data manually.',
    };
  }

  try {
    const prompt = `You are an AI Finance Controller analyzing a reconciliation batch summary.

Batch Summary:
- Total Records: ${summaryData.totalRecords}
- Matched: ${summaryData.matched} (${summaryData.matchRate}%)
- Partial: ${summaryData.partial}
- Unresolved: ${summaryData.unresolved}
- Match Rate: ${summaryData.matchRate}%
- Accuracy: ${summaryData.accuracy}%
- Precision: ${summaryData.precision}%
- Recall: ${summaryData.recall}%
- Exception Detection Rate: ${summaryData.exceptionDetectionRate}%
- Duration: ${summaryData.durationMs}ms

Exception Breakdown:
${JSON.stringify(summaryData.exceptionBreakdown || {}, null, 2)}

Respond in JSON format only:
{
  "finding": "string - most important finding",
  "pattern": "string - exception pattern observed",
  "implication": "string - operational implication"
}

Rules:
- Do not modify any calculated numbers
- Base analysis only on provided data
- Be concise and actionable`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    const jsonMatch = text.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      return { status: 'available', ...JSON.parse(jsonMatch[0]) };
    }

    return {
      status: 'available',
      finding: text.substring(0, 300),
      pattern: 'See finding for details.',
      implication: 'Review the reconciliation data for operational improvements.',
    };
  } catch (error) {
    console.error('AI batch insight failed:', error.message, error.stack);
    return {
      status: 'unavailable',
      finding: 'AI insight unavailable due to service error.',
      pattern: 'Unable to analyze patterns.',
      implication: 'Please review the reconciliation data manually.',
    };
  }
}

export async function financeQA(question, contextData) {
  if (!model && !initGemini()) {
    return {
      status: 'unavailable',
      answer: 'AI Finance Q&A is unavailable. GEMINI_API_KEY is not configured.',
      sources: [],
    };
  }

  try {
    const prompt = `You are an AI Finance Controller for a payment reconciliation system.
Answer the user's question based ONLY on the provided data. Never invent data.

User Question: "${question}"

Available Data:
- Total Records Processed: ${contextData.totalRecords || 0}
- Match Rate: ${contextData.matchRate || 0}%
- Matched: ${contextData.matched || 0}
- Partial: ${contextData.partial || 0}
- Unresolved: ${contextData.unresolved || 0}
- Gross Payment Value: ₹${contextData.grossPayment || 0}
- Net Settled: ₹${contextData.netSettled || 0}
- Processing Fees: ₹${contextData.fees || 0}
- Refunds: ₹${contextData.refunds || 0}

Exception Types:
${JSON.stringify(contextData.exceptionBreakdown || {}, null, 2)}

Top Discrepancies:
${JSON.stringify(contextData.topDiscrepancies || [], null, 2)}

Rules:
- Never invent transactions, amounts, or data
- Only use the provided data
- State when data is insufficient
- Calculate exact values from the data
- Be specific and reference transaction IDs when relevant`;

    const result = await model.generateContent(prompt);
    const text = result.response.text();

    return {
      status: 'available',
      answer: text,
      sources: ['Reconciliation Database', 'Deterministic Analysis'],
    };
  } catch (error) {
    console.error('AI Q&A failed:', error.message, error.stack);
    return {
      status: 'unavailable',
      answer: 'AI Q&A is temporarily unavailable. Please try again later.',
      sources: [],
    };
  }
}
