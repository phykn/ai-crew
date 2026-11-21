import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test, vi } from "vitest";
import { ActionRunner } from "./app-actions";
import { CodexConnection } from "./codex";
import { crewInstructions } from "./crew-definition";
import { CrewMcp } from "./mcp";
import { CrewStore } from "./store";
import { StyleWatch } from "./style-watch";
import { CrewWorkflow } from "./workflow";

const wait = (ms: number) => new Promise((done) => setTimeout(done, ms));

test("연속으로 바뀐 파일은 한 번의 확인으로 합쳐진다", async () => {
  const check = vi.fn();
  const watch = new StyleWatch(check, 5);
  try {
    watch.noteChange({ projectId: "p", sessionId: "s", paths: ["a.ts"] });
    watch.noteChange({ projectId: "p", sessionId: "s", paths: ["b.ts"] });
    watch.noteChange({ projectId: "p", sessionId: "s", paths: ["a.ts", "c.md"] });
    await wait(20);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check.mock.calls[0][0].paths.sort()).toEqual(["a.ts", "b.ts", "c.md"]);
  } finally {
    watch.close();
  }
});

test("확인 중에 들어온 변경은 끝난 뒤 한 번 더 확인한다", async () => {
  const batches: string[][] = [];
  let watch: StyleWatch;
  watch = new StyleWatch((change) => {
    batches.push(change.paths);
    if (batches.length === 1)
      // 확인이 도는 동안 다음 저장이 들어온 상황
      watch.noteChange({
        projectId: change.projectId,
        sessionId: change.sessionId,
        paths: ["later.ts"],
      });
  }, 5);
  try {
    watch.noteChange({ projectId: "p", sessionId: "s", paths: ["first.ts"] });
    await wait(20);
    expect(batches).toEqual([["first.ts"], ["later.ts"]]);
  } finally {
    watch.close();
  }
});

test("스타일 보고는 사용자 말풍선이 아니라 비서가 읽는 보고로 쌓인다", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "crew-style-")));
  const store = new CrewStore(join(root, ".crew.sqlite"));
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const before = store.getMessages(sessionId).length;

    store.recordStyleReport({
      projectId,
      sessionId,
      paths: ["src/a.ts", "src/a.ts", "docs/b.md"],
    });
    // 채팅에는 아무 말도 붙지 않고, 업무 로그에만 흔적이 남는다.
    expect(store.getMessages(sessionId)).toHaveLength(before);
    expect(store.snapshot().activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          text: expect.stringContaining("스타일 → 비서 · 파일 변경 감지"),
        }),
      ]),
    );

    const reports = store.takeStyleReports(projectId);
    expect(reports).toHaveLength(1);
    expect(reports[0].paths).toEqual(["src/a.ts", "docs/b.md"]);
    expect(store.pendingStyleReports(projectId)).toEqual([]);

    const assistant = store.readMembers(projectId, "assistant")[0];
    const instructions = crewInstructions(
      assistant,
      [],
      [],
      [],
      { styleReports: reports },
    );
    expect(instructions).toContain("스타일 감시자 보고");
    expect(instructions).toContain("src/a.ts");
    // 다른 역할의 프롬프트에는 비서에게 가는 보고를 싣지 않는다.
    const style = store.readMembers(projectId, "style")[0];
    expect(
      crewInstructions(style, [], [], [], { styleReports: reports }),
    ).not.toContain("스타일 감시자 보고");
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("파일이 바뀐 시점을 실행기에 알리면 스타일 감시자에게 전달된다", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "crew-hook-")));
  const store = new CrewStore(join(root, ".crew.sqlite"));
  const fileChange = vi.fn();
  const runner = new ActionRunner({
    store,
    workflow: new CrewWorkflow(store, new CodexConnection(), () => {}),
    mcp: new CrewMcp(store),
    fileChange,
  });
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    runner.noteFileChange({ projectId, sessionId, paths: ["src/main.ts"] });
    expect(fileChange).toHaveBeenCalledWith({
      projectId,
      sessionId,
      paths: ["src/main.ts"],
    });
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
