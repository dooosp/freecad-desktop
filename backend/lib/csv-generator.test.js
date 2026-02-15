// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { generateBomCsv, generateCostCsv } from './csv-generator.js';

describe('generateBomCsv', () => {
  it('builds BOM rows for single-part shapes with extracted dimensions', () => {
    const csv = generateBomCsv({
      material: { name: 'AL6061' },
      shapes: [
        { id: 'body', type: 'cylinder', diameter: 20, length: 80 },
        { type: 'plate', width: 120, height: 10, thickness: 5 },
      ],
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('No,Part ID,Type,Material,Dimensions');
    expect(lines[1]).toBe('1,body,cylinder,AL6061,Ø20 × L80');
    expect(lines[2]).toBe('2,shape_2,plate,AL6061,W120 × H10 × t5');
  });

  it('builds BOM rows for assembly parts with per-part material fallback', () => {
    const csv = generateBomCsv({
      material: { name: 'SS304' },
      parts: [
        { id: 'p1', type: 'base', material: 'A36' },
        { type: 'fastener' },
      ],
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('No,Part ID,Type,Material,Dimensions');
    expect(lines[1]).toBe('1,p1,base,A36,See part config');
    expect(lines[2]).toBe('2,part_2,fastener,SS304,See part config');
  });

  it('returns header-only CSV when no shapes/parts exist', () => {
    expect(generateBomCsv({})).toBe('No,Part ID,Type,Material,Dimensions');
  });
});

describe('generateCostCsv', () => {
  it('formats breakdown categories with percentages and total row', () => {
    const csv = generateCostCsv({
      total_cost: 200000,
      breakdown: {
        material_cost: 50000,
        machining_cost: 120000,
        setup_cost: 30000,
      },
    });

    const lines = csv.split('\n');
    expect(lines[0]).toBe('Category,Amount (KRW),Percentage');
    expect(lines).toContain('Material Cost,50000,25.0%');
    expect(lines).toContain('Machining Cost,120000,60.0%');
    expect(lines).toContain('Setup Cost,30000,15.0%');
    expect(lines[lines.length - 1]).toBe('Total,200000,100.0%');
  });

  it('uses 0.0% rows when total cost is zero', () => {
    const csv = generateCostCsv({
      total_cost: 0,
      breakdown: {
        inspection_cost: 0,
      },
    });

    expect(csv).toContain('Inspection Cost,0,0.0%');
    expect(csv).toContain('Total,0,100.0%');
  });

  it('returns header-only CSV when breakdown is missing', () => {
    expect(generateCostCsv(null)).toBe('Category,Amount (KRW),Percentage\n');
    expect(generateCostCsv({ total_cost: 10 })).toBe('Category,Amount (KRW),Percentage\n');
  });
});
