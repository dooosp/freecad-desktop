/**
 * Cost estimation orchestrator.
 * Wraps the Python cost_estimator.py script.
 */

/**
 * Run cost estimation for a config.
 * @param {string} freecadRoot - Path to freecad-automation root
 * @param {object} config - Full config object
 * @param {object} options - { material, process, batchSize, dfmResult }
 * @returns {Promise<object>} Cost estimation result
 */
export async function estimateCost(freecadRoot, config, options = {}) {
  const { runScript } = await import(`${freecadRoot}/lib/runner.js`);

  const costInput = {
    ...config,
    material: options.material || config.manufacturing?.material || 'SS304',
    process: options.process || config.manufacturing?.process || 'machining',
    batch_size: options.batchSize || 1,
    dfm_result: options.dfmResult || null,
  };

  return runScript('cost_estimator.py', costInput, { timeout: 60_000 });
}

/**
 * Compare costs across multiple processes.
 * @param {string} freecadRoot
 * @param {object} config
 * @param {string[]} processes - List of process names
 * @returns {Promise<object[]>} Comparison results
 */
export async function compareCosts(freecadRoot, config, processes = ['machining', 'casting', 'sheet_metal', '3d_printing']) {
  const results = [];
  for (const proc of processes) {
    try {
      const result = await estimateCost(freecadRoot, config, { process: proc });
      results.push({ process: proc, ...result });
    } catch (err) {
      results.push({ process: proc, error: err.message });
    }
  }
  return results;
}
