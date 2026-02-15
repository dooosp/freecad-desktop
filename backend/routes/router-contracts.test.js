// @vitest-environment node
import { describe, expect, it } from 'vitest';
import analyzeRouter from './analyze.js';
import cacheRouter from './cache.js';
import costRouter from './cost.js';
import dfmRouter from './dfm.js';
import diagnosticsRouter from './diagnostics.js';
import drawingRouter from './drawing.js';
import exportPackRouter from './export-pack.js';
import projectRouter from './project.js';
import reportTemplateRouter from './report-template.js';
import stepImportRouter from './step-import.js';
import toleranceRouter from './tolerance.js';

function findRoute(router, path, method) {
  return router.stack.find((layer) => layer.route?.path === path && layer.route?.methods?.[method]);
}

describe('thin route module contracts', () => {
  it('registers analyze/cost/dfm/drawing/tolerance endpoints', () => {
    expect(findRoute(analyzeRouter, '/analyze', 'post')).toBeTruthy();
    expect(findRoute(costRouter, '/cost', 'post')).toBeTruthy();
    expect(findRoute(dfmRouter, '/dfm', 'post')).toBeTruthy();
    expect(findRoute(drawingRouter, '/drawing', 'post')).toBeTruthy();
    expect(findRoute(toleranceRouter, '/tolerance', 'post')).toBeTruthy();
  });

  it('registers cache/diagnostics/project endpoints', () => {
    expect(findRoute(cacheRouter, '/stats', 'get')).toBeTruthy();
    expect(findRoute(cacheRouter, '/', 'delete')).toBeTruthy();
    expect(findRoute(diagnosticsRouter, '/', 'get')).toBeTruthy();

    expect(findRoute(projectRouter, '/save', 'post')).toBeTruthy();
    expect(findRoute(projectRouter, '/open', 'post')).toBeTruthy();
    expect(findRoute(projectRouter, '/recent', 'get')).toBeTruthy();
  });

  it('registers export-pack/report-template/step-import endpoints', () => {
    expect(findRoute(exportPackRouter, '/', 'post')).toBeTruthy();

    expect(findRoute(reportTemplateRouter, '/', 'get')).toBeTruthy();
    expect(findRoute(reportTemplateRouter, '/:name', 'get')).toBeTruthy();
    expect(findRoute(reportTemplateRouter, '/', 'post')).toBeTruthy();
    expect(findRoute(reportTemplateRouter, '/:name', 'put')).toBeTruthy();
    expect(findRoute(reportTemplateRouter, '/:name', 'delete')).toBeTruthy();

    const stepImportRoute = findRoute(stepImportRouter, '/step/import', 'post');
    expect(stepImportRoute).toBeTruthy();
    expect(stepImportRoute.route.stack.length).toBe(2); // multer + handler
    expect(findRoute(stepImportRouter, '/step/save-config', 'post')).toBeTruthy();
  });
});
