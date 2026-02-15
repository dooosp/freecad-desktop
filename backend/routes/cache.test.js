// @vitest-environment node
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

const mocks = vi.hoisted(() => ({
  ctor: vi.fn(),
  getCacheStats: vi.fn(),
  clearCache: vi.fn(),
}));

vi.mock('../lib/analysis-cache.js', () => ({
  AnalysisCache: class {
    constructor(root) {
      mocks.ctor(root);
    }

    getCacheStats(...args) {
      return mocks.getCacheStats(...args);
    }

    clearCache(...args) {
      return mocks.clearCache(...args);
    }
  },
}));

import { cacheStatsHandler, clearCacheHandler } from './handlers/cache-handlers.js';

describe('cache route handlers', () => {
  beforeEach(() => {
    mocks.ctor.mockReset();
    mocks.getCacheStats.mockReset();
    mocks.clearCache.mockReset();
  });

  it('returns cache stats from AnalysisCache', async () => {
    mocks.getCacheStats.mockResolvedValue({ entries: 7, bytes: 1024 });

    const req = createMockReq({ appLocals: { freecadRoot: '/tmp/freecad-root' } });
    const res = createMockRes();

    await cacheStatsHandler(req, res);

    expect(mocks.ctor).toHaveBeenCalledWith('/tmp/freecad-root');
    expect(mocks.getCacheStats).toHaveBeenCalledTimes(1);
    expect(res.statusCode).toBe(200);
    expect(res.jsonBody).toEqual({ entries: 7, bytes: 1024 });
  });

  it('clears cache using optional stage query', async () => {
    mocks.clearCache.mockResolvedValue({ cleared: 3, stage: 'drawing' });

    const req = createMockReq({
      appLocals: { freecadRoot: '/tmp/freecad-root' },
    });
    req.query = { stage: 'drawing' };
    const res = createMockRes();

    await clearCacheHandler(req, res);

    expect(mocks.clearCache).toHaveBeenCalledWith('drawing');
    expect(res.jsonBody).toEqual({ cleared: 3, stage: 'drawing' });
  });
});
