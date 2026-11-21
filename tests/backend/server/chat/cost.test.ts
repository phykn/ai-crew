import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { reportedCost } from "../../../../src/backend/server/chat/cost";
import { CrewStore } from "../../../../src/backend/store/store";

test("a provider-reported cost is read from the response metadata", () => {
  expect(reportedCost({ openaiCompatible: { cost: 0.0042 } })).toBe(0.0042);
  expect(reportedCost({ provider: { usage: { totalCost: "0.15" } } })).toBe(
    0.15,
  );
  expect(reportedCost({ cost_usd: 1 })).toBe(1);
  expect(reportedCost({ provider: { tokens: 120 } })).toBeUndefined();
  expect(reportedCost({ provider: { cost: -1 } })).toBeUndefined();
  expect(reportedCost(undefined)).toBeUndefined();
});

test("a run without a reported cost stays '미제공' in the log", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-cost-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const member = store.readMembers(projectId, "development")[0];
    store.recordModelRun(sessionId, null, member, 1200, {
      model: "qwen",
      inputTokens: 10,
      outputTokens: 20,
      costUsd: 0.0025,
    });
    store.recordModelRun(sessionId, null, member, 900, {
      model: "qwen",
      inputTokens: 5,
      outputTokens: 5,
    });
    store.log(sessionId, "비용 확인 " + randomUUID().slice(0, 4));
    expect(store.snapshot().modelRuns).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          model: "qwen",
          inputTokens: 10,
          outputTokens: 20,
          costUsd: 0.0025,
        }),
        expect.objectContaining({ model: "qwen", costUsd: null }),
      ]),
    );
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
