import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import type { WorkflowGraph } from "./actions";
import { CrewStore } from "./store";
import {
  defaultGraph,
  remainingStages,
  validateGraph,
  workflowOrder,
} from "./workflow-graph";

test("the default flow is valid and keeps parallel checks at one level", () => {
  const graph = defaultGraph();
  expect(validateGraph(graph)).toEqual([]);
  expect(workflowOrder(graph)).toEqual([
    "plan",
    "development",
    "review",
    "style",
    "test",
    "report",
  ]);
  expect(remainingStages(graph, ["plan"], ["style"])).toEqual([
    "development",
    "review",
    "test",
    "report",
  ]);
});

test("applying the saved rule to a running job records its version and remaining steps", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-apply-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const [workflow] = store.listWorkflows(projectId);
    const job = store.createJob(sessionId, randomUUID(), "화면을 고쳐줘");
    expect(job.workflowVersion).toBe(1);
    store.setSessionWorkflow(sessionId, null);
    store.saveWorkflow(projectId, {
      id: workflow.id,
      version: 1,
      name: workflow.name,
      graph: {
        ...workflow.graph,
        stages: workflow.graph.stages.map((stage) =>
          stage.id === "style"
            ? { ...stage, title: "접근성 검토", roleId: "review" }
            : stage,
        ),
      },
      author: "사용자",
    });
    store.applyWorkflow(job.id, "current");
    expect(store.getJob(job.id).workflowVersion).toBe(2);
    expect(store.snapshot().session!.workflowId).toBe(workflow.id);
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("워크플로우 이번 업무에도 적용"),
        expect.stringContaining("남은 필수 단계"),
      ]),
    );
    const once = store.createJob(sessionId, randomUUID(), "한 번만");
    expect(once.workflowVersion).toBe(2);
    store.applyWorkflow(once.id, "once");
    expect(
      store.snapshot().activity.map(({ text }) => text),
    ).toEqual(expect.arrayContaining([expect.stringContaining("이번에만 적용")]));
    store.recordJob(store.getJob(once.id), "complete", "완료");
    expect(() => store.applyWorkflow(once.id, "current")).toThrow(
      "끝난 업무에는",
    );
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("broken references, cycles and unreachable completions are rejected", () => {
  const graph = defaultGraph();
  const withEdge = (...edges: WorkflowGraph["edges"]): WorkflowGraph => ({
    ...graph,
    edges: [...graph.edges, ...edges],
  });
  expect(validateGraph(withEdge({ from: "plan", to: "missing" }))).toEqual(
    expect.arrayContaining([expect.stringContaining("도착 단계를 찾을 수 없어요")]),
  );
  expect(validateGraph(withEdge({ from: "report", to: "plan" }))).toEqual(
    expect.arrayContaining([expect.stringContaining("순환")]),
  );
  expect(validateGraph({ stages: graph.stages, edges: [] })).toEqual([]);
  const duplicate: WorkflowGraph = {
    ...graph,
    stages: [...graph.stages, { ...graph.stages[0], title: "중복" }],
  };
  expect(validateGraph(duplicate)).toEqual(
    expect.arrayContaining([expect.stringContaining("단계 ID가 겹쳐요")]),
  );
  const optionalEnd: WorkflowGraph = {
    stages: graph.stages.map((stage) =>
      stage.id === "report" ? { ...stage, required: false } : stage,
    ),
    edges: graph.edges,
  };
  expect(validateGraph(optionalEnd)).toEqual(
    expect.arrayContaining([
      expect.stringContaining("완료를 판단할 필수 단계가 끝에 없어요"),
    ]),
  );
});

test("a saved version is the one new jobs and cleared sessions use", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-flow-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const [workflow] = store.listWorkflows(projectId);
    expect(workflow).toMatchObject({
      name: "기본 개발 흐름",
      version: 1,
      author: "기본",
    });
    expect(workflow.graph.stages).toHaveLength(6);
    store.setSessionWorkflow(sessionId, workflow.id);
    expect(store.snapshot().session!.workflowId).toBe(workflow.id);

    const added = {
      ...workflow.graph,
      stages: [
        ...workflow.graph.stages,
        {
          id: "accessibility",
          title: "접근성 검토",
          roleId: "review" as const,
          criterion: "화면 조작을 키보드로 확인했다.",
          artifact: "접근성 의견",
          condition: "",
          required: true,
          x: 260,
          y: 240,
        },
      ],
      edges: [...workflow.graph.edges, { from: "development", to: "accessibility" }],
    };
    expect(
      store.saveWorkflow(projectId, {
        id: workflow.id,
        version: workflow.version,
        name: "기본 개발 흐름",
        graph: added,
        author: "사용자",
      }).version,
    ).toBe(2);
    expect(() =>
      store.saveWorkflow(projectId, {
        id: workflow.id,
        version: 1,
        name: "기본 개발 흐름",
        graph: added,
        author: "사용자",
      }),
    ).toThrow("워크플로우가 바뀌었어요");
    expect(() =>
      store.saveWorkflow(projectId, {
        id: workflow.id,
        version: 2,
        name: "기본 개발 흐름",
        graph: {
          ...workflow.graph,
          edges: [...workflow.graph.edges, { from: "plan", to: "missing" }],
        },
        author: "사용자",
      }),
    ).toThrow();
    expect(store.listWorkflows(projectId)[0].version).toBe(2);

    const first = store.createJob(sessionId, randomUUID(), "파일을 고쳐줘");
    expect(first).toMatchObject({
      workflowId: workflow.id,
      workflowVersion: 2,
    });
    store.saveWorkflow(projectId, {
      id: workflow.id,
      version: 2,
      name: "기본 개발 흐름",
      graph: workflow.graph,
      author: "사용자",
    });
    expect(store.getJob(first.id)).toMatchObject({ workflowVersion: 2 });
    expect(
      store.createJob(sessionId, randomUUID(), "한 번 더"),
    ).toMatchObject({ workflowVersion: 3 });
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("워크플로우 저장 · 기본 개발 흐름 v2"),
        expect.stringContaining("워크플로우 선택 · 기본 개발 흐름 v1"),
      ]),
    );

    const cleared = randomUUID();
    store.clearSession(sessionId, cleared);
    const fresh = store.snapshot().session!;
    expect(fresh.id).not.toBe(sessionId);
    expect(fresh.workflowId).toBe(workflow.id);
    expect(
      store.createJob(fresh.id, randomUUID(), "새 업무"),
    ).toMatchObject({ workflowId: workflow.id, workflowVersion: 3 });
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
