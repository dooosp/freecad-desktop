import archiver from 'archiver';
import { createWriteStream, mkdirSync, copyFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, basename, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { readFileSync, rmSync } from 'node:fs';
import { generateBomCsv, generateCostCsv } from './csv-generator.js';
import { getExportPathByFormat, toOutputPath } from './pack-paths.js';

export { getExportPathByFormat, toOutputPath } from './pack-paths.js';

/**
 * Build a deliverable pack (zip) with organized structure
 *
 * @param {object} options
 * @param {string} options.freecadRoot - Path to freecad-automation
 * @param {string} options.configPath - Config file path (relative to freecadRoot)
 * @param {object} options.config - Parsed config object
 * @param {object} options.results - Analysis results from /analyze
 * @param {string} options.profileName - Shop profile name (optional)
 * @param {string} options.templateName - Report template name (optional)
 * @param {string} options.revision - Revision string (e.g., "Rev.A")
 * @param {string} options.organization - Organization name
 * @param {string} options.partName - Optional part name override
 * @param {object} options.include - What to include { step, svg, drawing_pdf, dfm, tolerance, cost, report, bom }
 * @param {string} options.reportPdfBase64 - Base64 PDF data (optional)
 * @returns {Promise<{ zipBase64: string, filename: string }>}
 */
export async function buildPack(options) {
  const {
    freecadRoot,
    configPath,
    config,
    results,
    profileName = '',
    templateName = '',
    revision = 'Rev.A',
    organization = '',
    partName: partNameOverride = '',
    include = {},
    reportPdfBase64 = null,
  } = options;

  const partName = partNameOverride || config.name || 'part';
  const timestamp = new Date().toISOString().split('T')[0].replace(/-/g, '');
  const packName = `${partName}_${revision}_${timestamp}`;
  const tempRoot = join(tmpdir(), packName);

  // Clean up if exists
  if (existsSync(tempRoot)) {
    rmSync(tempRoot, { recursive: true, force: true });
  }

  mkdirSync(tempRoot, { recursive: true });

  // Create subdirectories
  const dirs = {
    model: join(tempRoot, '01_model'),
    drawing: join(tempRoot, '02_drawing'),
    analysis: join(tempRoot, '03_analysis'),
    report: join(tempRoot, '04_report'),
    bom: join(tempRoot, '05_bom'),
    config: join(tempRoot, '06_config'),
  };

  Object.values(dirs).forEach(dir => mkdirSync(dir, { recursive: true }));

  const pathRoots = [freecadRoot];
  const includedModelFiles = [];
  const includedDrawingFiles = [];
  const includedReportFiles = [];
  const includedAnalysisFiles = [];
  const includedBomFiles = [];

  // 1. Model files
  if (include.step) {
    const stepPath = getExportPathByFormat(results.model, 'step');
    const stepSrc = toOutputPath(stepPath, pathRoots);
    if (stepSrc && existsSync(stepSrc)) {
      const file = basename(stepSrc);
      copyFileSync(stepSrc, join(dirs.model, file));
      includedModelFiles.push(file);
    }
  }

  // 2. Drawing files
  if (include.svg) {
    const svgPath = getExportPathByFormat(results.drawing, 'svg');
    const svgSrc = toOutputPath(svgPath, pathRoots);
    if (svgSrc && existsSync(svgSrc)) {
      const file = basename(svgSrc);
      copyFileSync(svgSrc, join(dirs.drawing, file));
      includedDrawingFiles.push(file);
    }
  }

  if (include.dxf) {
    const dxfPath = getExportPathByFormat(results.drawing, 'dxf');
    const dxfSrc = toOutputPath(dxfPath, pathRoots);
    if (dxfSrc && existsSync(dxfSrc)) {
      const file = basename(dxfSrc);
      copyFileSync(dxfSrc, join(dirs.drawing, file));
      includedDrawingFiles.push(file);
    }
  }

  if (include.drawing_pdf) {
    const drawingPdfPath = getExportPathByFormat(results.drawing, 'pdf');
    const pdfSrc = toOutputPath(drawingPdfPath, pathRoots);
    if (pdfSrc && existsSync(pdfSrc)) {
      const file = basename(pdfSrc);
      copyFileSync(pdfSrc, join(dirs.drawing, file));
      includedDrawingFiles.push(file);
    }
  }

  // 3. Analysis files
  if (include.dfm && results.dfm) {
    includedAnalysisFiles.push('dfm_report.json');
    writeFileSync(
      join(dirs.analysis, 'dfm_report.json'),
      JSON.stringify(results.dfm, null, 2),
      'utf8'
    );
  }

  if (include.tolerance && results.tolerance) {
    includedAnalysisFiles.push('tolerance_report.json');
    writeFileSync(
      join(dirs.analysis, 'tolerance_report.json'),
      JSON.stringify(results.tolerance, null, 2),
      'utf8'
    );
  }

  if (include.cost && results.cost) {
    includedAnalysisFiles.push('cost_estimate.json');
    writeFileSync(
      join(dirs.analysis, 'cost_estimate.json'),
      JSON.stringify(results.cost, null, 2),
      'utf8'
    );

    // CSV export
    const costCsv = generateCostCsv(results.cost);
    writeFileSync(join(dirs.analysis, 'cost_breakdown.csv'), costCsv, 'utf8');
    includedAnalysisFiles.push('cost_breakdown.csv');
  }

  // 4. Report PDF
  if (include.report && reportPdfBase64) {
    const pdfBuffer = Buffer.from(reportPdfBase64, 'base64');
    const reportFile = `${partName}_report.pdf`;
    writeFileSync(join(dirs.report, reportFile), pdfBuffer);
    includedReportFiles.push(reportFile);
  }

  // 5. BOM
  if (include.bom) {
    const bomCsv = generateBomCsv(config);
    writeFileSync(join(dirs.bom, 'bom.csv'), bomCsv, 'utf8');
    includedBomFiles.push('bom.csv');
  }

  // 6. Config
  const configAbsPath = resolve(freecadRoot, configPath);
  copyFileSync(configAbsPath, join(dirs.config, basename(configPath)));

  // 7. Manifest
  const manifest = {
    pack_name: packName,
    part_name: partName,
    revision,
    organization,
    profile_used: profileName,
    template_used: templateName,
    generated_at: new Date().toISOString(),
    config_file: basename(configPath),
    included_files: {
      model: includedModelFiles,
      drawing: includedDrawingFiles,
      analysis: includedAnalysisFiles,
      report: includedReportFiles,
      bom: includedBomFiles,
    },
  };

  writeFileSync(join(tempRoot, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');

  // 8. README
  const readme = `FreeCAD Studio Deliverable Pack
================================

Part: ${partName}
Revision: ${revision}
Organization: ${organization}
Generated: ${new Date().toISOString()}

Directory Structure:
- 01_model/      3D model files (STEP)
- 02_drawing/    Engineering drawings (SVG, PDF)
- 03_analysis/   DFM, tolerance, cost reports (JSON, CSV)
- 04_report/     Integrated engineering report (PDF)
- 05_bom/        Bill of materials (CSV)
- 06_config/     Source configuration file (TOML)
- manifest.json  Pack metadata

For questions, contact your manufacturing partner.
`;

  writeFileSync(join(tempRoot, 'README.txt'), readme, 'utf8');

  // 9. Create ZIP
  const zipBuffer = await createZipBuffer(tempRoot);

  // Cleanup
  rmSync(tempRoot, { recursive: true, force: true });

  return {
    zipBase64: zipBuffer.toString('base64'),
    filename: `${packName}.zip`,
  };
}

/**
 * Create zip archive in memory
 */
function createZipBuffer(sourceDir) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    const archive = archiver('zip', { zlib: { level: 9 } });

    archive.on('data', chunk => chunks.push(chunk));
    archive.on('end', () => resolve(Buffer.concat(chunks)));
    archive.on('error', reject);

    archive.directory(sourceDir, false);
    archive.finalize();
  });
}
