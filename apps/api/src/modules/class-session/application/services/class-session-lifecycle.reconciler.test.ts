import assert from "node:assert/strict";
import test from "node:test";
import { ClassSessionLifecycleReconciler } from "./class-session-lifecycle.reconciler";

test("startup catch-up, bounded periodic sweeps, retry and shutdown drain", async () => {
  let calls = 0, canceled = false, callback: (() => void) | undefined, fail = false;
  let release: (() => void) | undefined;
  const repository = { reconcileDue: async () => { calls++; if (fail) throw new Error("failure");
    if (calls === 3) await new Promise<void>((resolve) => { release = resolve; });
    return { cursor: null }; } };
  const runtime = { schedule: (fn: () => void, ms: number) => {
    assert.equal(ms, 1000); callback = fn; return { cancel: () => { canceled = true; } };
  } };
  const worker = new ClassSessionLifecycleReconciler(repository as any, runtime as any, { get: () => 1000 } as any);
  await worker.onApplicationBootstrap(); assert.equal(calls, 1); assert.ok(callback);
  fail = true; callback!(); await worker.run(); assert.equal(calls, 2);
  fail = false; callback!(); const overlapping = worker.run(); assert.equal(calls, 3);
  let stopped = false; const shutdown = worker.onModuleDestroy().then(() => { stopped = true; });
  await Promise.resolve(); assert.equal(stopped, false); assert.equal(canceled, true);
  release!(); await overlapping; await shutdown; await worker.run(); assert.equal(calls, 3);
});

test("invalid reconciliation intervals are rejected", () => {
  for (const value of [0, 999, 60001, 1000.5, NaN]) {
    assert.throws(() => new ClassSessionLifecycleReconciler({} as any, {} as any, { get: () => value } as any), /integer/);
  }
});
