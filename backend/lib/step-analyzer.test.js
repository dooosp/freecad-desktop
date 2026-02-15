// @vitest-environment node
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { analyzeStep, generateConfigFromAnalysis } from './step-analyzer.js';

const tempRoots = [];

async function createFreecadRoot(runnerSource) {
  const root = await mkdtemp(join(tmpdir(), 'step-analyzer-test-'));
  tempRoots.push(root);
  await mkdir(join(root, 'lib'), { recursive: true });
  await writeFile(join(root, 'lib', 'runner.js'), runnerSource, 'utf8');
  return root;
}

afterEach(async () => {
  await Promise.allSettled(
    tempRoots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

describe('analyzeStep', () => {
  it('normalizes feature detector output with array counts and default suggested config', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript(script) {
        if (script === 'step_feature_detector.py') {
          return {
            success: true,
            features: {
              cylinders: [{}, {}],
              bolt_circles: [{}],
            },
          };
        }
        throw new Error('unexpected script');
      }
    `);

    const result = await analyzeStep(freecadRoot, '/tmp/sample_part.step');

    expect(result.success).toBe(true);
    expect(result.source_step).toBe('/tmp/sample_part.step');
    expect(result.cylinders).toBe(2);
    expect(result.bolt_circles).toBe(1);
    expect(result.suggested_config.name).toBe('imported_sample_part');
    expect(result.suggested_config.import.source_step).toBe('/tmp/sample_part.step');
    expect(result.suggested_config.import.template_only).toBe(true);
  });

  it('falls back to inspect_model and builds normalized bbox/feature metadata', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript(script) {
        if (script === 'step_feature_detector.py') {
          throw new Error('feature detector crashed\\ntrace details');
        }
        if (script === 'inspect_model.py') {
          return {
            model: {
              bounding_box: {
                min: [10, 3, 1],
                max: [5, 9, 4],
              },
              volume: '12.5',
              area: '20',
              faces: '6',
              edges: '12',
            },
          };
        }
        throw new Error('unexpected script');
      }
    `);

    const result = await analyzeStep(freecadRoot, '/tmp/fallback_input.step');

    expect(result.success).toBe(true);
    expect(result.fallback).toBe(true);
    expect(result.warning).toContain('Feature detector failed; using inspect fallback: feature detector crashed');
    expect(result.bounding_box).toEqual({ x: 5, y: 6, z: 3 });
    expect(result.volume).toBe(12.5);
    expect(result.area).toBe(20);
    expect(result.features.face_count).toBe(6);
    expect(result.features.edge_count).toBe(12);
    expect(result.suggested_config.drawing.title).toBe('fallback_input.step');
  });

  it('keeps explicit false success and numeric fallback counts', async () => {
    const freecadRoot = await createFreecadRoot(`
      export async function runScript() {
        return {
          success: false,
          cylinders: '3',
          bolt_circles: 'bad-number',
          features: {},
          suggested_config: { name: 'custom_part' },
        };
      }
    `);

    const result = await analyzeStep(freecadRoot, '/tmp/explicit_fail.step');
    expect(result.success).toBe(false);
    expect(result.cylinders).toBe(3);
    expect(result.bolt_circles).toBe(0);
    expect(result.suggested_config).toEqual({ name: 'custom_part' });
  });
});

describe('generateConfigFromAnalysis', () => {
  it('renders import/export/drawing/manufacturing/tolerance blocks', () => {
    const configToml = generateConfigFromAnalysis(
      {
        source_step: 'C:\\input\\part.step',
        suggested_config: {
          name: 'imported_part',
          import: {
            source_step: 'C:\\input\\part.step',
            template_only: true,
          },
          export: { step: true, stl: true },
          drawing: { scale: '1:2', title: 'Imported Part' },
          manufacturing: { process: 'machining' },
        },
      },
      {
        name: 'custom_part',
        import: {
          source_step: 'C:\\input\\part.step',
          template_only: false,
        },
        manufacturing: {
          process: 'casting',
          material: 'A36',
        },
        tolerance: {
          pairs: [{ bore: 10, shaft: 9.97, spec: 'H8/f7' }],
        },
      },
    );

    expect(configToml).toContain('name = "custom_part"');
    expect(configToml).toContain('source_step = "C:\\\\input\\\\part.step"');
    expect(configToml).toContain('template_only = false');
    expect(configToml).toContain('[export]');
    expect(configToml).toContain('step = true');
    expect(configToml).toContain('stl = true');
    expect(configToml).toContain('[drawing]');
    expect(configToml).toContain('scale = "1:2"');
    expect(configToml).toContain('title = "Imported Part"');
    expect(configToml).toContain('[manufacturing]');
    expect(configToml).toContain('process = "casting"');
    expect(configToml).toContain('material = "A36"');
    expect(configToml).toContain('[[tolerance.pairs]]');
    expect(configToml).toContain('bore = 10');
    expect(configToml).toContain('shaft = 9.97');
    expect(configToml).toContain('spec = "H8/f7"');
  });
});
