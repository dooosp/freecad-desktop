import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const START_MARKER = '<!-- SMOKE_SUMMARY:START -->';
export const END_MARKER = '<!-- SMOKE_SUMMARY:END -->';

const inputPath = process.env.SMOKE_SUMMARY_INPUT || 'artifacts/smoke-core-summary.json';
const reportPath = process.env.SMOKE_REPORT_PATH || 'REPORT.md';

function listToText(list) {
  if (!Array.isArray(list) || list.length === 0) return '-';
  return list.join(', ');
}

export function renderSummary(payload, now = new Date().toISOString()) {
  const lines = [];

  lines.push(START_MARKER);
  lines.push(`_Updated: ${now}_`);

  if (!payload || typeof payload !== 'object') {
    lines.push('- Result: `invalid`');
    lines.push('');
    lines.push('```json');
    lines.push('{}');
    lines.push('```');
    lines.push(END_MARKER);
    return lines.join('\n');
  }

  lines.push(`- Result: \`${payload.ok ? 'ok' : 'failed'}\``);

  if (payload.ok && payload.summary) {
    const s = payload.summary;
    lines.push(`- Analyze stages: ${listToText(s.analyze?.stages)}`);
    lines.push(`- Analyze DXF output: ${s.analyze?.hasDxf ? 'yes' : 'no'}`);
    lines.push(`- Profile compare: \`${s.profileCompare?.profileA || '-'}\` vs \`${s.profileCompare?.profileB || '-'}\` (${s.profileCompare?.scoreA ?? '-'} / ${s.profileCompare?.scoreB ?? '-'})`);
    lines.push(`- Template CRUD: ${s.templateCrud?.success ? 'pass' : 'fail'}`);
    lines.push(`- Export DXF in ZIP: ${s.exportPack?.hasDxfEntry ? 'yes' : 'no'}`);
    lines.push(`- STEP flow: ${s.step?.success ? 'pass' : 'fail'}`);
  } else {
    lines.push(`- Error: ${payload.error || 'unknown'}`);
    if (payload.mode) lines.push(`- Mode: ${payload.mode}`);
  }

  lines.push('');
  lines.push('```json');
  lines.push(JSON.stringify(payload, null, 2));
  lines.push('```');
  lines.push(END_MARKER);
  return lines.join('\n');
}

export function upsertSmokeSection(reportText, block) {
  const hasStart = reportText.includes(START_MARKER);
  const hasEnd = reportText.includes(END_MARKER);

  if (hasStart && hasEnd) {
    const start = reportText.indexOf(START_MARKER);
    const end = reportText.indexOf(END_MARKER, start);
    const before = reportText.slice(0, start);
    const after = reportText.slice(end + END_MARKER.length);
    return `${before}${block}${after}`;
  }

  const section = `\n\n### 11.5 최근 스모크 요약 (자동 생성)\n\n${block}\n`;
  return `${reportText.trimEnd()}${section}\n`;
}

export async function main() {
  const raw = await readFile(inputPath, 'utf8');
  const payload = JSON.parse(raw);
  const reportText = await readFile(reportPath, 'utf8');
  const block = renderSummary(payload);
  const next = upsertSmokeSection(reportText, block);
  await writeFile(reportPath, next, 'utf8');
  console.log(`Updated ${reportPath} using ${inputPath}`);
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await main();
}
