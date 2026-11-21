import { useEffect, useMemo, useRef, useState } from "react";
import {
  Background,
  BaseEdge,
  ConnectionMode,
  Controls,
  EdgeLabelRenderer,
  Handle,
  MarkerType,
  Position,
  ReactFlow,
  getSmoothStepPath,
  type Connection,
  type Edge,
  type EdgeProps,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnConnectEnd,
  type OnNodesChange,
  type ReactFlowInstance,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import {
  roles,
  type Action,
  type RoleId,
  type Snapshot,
  type Workflow,
  type WorkflowGraph,
  type WorkflowStage,
} from "../../../shared/actions";
import {
  connectStages,
  connectable,
  disconnectStages,
  moveStage,
  validateGraph,
} from "../../../backend/workflow/graph";

export type FlowDraft = {
  id: string;
  name: string;
  version: number;
  graph: WorkflowGraph;
};

type StageData = { stage: WorkflowStage };
type StageNode = Node<StageData, "stage">;

type EdgeData = {
  from: string;
  to: string;
  cut: (from: string, to: string) => void;
};
type FlowEdge = Edge<EdgeData>;

/** 연결선 위에 뜨는 ✕. 선을 누르면 진해지고, 그 자리에서 바로 끊을 수 있다. */
function CutEdge({
  id,
  data,
  selected,
  markerEnd,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps<FlowEdge>) {
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 16,
    offset: 18,
  });
  return (
    <>
      <BaseEdge
        id={id}
        path={path}
        markerEnd={markerEnd}
        className="flow-edge-line"
        style={{
          stroke: selected ? "#d9a24a" : "#9fb28d",
          strokeWidth: selected ? 2.6 : 1.8,
        }}
      />
      {selected && (
        <EdgeLabelRenderer>
          <button
            type="button"
            className="edge-cut nodrag nopan"
            style={{
              transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            }}
            aria-label="연결 끊기"
            title="연결 끊기 (Delete)"
            onClick={() => data && data.cut(data.from, data.to)}
          >
            ✕
          </button>
        </EdgeLabelRenderer>
      )}
    </>
  );
}

const edgeTypes = { cut: CutEdge };

function StageCard({ data, selected }: NodeProps<StageNode>) {
  const role = roles.find(({ id }) => id === data.stage.roleId);
  return (
    <div
      className="stage-card"
      data-required={data.stage.required}
      data-selected={selected}
    >
      <Handle
        type="target"
        id="in"
        position={Position.Top}
        className="stage-handle stage-handle-in"
        title="여기로 이어 받기"
      />
      <span className="stage-role">
        <i style={{ background: role?.color ?? "#b8a78c" }} aria-hidden />
        {role?.title ?? data.stage.roleId}
      </span>
      <strong>{data.stage.title}</strong>
      {data.stage.condition && <em>{data.stage.condition}</em>}
      {!data.stage.required && <small>선택 단계</small>}
      <Handle
        type="source"
        id="out"
        position={Position.Bottom}
        className="stage-handle stage-handle-out"
        title="끌어서 다음 단계와 잇기"
      />
    </div>
  );
}

const nodeTypes = { stage: StageCard };

function toNodes(graph: WorkflowGraph): StageNode[] {
  return graph.stages.map((stage) => ({
    id: stage.id,
    type: "stage",
    position: { x: stage.x, y: stage.y },
    data: { stage },
  }));
}

function clientPoint(event: MouseEvent | TouchEvent) {
  if ("clientX" in event) return { x: event.clientX, y: event.clientY };
  const touch = event.changedTouches[0] ?? event.touches[0];
  return touch ? { x: touch.clientX, y: touch.clientY } : null;
}

