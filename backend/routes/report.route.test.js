// @vitest-environment node
import { describe, expect, it, vi } from 'vitest';
import reportRouter from './report.js';
import { createMockReq, createMockRes } from './handler-test-helpers.js';

function findRouteHandler(path, method) {
  const layer = reportRouter.stack.find(
    (item) => item.route?.path === path && item.route?.methods?.[method]
  );
  return layer?.route?.stack?.[0]?.handle;
}

describe('report router contract', () => {
  it('registers POST /report and forwards async errors through next', async () => {
    const handler = findRouteHandler('/report', 'post');
    expect(handler).toBeTypeOf('function');

    const req = createMockReq({
      body: {},
      appLocals: {},
    });
    const res = createMockRes();
    const next = vi.fn();

    handler(req, res, next);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(next).toHaveBeenCalledTimes(1);
    expect(next.mock.calls[0][0]).toMatchObject({
      status: 400,
      message: 'configPath required',
    });
  });
});
