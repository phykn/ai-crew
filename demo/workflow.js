"use strict";

const defaultStages = [
  [1, "플랜", 4, "요청 범위와 검증 가능한 완료 조건을 인계한다."],
  [2, "개발", 1, "기존 코드를 재사용하고 첫 미완료 작업의 변경을 확인한다."],
  [3, "리뷰", 3, "요구사항과 기존 동작을 변경 근거로 대조한다."],
  [
    3,
    "코딩 스타일 확인",
    5,
    "관련 프로젝트 지침으로 이름·중복·가독성을 확인한다.",
  ],
  [3, "테스트", 2, "작은 재현부터 실행해 결과와 미확인 범위를 남긴다."],
];
function makeStages() {
  const tokens = getComputedStyle(document.documentElement);
  const columnStep =
    parseFloat(tokens.getPropertyValue("--flow-node-width")) +
    parseFloat(tokens.getPropertyValue("--flow-column-gap"));
  const rowStep = parseFloat(tokens.getPropertyValue("--flow-row-step"));
  const groups = Map.groupBy(defaultStages, (row) => row[0]);
  const nodes = [
    { id: "start", position: { x: 0, y: 0 }, data: { label: "비서 · 요청" } },
  ];
  const edges = [];
  let previous = ["start"];
  for (const [row, rows] of groups) {
    const next = [];
    rows.forEach(([, label, role, criterion], i) => {
      const id = "stage-" + nodes.length;
      nodes.push({
        id,
        position: {
          x: (i - (rows.length - 1) / 2) * columnStep,
          y: row * rowStep,
        },
        data: {
          label,
          role,
          criterion,
          access: role === 1 ? "파일 수정" : "자료 조회",
        },
      });
      for (const source of previous)
        edges.push({ id: source + "-" + id, source, target: id });
      next.push(id);
    });
    previous = next;
  }
  nodes.push({
    id: "end",
    position: { x: 0, y: (groups.size + 1) * rowStep },
    data: { label: "비서 · 보고" },
  });
  for (const source of previous)
    edges.push({ id: source + "-end", source, target: "end" });
  return { nodes, edges };
}
function groupStages(graph) {
  const stages = graph.nodes.filter((n) => n.id !== "start" && n.id !== "end");
  if (!stages.length) throw Error("요청과 보고 사이에 실행 단계를 추가하세요.");
  const done = new Set(["start"]);
  const groups = [];
  for (const node of stages) {
    if (!node.data.label.trim() || !node.data.criterion.trim())
      throw Error("각 단계의 이름과 완료 조건을 입력하세요.");
    if (
      !graph.edges.some((e) => e.target === node.id) ||
      !graph.edges.some((e) => e.source === node.id)
    )
      throw Error(node.data.label + " 단계를 요청부터 보고까지 연결하세요.");
  }
  while (done.size < graph.nodes.length - 1) {
    const ready = stages.filter(
      (n) =>
        !done.has(n.id) &&
        graph.edges
          .filter((e) => e.target === n.id)
          .every((e) => done.has(e.source)),
    );
    if (!ready.length) throw Error("순환하는 연결선을 수정하세요.");
    if (new Set(ready.map((n) => n.data.role)).size !== ready.length)
      throw Error("같은 담당자의 병렬 단계는 순서대로 연결하세요.");
    groups.push(ready.map((n) => ({ ...n.data })));
    ready.forEach((n) => done.add(n.id));
  }
  return groups;
}
let flowEditor;

function showWorkflow(owner) {
  if (flowEditor) return;
  flowEditor = window.mountCrewFlow($("#flow-root"), {
    graph: owner.workflow,
    draft: owner.workflowDraft,
    roles: owner.crew,
    projectName: owner.name,
    version: owner.version,
    validate: groupStages,
    save(graph, logicChanged) {
      owner.workflow = graph;
      if (logicChanged) {
        owner.version++;
        record(
          current,
          "비서",
          "워크플로우 v" + owner.version + " 저장 · 다음 새 업무부터 적용",
        );
      }
      render();
      return owner.version;
    },
  });
}

function releaseWorkflow() {
  if (!flowEditor) return;
  project.workflowDraft = flowEditor.getDraft();
  flowEditor.dispose();
  flowEditor = null;
}

function wikiGraph(entries) {
  if (!entries.length) return '<p class="empty">아직 연결할 문서가 없어요.</p>';
  const width = 360,
    height = Math.max(140, Math.ceil(entries.length / 2) * 80 + 40);
  const coords = entries.map((_, i) => [
    i % 2 ? 266 : 92,
    40 + Math.floor(i / 2) * 80 + (i % 2) * 25,
  ]);
  const edges = [];
  entries.forEach((entry, i) =>
    (entry.links || []).forEach((id) => {
      const j = entries.findIndex((x) => x.id === id);
      if (j < 0) return;
      const mx = (coords[i][0] + coords[j][0]) / 2,
        my = (coords[i][1] + coords[j][1]) / 2;
      const rotation =
        (Math.atan2(coords[j][1] - coords[i][1], coords[j][0] - coords[i][0]) *
          180) /
        Math.PI;
      edges.push(
        `<line x1="${coords[i][0]}" y1="${coords[i][1]}" x2="${coords[j][0]}" y2="${coords[j][1]}"/><path d="M-4 -3 L0 0 L-4 3" transform="translate(${mx} ${my}) rotate(${rotation})"/>`,
      );
    }),
  );
  return `<div class="wiki-graph" style="height:${height}px"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${edges.join("")}</svg>${entries.map((entry, i) => `<button class="wiki-node" data-memory="${i}" title="${safe(entry.title)}" style="left:${(coords[i][0] / width) * 100}%;top:${coords[i][1]}px">${safe(entry.title)}</button>`).join("")}</div>`;
}
