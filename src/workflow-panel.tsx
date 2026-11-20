import { useMemo, useState } from "react";
import {
  Background,
  Controls,
  Handle,
  Position,
  ReactFlow,
  type Edge,
  type Node,
  type NodeChange,
  type NodeProps,
  type OnNodesChange,
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
} from "./actions";
import { validateGraph } from "./workflow-graph";

export type FlowDraft = {
  id: string;
  name: string;
  version: number;
  graph: WorkflowGraph;
};

type StageData = { stage: WorkflowStage };
type StageNode = Node<StageData, "stage">;

function StageCard({ data, selected }: NodeProps<StageNode>) {
  const role = roles.find(({ id }) => id === data.stage.roleId);
  return (
    <div
      className="stage-card"
      data-required={data.stage.required}
      data-selected={selected}
      style={{ borderColor: role?.color ?? "#8b8577" }}
    >
      <Handle type="target" position={Position.Top} />
      <strong style={{ color: role?.color }}>{data.stage.title}</strong>
      <small>
        {role?.title ?? data.stage.roleId} ·{" "}
        {data.stage.required ? "필수" : "선택"}
      </small>
      {data.stage.condition && <em>{data.stage.condition}</em>}
      <Handle type="source" position={Position.Bottom} />
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

function toEdges(graph: WorkflowGraph): Edge[] {
  return graph.edges.map(({ from, to }) => ({
    id: from + "-" + to,
    source: from,
    target: to,
  }));
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
  const [saved, setSaved] = useState<string>("");
  const [busy, setBusy] = useState(false);
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
  const edges = useMemo(() => (flow ? toEdges(flow.graph) : []), [flow]);

  if (!flow) return <p className="muted">이 프로젝트에 워크플로우가 없어요.</p>;

  const update = (graph: WorkflowGraph) => {
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
    const list = (Array.isArray(changes) ? changes : [changes]) as NodeChange<StageNode>[];
    const moved = new Map(
      list.flatMap((change) =>
        change.type === "position" && change.position
          ? [[change.id, change.position] as const]
          : [],
      ),
    );
    if (!moved.size) return;
    update({
      ...flow.graph,
      stages: flow.graph.stages.map((item) => {
        const position = moved.get(item.id);
        return position ? { ...item, x: position.x, y: position.y } : item;
      }),
    });
    setSaved("");
  };
  const connect = (from: string, to: string) => {
    if (
      !from ||
      !to ||
      from === to ||
      flow.graph.edges.some((edge) => edge.from === from && edge.to === to)
    )
      return;
    update({ ...flow.graph, edges: [...flow.graph.edges, { from, to }] });
  };
  const removeEdge = (id: string) => {
    const [from, to] = id.split("-");
    update({
      ...flow.graph,
      edges: flow.graph.edges.filter(
        (edge) => !(edge.from === from && edge.to === to),
      ),
    });
  };
  const addStage = () => {
    const id = "stage-" + (flow.graph.stages.length + 1);
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
  };
  const removeStage = (id: string) => {
    update({
      stages: flow.graph.stages.filter((item) => item.id !== id),
      edges: flow.graph.edges.filter(
        (edge) => edge.from !== id && edge.to !== id,
      ),
    });
    setPicked(null);
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
        <button type="button" disabled={busy} onClick={() => void save()}>
          저장 v{flow.version + 1}
        </button>
        <span className="workflow-state" role="status">
          {saved || (flow.version ? "적용 중 v" + flow.version : "")}
        </span>
      </div>
      <small className="muted workflow-hint">
        노드를 끌어 배치를 바꾸고, 아래 연결점에서 위 연결점으로 이어 실행 순서를
        정해요. 노드를 두 번 누르면 속성을 편집합니다. 저장한 버전은 다음 새
        업무부터 적용돼요.
      </small>
      {error && <p role="alert">{error}</p>}
      <div className="flow-canvas">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          onNodesChange={moveNodes}
          onEdgesDelete={(removed) => removed.forEach(({ id }) => removeEdge(id))}
          onConnect={(connection) => connect(connection.source, connection.target)}
          onNodeDoubleClick={(_, node) => setPicked(node.id)}
          onEdgeClick={(_, edge) => removeEdge(edge.id)}
          fitView
          minZoom={0.4}
          maxZoom={1.6}
          proOptions={{ hideAttribution: true }}
        >
          <Background gap={24} />
          <Controls showInteractive={false} />
        </ReactFlow>
      </div>
      {stage ? (
        <form
          className="stage-form"
          onSubmit={(event) => {
            event.preventDefault();
            void save();
          }}
        >
          <header>
            <strong>{stage.title} 속성</strong>
            <button type="button" onClick={() => setPicked(null)}>
              닫기
            </button>
          </header>
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
                patchStage(stage.id, { roleId: event.target.value as RoleId })
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
            인계 산출물
            <input
              maxLength={300}
              value={stage.artifact}
              onChange={(event) =>
                patchStage(stage.id, { artifact: event.target.value })
              }
            />
          </label>
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
            실행 조건
            <input
              maxLength={300}
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
          <button type="button" onClick={() => removeStage(stage.id)}>
            단계 삭제
          </button>
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
                  await run({ type: "workflow.apply", jobId: activeJob.id, scope: "current" })
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
                  await run({ type: "workflow.apply", jobId: activeJob.id, scope: "once" })
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
