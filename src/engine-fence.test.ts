import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodexConnection } from "./codex";
import { DirectoryFence, ReloadDefer, StopFence } from "./engine-fence";
import { decideLocal } from "./local";
import { CrewStore } from "./store";
import { CrewWorkflow } from "./workflow";

vi.mock("./local", () => ({ decideLocal: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test("a stop makes the running generation stale and only that one", () => {
  const fence = new StopFence();
  const first = fence.begin("response");
  expect(fence.isStale("response", first)).toBe(false);
  fence.stop("response");
  expect(fence.isStale("response", first)).toBe(true);
  const second = fence.begin("response");
  expect(fence.isStale("response", first)).toBe(true);
  expect(fence.isStale("response", second)).toBe(false);
  expect(fence.isStale("other", 1)).toBe(false);
  fence.forget("response");
  expect(fence.isStale("response", second)).toBe(false);
});

test("the directory fence reports overlaps and forgets released runs", () => {
  const fence = new DirectoryFence();
  fence.hold("first", ["/repo/src/notice.txt", "/repo/docs"]);
  expect(fence.conflict(["/repo/src/notice.txt"])).toBe("first");
  expect(fence.conflict(["/repo/notice.txt"])).toBe(null);
  expect(fence.conflict(["/repo/docs/guide.md"])).toBe("first");
  expect(fence.conflict(["/REPO/src/NOTICE.txt"])).toBe("first");
  expect(
    fence.conflict(["/repo/src/notice.txt"], "first"),
  ).toBe(null);
  fence.hold("second", ["/repo/other.md"]);
  expect(fence.conflict(["/repo/other.md"])).toBe("second");
  expect(fence.active().sort()).toEqual(["first", "second"]);
  fence.release("first");
  expect(fence.conflict(["/repo/src/notice.txt"])).toBe(null);
});

test("a reload request waits for the run and is served once", () => {
  const defer = new ReloadDefer();
  expect(defer.request()).toBe(false);
  const release = defer.enter();
  expect(defer.busy).toBe(true);
  expect(defer.request()).toBe(true);
  expect(defer.request()).toBe(true);
  expect(defer.waiting).toBe(true);
  release();
  release();
  expect(defer.busy).toBe(false);
  expect(defer.take()).toBe(true);
  expect(defer.take()).toBe(false);
});

test("a job stopped mid-plan does not build on the late plan result", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-fence-")));
  const file = join(folder, "notice.txt");
  writeFileSync(file, "Before\n");
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  let deliver: (value: unknown) => void = () => {};
  try {
    const planned = new Promise((resolve) => {
      deliver = resolve;
    });
    vi.mocked(decideLocal).mockImplementation(async (system) => {
      if (system.startsWith("Plan only the changes")) return planned as never;
      return { passed: true, note: "확인했어요." } as never;
    });
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const { id } = workflow.delegate(sessionId, randomUUID(), "문구 변경");

    await vi.waitFor(() => expect(decideLocal).toHaveBeenCalled());
    workflow.stop(id);
    expect(store.getJob(id).state).toBe("stopping");

    deliver({
      paths: ["notice.txt"],
      goal: "문구 변경",
      criterion: "After",
    });
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("stopped"));
    expect(readFileSync(file, "utf8")).toBe("Before\n");
    expect(store.readAuditLogs(store.getJob(id).projectId)).toEqual([]);
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([expect.stringContaining("업무 정지 확인")]),
    );

    // 이어가기는 새 세대를 열어 같은 업무를 다시 계획한다.
    workflow.resume(id);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([expect.stringContaining("이어가기")]),
    );
  } finally {
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