export function WorkflowPanel({
  data,
  draft,
  setDraft,
  run,
  error,
  openJob,
}: {
  data: Snapshot;
  draft: FlowDraft | null;
  setDraft: (draft: FlowDraft | null) => void;
  run: (action: Action) => Promise<boolean>;
  error: string;
  openJob: (jobId: string) => void;
}) {
  const [picked, setPicked] = useState<string | null>(null);
  const [pickedEdge, setPickedEdge] = useState<string | null>(null);
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const canvas = useRef<HTMLDivElement>(null);
  const instance = useRef<ReactFlowInstance<StageNode, FlowEdge> | null>(null);
  const workflows = data.workflows;
  const current =
    workflows.find(({ id }) => id === draft?.id) ??
    workflows.find(({ id }) => id === data.session?.workflowId) ??
    workflows[0];
  const flow: FlowDraft | null =
    draft && current && draft.id === current.id
      ? draft
      : current
        ? {
            id: current.id,
            name: current.name,
            version: current.version,
            graph: current.graph,
          }
        : null;
  const stage = flow?.graph.stages.find(({ id }) => id === picked) ?? null;
  const activeJob =
    data.jobs.find(
      (job) => !["complete", "denied", "failed"].includes(job.state),
    ) ?? null;
  const nodes = useMemo(() => (flow ? toNodes(flow.graph) : []), [flow]);
  const edges: FlowEdge[] = useMemo(() => {
    if (!flow) return [];
    const cut = (from: string, to: string) => {
      update(disconnectStages(flow.graph, from, to));
      setPickedEdge((id) => (id === from + "→" + to ? null : id));
    };
    return flow.graph.edges.map(({ from, to }) => {
      const id = from + "→" + to;
      const selected = id === pickedEdge;
      return {
        id,
        type: "cut",
        source: from,
        target: to,
        sourceHandle: "out",
        targetHandle: "in",
        selected,
        data: { from, to, cut },
        markerEnd: {
          type: MarkerType.ArrowClosed,
          width: 16,
          height: 16,
          color: selected ? "#d9a24a" : "#9fb28d",
        },
      };
    });
  }, [flow, pickedEdge]);

  // 속성 줄이 열리고 닫혀 캔버스 높이가 크게 바뀌면 그래프 전체가 다시 보이게 맞춘다.
  useEffect(() => {
    const element = canvas.current;
    if (!element) return;
    let previous = element.clientHeight;
    const observer = new ResizeObserver(([entry]) => {
      const height = entry.contentRect.height;
      if (!height) return;
      if (previous && Math.abs(height - previous) > 60)
        instance.current?.fitView({ padding: 0.12, duration: 200 });
      previous = height;
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  // 고른 연결선은 Delete/Backspace로 바로 끊는다. 입력 중인 글자는 건드리지 않는다.
  useEffect(() => {
    if (!pickedEdge || !flow) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Delete" && event.key !== "Backspace") return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.isContentEditable ||
          ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName))
      )
        return;
      event.preventDefault();
      const [from, to] = pickedEdge.split("→");
      setSaved("");
      setDraft({ ...flow, graph: disconnectStages(flow.graph, from, to) });
      setPickedEdge(null);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pickedEdge, flow, setDraft]);

  if (!flow) return <p className="muted">이 프로젝트에 워크플로우가 없어요.</p>;

  const update = (graph: WorkflowGraph) => {
    if (graph === flow.graph) return;
    setSaved("");
    setDraft({ ...flow, graph });
  };
  const patchStage = (id: string, patch: Partial<WorkflowStage>) =>
    update({
      ...flow.graph,
      stages: flow.graph.stages.map((item) =>
        item.id === id ? { ...item, ...patch } : item,
      ),
    });
  const moveNodes: OnNodesChange<StageNode> = (changes) => {
    const list: NodeChange<StageNode>[] = Array.isArray(changes)
      ? changes
      : [...changes];
    let graph = flow.graph;
    for (const change of list)
      if (change.type === "position" && change.position)
        graph = moveStage(
          graph,
          change.id,
          change.position.x,
          change.position.y,
        );
    update(graph);
  };
  const connect = (connection: Connection) => {
    if (!connection.source || !connection.target) return;
    update(connectStages(flow.graph, connection.source, connection.target));
    setPickedEdge(null);
  };
  // 연결점에 정확히 놓지 않아도, 다른 단계 카드 위에서 손을 떼면 그 단계와 이어진다.
  const endConnect: OnConnectEnd = (event, state) => {
    const from = state.fromNode?.id;
    if (!from || state.isValid) return;
    const point = clientPoint(event);
    if (!point) return;
    const hit = document
      .elementFromPoint(point.x, point.y)
      ?.closest<HTMLElement>(".react-flow__node")?.dataset.id;
    if (!hit || hit === from) return;
    update(connectStages(flow.graph, from, hit));
    setPicked(null);
    setPickedEdge(null);
  };
  const addStage = () => {
    let n = flow.graph.stages.length + 1;
    while (flow.graph.stages.some(({ id }) => id === "stage-" + n)) n++;
    const id = "stage-" + n;
    const y = Math.max(0, ...flow.graph.stages.map(({ y: top }) => top)) + 120;
    update({
      ...flow.graph,
      stages: [
        ...flow.graph.stages,
        {
          id,
          title: "새 단계",
          roleId: "review",
          criterion: "확인할 완료 조건",
          artifact: "",
          condition: "",
          required: true,
          x: 280,
          y,
        },
      ],
    });
    setPicked(id);
    setPickedEdge(null);
  };
  const removeStage = (id: string) => {
    update({
      stages: flow.graph.stages.filter((item) => item.id !== id),
      edges: flow.graph.edges.filter(
        (edge) => edge.from !== id && edge.to !== id,
      ),
    });
    setPicked(null);
    setPickedEdge(null);
  };
  const save = async () => {
    const problems = validateGraph(flow.graph);
    if (problems.length) {
      setSaved(problems[0]);
      return;
    }
    setBusy(true);
    try {
      if (
        await run({
          type: "workflow.save",
          projectId: data.current!.id,
          workflowId: flow.id,
          version: flow.version,
          name: flow.name.trim() || current!.name,
          graph: flow.graph,
        })
      ) {
        setDraft({ ...flow, version: flow.version + 1 });
        setSaved("저장했어요. 적용 버전 v" + (flow.version + 1));
      }
    } finally {
      setBusy(false);
    }
  };
  const select = (workflow: Workflow) => {
    if (data.session)
      void run({
        type: "workflow.select",
        sessionId: data.session.id,
        workflowId: workflow.id,
      });
    setDraft({
      id: workflow.id,
      name: workflow.name,
      version: workflow.version,
      graph: workflow.graph,
    });
    setPicked(null);
    setPickedEdge(null);
  };

  return (
    <section className="workflow-panel" aria-label="워크플로우 편집기">
      <div className="workflow-tools">
        <select
          aria-label="워크플로우 선택"
          value={flow.id}
          onChange={(event) => {
            const next = workflows.find(({ id }) => id === event.target.value);
            if (next) select(next);
          }}
        >
          {workflows.map((workflow) => (
            <option value={workflow.id} key={workflow.id}>
              {workflow.name} v{workflow.version}
            </option>
          ))}
        </select>
        <input
          aria-label="워크플로우 이름"
          maxLength={64}
          value={flow.name}
          onChange={(event) => setDraft({ ...flow, name: event.target.value })}
        />
        <button type="button" onClick={addStage}>
          ＋ 단계
        </button>
        <button
          type="button"
          className="workflow-save"
          disabled={busy}
          onClick={() => void save()}
        >
          저장
        </button>
        <span className="workflow-state" role="status">
          {saved ||
            (flow.version
              ? "적용 중 v" + flow.version
              : "저장 전")}
        </span>
      </div>
      <div className="workflow-legend" aria-hidden>
        <span>
          <i className="legend-drag" /> 노드를 끌어 옮기기
        </span>
        <span>
          <i className="legend-handle" /> 아래 점에서 위 점으로 끌어 잇기
        </span>
        <span>
          <i className="legend-cut">✕</i> 선을 누르고 Delete
        </span>
      </div>
      {error && <p role="alert">{error}</p>}
      <div
        ref={canvas}
        className="flow-canvas"
        role="region"
        aria-label="워크플로우 캔버스. 노드를 끌어 옮기고, 노드의 연결점에서 다른 노드로 끌어 실행 순서를 이어요."
      >
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={moveNodes}
          onConnect={connect}
          onConnectEnd={endConnect}
          isValidConnection={(connection) =>
            connectable(flow.graph, connection.source, connection.target)
          }
          connectionMode={ConnectionMode.Loose}
          connectionRadius={30}
          connectionLineStyle={{ stroke: "#d9a24a", strokeWidth: 2 }}
          onNodeClick={(_, node) => {
            setPicked(node.id);
            setPickedEdge(null);
          }}
          onNodeDoubleClick={(_, node) => setPicked(node.id)}
          onEdgeClick={(_, edge) => {
            setPickedEdge(edge.id);
            setPicked(null);
          }}
          onInit={(flowInstance) => {
            instance.current = flowInstance;
          }}
          onPaneClick={() => {
            setPicked(null);
            setPickedEdge(null);
          }}
          onEdgesDelete={(removed) => {
            let graph = flow.graph;
            for (const edge of removed)
              if (edge.data)
                graph = disconnectStages(graph, edge.data.from, edge.data.to);
            update(graph);
          }}
          deleteKeyCode={null}
          edgesFocusable={false}
          fitView
          fitViewOptions={{ padding: 0.12 }}
          minZoom={0.35}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={22} size={1.3} color="#d9cdb8" />
          <Controls showInteractive={false} position="bottom-left" />
        </ReactFlow>
        {!flow.graph.edges.length && (
          <p className="flow-empty-hint">
            아래 점에서 다른 단계의 위 점으로 끌면 실행 순서가 이어져요.
          </p>
        )}
      </div>
      {stage ? (
        <form
          className="stage-inspector"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header>
            <span
              className="stage-inspector-dot"
              style={{
                background:
                  roles.find(({ id }) => id === stage.roleId)?.color ?? "#b8a78c",
              }}
              aria-hidden
            />
            <strong>{stage.title || "이름 없는 단계"}</strong>
            {roles.find(({ id }) => id === stage.roleId)?.title !==
              stage.title && (
              <small className="muted">
                {roles.find(({ id }) => id === stage.roleId)?.title ??
                  stage.roleId}
              </small>
            )}
            <button type="button" onClick={() => setPicked(null)}>
              닫기
            </button>
          </header>
          <div className="stage-fields">
            <label>
              이름
              <input
                maxLength={64}
                value={stage.title}
                onChange={(event) =>
                  patchStage(stage.id, { title: event.target.value })
                }
              />
            </label>
            <label>
              담당 역할
              <select
                value={stage.roleId}
                onChange={(event) =>
                  patchStage(stage.id, {
                    roleId: event.target.value as RoleId,
                  })
                }
              >
                {roles.map(({ id, title }) => (
                  <option value={id} key={id}>
                    {title}
                  </option>
                ))}
              </select>
            </label>
            <label>
              실행 조건
              <input
                maxLength={300}
                placeholder="비우면 항상 실행"
                value={stage.condition}
                onChange={(event) =>
                  patchStage(stage.id, { condition: event.target.value })
                }
              />
            </label>
            <label className="stage-required">
              <input
                type="checkbox"
                checked={stage.required}
                onChange={(event) =>
                  patchStage(stage.id, { required: event.target.checked })
                }
              />
              필수 단계
            </label>
          </div>
          <details className="stage-details">
            <summary>완료 조건과 인계 산출물</summary>
            <label>
              완료 조건
              <textarea
                maxLength={300}
                rows={2}
                value={stage.criterion}
                onChange={(event) =>
                  patchStage(stage.id, { criterion: event.target.value })
                }
              />
            </label>
            <label>
              인계 산출물
              <input
                maxLength={300}
                value={stage.artifact}
                onChange={(event) =>
                  patchStage(stage.id, { artifact: event.target.value })
                }
              />
            </label>
          </details>
          <footer>
            <button
              type="button"
              className="stage-remove"
              onClick={() => removeStage(stage.id)}
            >
              단계 삭제
            </button>
            <small className="muted">
              저장을 눌러야 다음 새 업무부터 적용돼요.
            </small>
          </footer>
        </form>
      ) : (
        <div className="workflow-apply">
          <p className="muted">
            저장한 규칙은 다음 새 업무부터 적용돼요. 진행 중인 업무에는 사용자가
            지정할 때만 적용합니다.
          </p>
          <button
            type="button"
            disabled={!activeJob || busy}
            onClick={async () => {
              if (!activeJob) return;
              setBusy(true);
              try {
                if (
                  await run({
                    type: "workflow.apply",
                    jobId: activeJob.id,
                    scope: "current",
                  })
                )
                  setSaved("진행 중인 업무에 적용했어요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            이번 업무에도
          </button>
          <button
            type="button"
            disabled={!activeJob || busy}
            onClick={async () => {
              if (!activeJob) return;
              setBusy(true);
              try {
                if (
                  await run({
                    type: "workflow.apply",
                    jobId: activeJob.id,
                    scope: "once",
                  })
                )
                  setSaved("이번 업무에만 적용했어요.");
              } finally {
                setBusy(false);
              }
            }}
          >
            이번에만
          </button>
          {activeJob ? (
            <button type="button" onClick={() => openJob(activeJob.id)}>
              {activeJob.plan?.goal ?? activeJob.request}
            </button>
          ) : (
            <small className="muted">진행 중인 업무가 없어요.</small>
          )}
        </div>
      )}
    </section>
  );
}


