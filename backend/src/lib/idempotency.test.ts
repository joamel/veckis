import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { Request, Response } from 'express';
import { EventEmitter } from 'events';

vi.mock('@clerk/backend', () => ({
  verifyToken: vi.fn(async () => ({ sub: 'user_1' })),
}));

import { idempotencyMiddleware } from './idempotency';

// Minimal Express req/res-attrapp — bara det middlewaren faktiskt använder.
function makeReqRes(idempotencyKey: string | undefined) {
  const headers: Record<string, string> = {
    authorization: 'Bearer faketoken',
    ...(idempotencyKey ? { 'idempotency-key': idempotencyKey } : {}),
  };
  const req = {
    method: 'POST',
    header: (name: string) => headers[name.toLowerCase()],
  } as unknown as Request;

  const emitter = new EventEmitter();
  let statusCode = 200;
  // responded resolveras när NÅGON (routen eller middlewarens egen replay)
  // faktiskt svarar — till skillnad från `next()`, som INTE anropas vid en
  // deduplicerad retry (det är hela poängen med fixen).
  let resolveResponded!: (body: unknown) => void;
  const responded = new Promise<unknown>(resolve => { resolveResponded = resolve; });
  const res = {
    statusCode,
    status(code: number) {
      statusCode = code;
      res.statusCode = code;
      return res;
    },
    json(body: unknown) {
      emitter.emit('finish');
      resolveResponded(body);
      return { statusCode, body };
    },
    on: emitter.on.bind(emitter),
  } as unknown as Response & { statusCode: number };

  return { req, res, responded };
}

describe('idempotencyMiddleware', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('kör routen bara EN gång för två SAMTIDIGA anrop med samma nyckel (race vid start)', async () => {
    let handlerCalls = 0;
    // Simulerar en route-handler som tar lite tid (t.ex. en DB-insert) innan den svarar.
    async function slowRoute(res: Response) {
      handlerCalls += 1;
      await new Promise(r => setTimeout(r, 20));
      res.status(201).json({ id: `row-${handlerCalls}` });
    }

    const { req: req1, res: res1, responded: responded1 } = makeReqRes('same-key-123');
    const { req: req2, res: res2, responded: responded2 } = makeReqRes('same-key-123');

    idempotencyMiddleware(req1, res1, () => { slowRoute(res1); });
    // Retry:n hinner fram MEDAN originalet fortfarande "bearbetar" (20ms).
    await new Promise(r => setTimeout(r, 5));
    idempotencyMiddleware(req2, res2, () => { slowRoute(res2); });

    const [body1, body2] = await Promise.all([responded1, responded2]);

    // Routen ska bara ha körts en gång — den andra begäran skulle vänta in
    // den första i stället för att skapa en egen rad, och få EXAKT samma svar.
    expect(handlerCalls).toBe(1);
    expect(body1).toEqual({ id: 'row-1' });
    expect(body2).toEqual({ id: 'row-1' });
  });

  it('spelar upp samma svar för en retry EFTER att originalet är klart', async () => {
    let handlerCalls = 0;
    async function route(res: Response) {
      handlerCalls += 1;
      res.status(201).json({ id: 'row-1' });
    }

    const { req: req1, res: res1, responded: responded1 } = makeReqRes('key-after');
    idempotencyMiddleware(req1, res1, () => { route(res1); });
    await responded1;

    const { req: req2, res: res2, responded: responded2 } = makeReqRes('key-after');
    let nextCalledAgain = false;
    idempotencyMiddleware(req2, res2, () => { nextCalledAgain = true; });
    const replayedBody = await responded2;

    expect(handlerCalls).toBe(1);
    expect(nextCalledAgain).toBe(false);
    expect(replayedBody).toEqual({ id: 'row-1' });
  });

  it('kör routen igen om ingen Idempotency-Key skickas', async () => {
    let handlerCalls = 0;
    const { req, res } = makeReqRes(undefined);
    let nextCalled = false;
    await idempotencyMiddleware(req, res, () => { handlerCalls += 1; nextCalled = true; });
    expect(handlerCalls).toBe(1);
    expect(nextCalled).toBe(true);
  });
});
