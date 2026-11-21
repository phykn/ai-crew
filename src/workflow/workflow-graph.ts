import type { RoleId, WorkflowGraph, WorkflowStage } from "../shared/actions";

const stageRoles: RoleId[] = [
  "assistant",
  "development",
  "build",
  "docs",
  "review",
  "style",
  "test",
  "vision",
];

/** 계획(비서) → 개발 → (리뷰 ∥ 스타일 ∥ 테스트) → 비서 보고 */
export function defaultGraph(): WorkflowGraph {
  const stage = (
    id: string,
    title: string,
    roleId: RoleId,
    criterion: string,
    artifact: string,
    x: number,
    y: number,
    required = true,
  ): WorkflowStage => ({
    id,
    title,
    roleId,
    criterion,
    artifact,
    condition: "",
    required,
    x,
    y,
  });
  return {
    stages: [
      stage(
        "plan",
        "계획",
        "assistant",
        "요구사항별 작업 범위와 확인 가능한 완료 조건을 남겼다.",
        "작업 범위·완료 조건 인계",
        0,
        0,
      ),
      stage(
        "development",
        "개발",
        "development",
        "승인된 범위의 파일을 바꾸고 저장했다.",
        "변경 파일과 기준 버전",
        0,
        120,
      ),
      stage(
        "review",
        "리뷰",
        "review",
        "같은 변경 버전이 요청한 동작을 만족한다.",
        "검토 의견과 변경 버전",
        -180,
        240,
      ),
      stage(
        "style",
        "스타일",
        "style",
        "같은 변경 버전이 코딩 스타일을 지킨다.",
        "스타일 의견",
        0,
        240,
      ),
      stage(
        "test",
        "테스트",
        "test",
        "같은 변경 버전에서 실행한 검사가 통과했다.",
        "실행 명령과 결과",
        180,
        240,
      ),
      stage(
        "report",
        "보고",
        "assistant",
        "최신 변경과 검증 결과를 사용자에게 보고했다.",
        "업무 로그 링크",
        0,
        360,
      ),
    ],
    edges: [
      { from: "plan", to: "development" },
      { from: "development", to: "review" },
      { from: "development", to: "style" },
      { from: "development", to: "test" },
      { from: "review", to: "report" },
      { from: "style", to: "report" },
      { from: "test", to: "report" },
    ],
  };
}

/**
 * 저장 전에 끊긴 참조, 순환 의존, 완료까지 도달할 수 없는 구성을 찾는다.
 * 캔버스 좌표는 실행에 쓰지 않는다.
 */
export function validateGraph(graph: WorkflowGraph) {
  const problems: string[] = [];
  if (!graph.stages.length) return ["단계가 하나도 없어요."];
  const ids = new Set<string>();
  for (const stage of graph.stages) {
    if (ids.has(stage.id)) problems.push("단계 ID가 겹쳐요. " + stage.id);
    ids.add(stage.id);
    if (!stageRoles.includes(stage.roleId))
      problems.push("담당 역할을 알 수 없어요. " + stage.title);
    if (!stage.criterion.trim())
      problems.push("완료 조건이 비었어요. " + stage.title);
  }
  const edges = new Set<string>();
  for (const edge of graph.edges) {
    if (!ids.has(edge.from))
      problems.push("연결의 출발 단계를 찾을 수 없어요. " + edge.from);
    if (!ids.has(edge.to))
      problems.push("연결의 도착 단계를 찾을 수 없어요. " + edge.to);
    if (edge.from === edge.to)
      problems.push("단계가 자기 자신과 연결돼 있어요. " + edge.from);
    const key = edge.from + "→" + edge.to;
    if (edges.has(key)) problems.push("같은 연결이 두 번 있어요. " + key);
    edges.add(key);
  }
  if (problems.length) return problems;

  const next = new Map<string, string[]>();
  const previous = new Map<string, string[]>();
  for (const id of ids) {
    next.set(id, []);
    previous.set(id, []);
  }
  for (const edge of graph.edges) {
    next.get(edge.from)!.push(edge.to);
    previous.get(edge.to)!.push(edge.from);
  }
  const state = new Map<string, "open" | "done">();
  const visit = (id: string): boolean => {
    if (state.get(id) === "open") return false;
    if (state.get(id) === "done") return true;
    state.set(id, "open");
    for (const target of next.get(id)!) if (!visit(target)) return false;
    state.set(id, "done");
    return true;
  };
  for (const id of ids) if (!visit(id)) break;
  if ([...state.values()].includes("open"))
    problems.push("단계 연결이 순환해 실행 순서를 정할 수 없어요.");
  if (problems.length) return problems;

  const starts = [...ids].filter((id) => !previous.get(id)!.length);
  if (!starts.length) return ["시작 단계가 없어요."];
  const reachable = new Set<string>();
  const walk = (id: string) => {
    if (reachable.has(id)) return;
    reachable.add(id);
    for (const target of next.get(id)!) walk(target);
  };
  for (const id of starts) walk(id);
  for (const stage of graph.stages)
    if (!reachable.has(stage.id))
      problems.push("시작 단계에서 이어지지 않아요. " + stage.title);

  const ends = [...ids].filter((id) => !next.get(id)!.length);
  if (!ends.length) problems.push("끝나는 단계가 없어요.");
  const requiredEnd = graph.stages.find(
    ({ id, required }) => required && ends.includes(id),
  );
  if (ends.length && !requiredEnd)
    problems.push("완료를 판단할 필수 단계가 끝에 없어요.");
  for (const stage of graph.stages)
    if (stage.required && !reachable.has(stage.id))
      problems.push("필수 단계까지 이어지는 경로가 없어요. " + stage.title);
  return problems;
}

/** 실행 조건이 비어 있으면 항상 실행하고, 있으면 요청에 그 말이 나올 때만 실행한다. */
export function stageApplies(stage: WorkflowStage, request: string) {
  const condition = stage.condition.trim();
  if (!condition) return true;
  const words = condition
    .split(/[,，]/)
    .map((word) => word.trim().toLowerCase())
    .filter(Boolean);
  const text = request.toLowerCase();
  return words.some((word) => text.includes(word));
}

/** 검증 단계는 리뷰·스타일·테스트 역할을 맡은 단계다. */
export function verificationStages(graph: WorkflowGraph) {
  return workflowOrder(graph)
    .map((id) => graph.stages.find((stage) => stage.id === id)!)
    .filter(({ roleId }) => roleId === "review" || roleId === "style" || roleId === "test");
}

export function workflowOrder(graph: WorkflowGraph) {
  const previous = new Map(graph.stages.map(({ id }) => [id, 0]));
  for (const edge of graph.edges)
    previous.set(edge.to, (previous.get(edge.to) ?? 0) + 1);
  const order: string[] = [];
  const remaining = new Set(graph.stages.map(({ id }) => id));
  while (remaining.size) {
    const ready = [...remaining].filter((id) => !previous.get(id));
    if (!ready.length) break;
    for (const id of ready) {
      order.push(id);
      remaining.delete(id);
      for (const edge of graph.edges)
        if (edge.from === id) previous.set(edge.to, previous.get(edge.to)! - 1);
    }
  }
  return order;
}

/** 건너뛴 단계는 합류에서 대기 대상으로 세지 않는다. */
export function remainingStages(
  graph: WorkflowGraph,
  done: string[],
  skipped: string[] = [],
) {
  return workflowOrder(graph).filter(
    (id) => !done.includes(id) && !skipped.includes(id),
  );
}
