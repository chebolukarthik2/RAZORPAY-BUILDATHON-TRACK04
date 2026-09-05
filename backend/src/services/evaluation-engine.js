import supabase from '../config/database.js';

export async function evaluateRun(runId) {
  // Get the run
  const { data: run, error: runError } = await supabase
    .from('reconciliation_runs')
    .select('*')
    .eq('id', runId)
    .single();

  if (runError || !run) {
    throw new Error(`Run not found: ${runId}`);
  }

  // Get ground truth for this dataset
  const { data: groundTruth, error: gtError } = await supabase
    .from('benchmark_ground_truth')
    .select('*')
    .eq('dataset_id', run.dataset_id);

  if (gtError) throw gtError;

  // Get reconciliation results for this run
  const { data: results, error: resError } = await supabase
    .from('reconciliation_results')
    .select('*')
    .eq('run_id', runId);

  if (resError) throw resError;

  // Create lookup maps
  const gtMap = {};
  for (const gt of groundTruth) {
    gtMap[gt.transaction_id] = gt;
  }

  // Calculate metrics
  let correctDecisions = 0;
  let totalRecords = results.length;
  let truePositives = 0; // predicted MATCHED, actual MATCHED
  let falsePositives = 0; // predicted MATCHED, actual not MATCHED
  let falseNegatives = 0; // predicted not MATCHED, actual MATCHED
  let trueNegatives = 0; // predicted not MATCHED, actual not MATCHED
  let correctlyDetectedExceptions = 0;
  let allActualExceptions = 0;

  for (const result of results) {
    const gt = gtMap[result.transaction_id];
    if (!gt) continue;

    const predictedMatched = result.status === 'MATCHED';
    const actualMatched = gt.expected_status === 'MATCHED';

    if (predictedMatched && actualMatched) {
      truePositives++;
      correctDecisions++;
    } else if (predictedMatched && !actualMatched) {
      falsePositives++;
    } else if (!predictedMatched && actualMatched) {
      falseNegatives++;
    } else {
      trueNegatives++;
      correctDecisions++;
    }

    if (!actualMatched) allActualExceptions++;
    if (!predictedMatched && !actualMatched) correctlyDetectedExceptions++;
  }

  const accuracy = totalRecords > 0 ? (correctDecisions / totalRecords * 100) : 0;
  const allPredictedMatches = truePositives + falsePositives;
  const allActualMatches = truePositives + falseNegatives;
  const precision = allPredictedMatches > 0 ? (truePositives / allPredictedMatches * 100) : 0;
  const recall = allActualMatches > 0 ? (truePositives / allActualMatches * 100) : 0;
  const exceptionDetectionRate = allActualExceptions > 0 ? (correctlyDetectedExceptions / allActualExceptions * 100) : 0;

  return {
    runId,
    totalRecords,
    correctDecisions,
    accuracy: Math.round(accuracy * 10) / 10,
    precision: Math.round(precision * 10) / 10,
    recall: Math.round(recall * 10) / 10,
    exceptionDetectionRate: Math.round(exceptionDetectionRate * 10) / 10,
    falseMatches: falsePositives,
    missedExceptions: falseNegatives,
    truePositives,
    trueNegatives,
    falsePositives,
    falseNegatives,
  };
}
