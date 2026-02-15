// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { renderSummary, upsertSmokeSection, START_MARKER, END_MARKER } from './update-report-smoke.mjs';

describe('update-report-smoke', () => {
  it('renders ok summary with markers and key fields', () => {
    const payload = {
      ok: true,
      summary: {
        analyze: { stages: ['create', 'drawing'], hasDxf: true },
        profileCompare: { profileA: '_default', profileB: 'sample_precision', scoreA: 90, scoreB: 95 },
        templateCrud: { success: true },
        exportPack: { hasDxfEntry: true },
        step: { success: true },
      },
    };

    const text = renderSummary(payload, '2026-02-15T01:00:00.000Z');
    expect(text).toContain(START_MARKER);
    expect(text).toContain(END_MARKER);
    expect(text).toContain('Result: `ok`');
    expect(text).toContain('Analyze stages: create, drawing');
    expect(text).toContain('`_default` vs `sample_precision` (90 / 95)');
  });

  it('renders failed summary with error details', () => {
    const payload = { ok: false, error: 'boom', mode: 'mock' };
    const text = renderSummary(payload, '2026-02-15T01:00:00.000Z');

    expect(text).toContain('Result: `failed`');
    expect(text).toContain('Error: boom');
    expect(text).toContain('Mode: mock');
  });

  it('upserts block into existing marker range', () => {
    const report = `# Report\n\n${START_MARKER}\nold\n${END_MARKER}\n\nTail`;
    const block = `${START_MARKER}\nnew\n${END_MARKER}`;

    const updated = upsertSmokeSection(report, block);
    expect(updated).toContain(`${START_MARKER}\nnew\n${END_MARKER}`);
    expect(updated).not.toContain('old');
    expect(updated).toContain('Tail');
  });

  it('appends section when marker does not exist', () => {
    const report = '# Report\n\nBody';
    const block = `${START_MARKER}\nnew\n${END_MARKER}`;

    const updated = upsertSmokeSection(report, block);
    expect(updated).toContain('### 11.5 최근 스모크 요약 (자동 생성)');
    expect(updated).toContain(block);
  });
});
