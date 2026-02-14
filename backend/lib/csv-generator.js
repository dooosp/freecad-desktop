/**
 * Generate BOM CSV from config
 */
export function generateBomCsv(config) {
  const rows = [['No', 'Part ID', 'Type', 'Material', 'Dimensions']];

  // Single-part config
  if (Array.isArray(config.shapes)) {
    config.shapes.forEach((shape, idx) => {
      const material = config.material?.name || config.manufacturing?.material || 'N/A';
      const dims = extractDimensions(shape);
      rows.push([
        idx + 1,
        shape.id || `shape_${idx + 1}`,
        shape.type || 'N/A',
        material,
        dims,
      ]);
    });
  }

  // Assembly config
  if (Array.isArray(config.parts)) {
    config.parts.forEach((part, idx) => {
      const material = part.material || config.material?.name || 'N/A';
      const dims = 'See part config';
      rows.push([
        idx + 1,
        part.id || `part_${idx + 1}`,
        part.type || 'component',
        material,
        dims,
      ]);
    });
  }

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Generate cost breakdown CSV
 */
export function generateCostCsv(costResult) {
  if (!costResult || !costResult.breakdown) {
    return 'Category,Amount (KRW),Percentage\n';
  }

  const { breakdown, total_cost } = costResult;
  const rows = [['Category', 'Amount (KRW)', 'Percentage']];

  for (const [category, amount] of Object.entries(breakdown)) {
    const percentage = total_cost > 0 ? ((amount / total_cost) * 100).toFixed(1) : '0.0';
    rows.push([
      formatCategory(category),
      amount.toFixed(0),
      `${percentage}%`,
    ]);
  }

  rows.push(['Total', total_cost.toFixed(0), '100.0%']);

  return rows.map(row => row.join(',')).join('\n');
}

/**
 * Extract dimension string from shape
 */
function extractDimensions(shape) {
  const parts = [];
  if (shape.diameter) parts.push(`Ø${shape.diameter}`);
  if (shape.width) parts.push(`W${shape.width}`);
  if (shape.length) parts.push(`L${shape.length}`);
  if (shape.height) parts.push(`H${shape.height}`);
  if (shape.thickness) parts.push(`t${shape.thickness}`);
  return parts.join(' × ') || 'N/A';
}

/**
 * Format category name for display
 */
function formatCategory(category) {
  return category
    .split('_')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}
