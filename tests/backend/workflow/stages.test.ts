import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodexConnection } from "../../../src/backend/server/codex/connection";
import { decideLocal } from "../../../src/backend/server/chat/local";
import { CrewStore } from "../../../src/backend/store/store";
import { CrewWorkflow } from "../../../src/backend/workflow/workflow";

vi.mock("../../../src/backend/server/chat/local", () => ({ decideLocal: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test("the saved workflow decides which checks run and which are skipped", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-stages-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  try {
    writeFileSync(join(folder, "notice.txt"), "Before\n");
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const [base] = store.listWorkflows(projectId);
    const graph = {
      ...base.graph,
      stages: [
        ...base.graph.stages
          .filter(({ id }) => id !== "style")
          .map((stage) =>
            stage.id === "test"
              ? { ...stage, condition: "테스트" }
              : stage,
          ),
        {
          id: "accessibility",
          title: "접근성 검토",
          roleId: "review" as const,
          criterion: "키보드만으로 조작할 수 있다.",
          artifact: "접근성 의견",
          condition: "",
          required: true,
          x: 260,
          y: 240,
        },
      ],
      edges: [
        ...base.graph.edges.filter(
          ({ from, to }) => from !== "style" && to !== "style",
        ),
        { from: "development", to: "accessibility" },
        { from: "accessibility", to: "report" },
      ],
    };
    store.saveWorkflow(projectId, {
      id: base.id,
      version: base.version,
      name: base.name,
      graph,
      author: "사용자",
    });

    const seen: string[] = [];
    vi.mocked(decideLocal).mockImplementation(async (system) => {
      seen.push(system.slice(0, 40));
      if (system.startsWith("Plan only the changes"))
        return { paths: ["notice.txt"], goal: "문구 변경", criterion: "After" };
      if (system.startsWith("Review the proposed"))
        return { passed: true, note: "확인했어요." };
      if (system.startsWith("Implement only"))
        return { content: "After", ending: "one-line-break", consult: "none", question: "" };
      if (system.startsWith("Choose an independent"))
        return {
          kind: "text",
          expected: "After",
          exact: true,
          ending: "one-line-break",
          reason: "",
        };
      if (system.startsWith("Review only this concern")) {
        expect(system).toContain("접근성 검토");
        return { passed: true, note: "키보드 조작을 확인했어요.", findings: [] };
      }
      return { passed: true, note: "확인했어요." };
    });

    const { id } = workflow.delegate(sessionId, randomUUID(), "문구를 고쳐줘");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));

    expect(readFileSync(join(folder, "notice.txt"), "utf8")).toBe("After\n");
    const [change] = store.readChanges(sessionId);
    expect(change.checks.map(({ label }) => label)).toEqual([
      "리뷰",
      "접근성 검토",
    ]);
    expect(change.checks.every(({ passed }) => passed)).toBe(true);
    expect(seen.some((entry) => entry.startsWith("Review only this concern"))).toBe(
      true,
    );
    const activity = store.snapshot().activity.map(({ text }) => text);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.stringContaining("테스트 · 실행 조건에 맞지 않아 건너뜀"),
      ]),
    );
    expect(change.checks.map(({ label }) => label)).not.toContain("스타일");
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
