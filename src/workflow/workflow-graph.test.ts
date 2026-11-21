import { expect, test } from "vitest";
import {
  connectable,
  connectStages,
  defaultGraph,
  disconnectStages,
  moveStage,
  validateGraph,
} from "./workflow-graph";

test("마우스로 끌어 놓은 연결은 한 번만 더하고, 자기 자신이나 없는 단계는 받지 않는다", () => {
  const graph = defaultGraph();
  const once = connectStages(graph, "plan", "test");

  expect(once.edges).toContainEqual({ from: "plan", to: "test" });
  expect(graph.edges).not.toContainEqual({ from: "plan", to: "test" });
  // 같은 곳을 다시 이어도 연결이 늘지 않는다.
  expect(connectStages(once, "plan", "test")).toBe(once);
  expect(connectable(once, "plan", "test")).toBe(false);
  // 자기 자신과 없는 단계는 받지 않는다.
  expect(connectStages(graph, "plan", "plan")).toBe(graph);
  expect(connectable(graph, "plan", "없는-단계")).toBe(false);
  expect(validateGraph(once)).toEqual([]);
});

test("연결을 끊으면 그 연결만 사라지고 나머지 순서는 남는다", () => {
  const graph = defaultGraph();
  const cut = disconnectStages(graph, "development", "style");

  expect(cut.edges).not.toContainEqual({ from: "development", to: "style" });
  expect(cut.edges).toContainEqual({ from: "development", to: "review" });
  expect(cut.edges).toContainEqual({ from: "development", to: "test" });
  expect(cut.stages).toEqual(graph.stages);
  // 이미 없는 연결을 다시 끊어도 그래프가 바뀌지 않는다.
  expect(disconnectStages(cut, "development", "style")).toBe(cut);
});

test("노드를 끈 자리는 그 단계의 좌표에만 남는다", () => {
  const graph = defaultGraph();
  const moved = moveStage(graph, "review", 240, 300);
  const review = moved.stages.find(({ id }) => id === "review")!;

  expect([review.x, review.y]).toEqual([240, 300]);
  expect(moved.stages.filter(({ id }) => id !== "review")).toEqual(
    graph.stages.filter(({ id }) => id !== "review"),
  );
  expect(moved.edges).toEqual(graph.edges);
  // 없는 단계를 옮겨도 그래프는 그대로다.
  expect(moveStage(graph, "없는-단계", 10, 20).stages).toEqual(graph.stages);
});
