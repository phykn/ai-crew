import React, {
  useEffect,
  useRef,
  useState,
  createContext,
  useContext,
} from "react";
import { createRoot } from "react-dom/client";
import {
  ReactFlow,
  Background,
  Controls,
  Handle,
  Position,
  MarkerType,
  addEdge,
  reconnectEdge,
  useNodesState,
  useEdgesState,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import "./editor.css";

const Roles = createContext([]);
function Stage({ id, data, selected }) {
  const role = useContext(Roles)[data.role];
  return (
    <div
      className={
        "crew-node" + (selected ? " chosen" : "") + (role ? "" : " terminal")
      }
      style={{ "--role": role?.color || "#c8b084" }}
    >
      {id !== "start" && <Handle type="target" position={Position.Top} />}
      {role && (
        <small>
          {role.role === data.label ? role.name : role.role + " · " + role.name}
        </small>
      )}
      <strong>{data.label || "이름 없는 단계"}</strong>
      {id !== "end" && <Handle type="source" position={Position.Bottom} />}
    </div>
  );
}
const nodeTypes = { crew: Stage };
function visualNodes(graph) {
  return graph.nodes.map((n) => ({
    ...n,
    type: "crew",
    deletable: !["start", "end"].includes(n.id),
  }));
}
function definition(nodes, edges) {
  return {
    nodes: nodes.map(({ id, position, data }) => ({ id, position, data })),
    edges: edges.map(({ id, source, target }) => ({ id, source, target })),
  };
}
function logic(graph) {
  return JSON.stringify([
    graph.nodes.map(({ id, data }) => [id, data]),
    graph.edges.map(({ source, target }) => source + ">" + target).sort(),
  ]);
}
function Editor({ config, controls }) {
  const [nodes, setNodes, onNodesChange] = useNodesState(
    visualNodes(config.draft || config.graph),
  );
  const [edges, setEdges, onEdgesChange] = useEdgesState(
    (config.draft || config.graph).edges,
  );
  const [notice, setNotice] = useState("");
  const [saved, setSaved] = useState(config.graph);
  const [version, setVersion] = useState(config.version);
  const canvas = useRef(null),
    instance = useRef(null);
  const [editingId, setEditingId] = useState(null);
  const editing = nodes.find((node) => node.id === editingId);
  const details = useRef(null);
  useEffect(() => {
    if (editingId && !details.current.open) details.current.showModal();
  }, [editingId]);
  useEffect(() => {
    let previousWidth;
    const observer = new ResizeObserver(([entry]) => {
      const { width, height } = entry.contentRect;
      if (!width || !height) return;
      if (previousWidth && Math.abs(width - previousWidth) > 80) {
        instance.current?.fitView({ padding: "6%" });
      }
      previousWidth = width;
    });
    observer.observe(canvas.current);
    return () => observer.disconnect();
  }, []);
  const draft = definition(nodes, edges);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  controls.getDraft = () => (dirty ? draft : null);
  useEffect(() => {
    setNotice("");
  }, [nodes, edges]);
  function change(key, value) {
    setNodes((list) =>
      list.map((n) =>
        n.id === editingId ? { ...n, data: { ...n.data, [key]: value } } : n,
      ),
    );
  }
  function addStage() {
    const rect = canvas.current.getBoundingClientRect();
    const position = instance.current.screenToFlowPosition({
      x: rect.left + rect.width * 0.45,
      y: rect.top + rect.height * 0.65,
    });
    const id = crypto.randomUUID();
    setNodes((list) => [
      ...list.map((n) => ({ ...n, selected: false })),
      {
        id,
        position,
        type: "crew",
        selected: true,
        data: { label: "새 단계", role: 4, access: "자료 조회", criterion: "" },
      },
    ]);
    setEditingId(id);
  }
  function removeStage() {
    setNodes((list) => list.filter((node) => node.id !== editingId));
    setEdges((list) =>
      list.filter(
        (edge) => edge.source !== editingId && edge.target !== editingId,
      ),
    );
    details.current.close();
  }
  function save() {
    try {
      config.validate(draft);
    } catch (e) {
      setNotice(e.message);
      return;
    }
    const logicChanged = logic(draft) !== logic(saved);
    setVersion(config.save(draft, logicChanged));
    setSaved(draft);
    setNotice(
      logicChanged ? "다음 새 업무부터 적용돼요." : "배치를 저장했어요.",
    );
  }
  return (
    <Roles.Provider value={config.roles}>
      <section className="flow-view">
        <div className="flow-tools">
          <div className="flow-context" title={config.projectName}>
            <strong>{config.projectName}</strong>
            <small>
              v{version}
              {dirty ? " · 저장 전" : ""}
            </small>
          </div>
          <button onClick={addStage}>＋ 단계</button>
          <button className="primary" onClick={save} disabled={!dirty}>
            저장
          </button>
        </div>
        <div
          className="flow-space"
          role="region"
          aria-label="연결점을 끌어 단계를 잇고, 노드에서 Enter를 눌러 단계 속성을 엽니다."
          ref={canvas}
          onKeyDownCapture={(event) => {
            if (event.key !== "Enter" || event.repeat) return;
            const id = event.target.closest(".react-flow__node")?.dataset.id;
            if (
              nodes.some(
                (node) => node.id === id && node.data.role !== undefined,
              )
            ) {
              event.preventDefault();
              event.stopPropagation();
              setEditingId(id);
            }
          }}
        >
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            nodeTypes={nodeTypes}
            fitView
            fitViewOptions={{ padding: "6%" }}
            minZoom={0.2}
            maxZoom={2}
            onInit={(i) => (instance.current = i)}
            connectOnClick={false}
            onNodeDoubleClick={(_, node) => {
              if (node.data.role !== undefined) setEditingId(node.id);
            }}
            onConnect={(c) => setEdges((es) => addEdge(c, es))}
            onReconnect={(e, c) => setEdges((es) => reconnectEdge(e, c, es))}
            isValidConnection={(c) =>
              c.source !== c.target &&
              c.target !== "start" &&
              c.source !== "end" &&
              !(c.source === "start" && c.target === "end")
            }
            defaultEdgeOptions={{
              type: "smoothstep",
              markerEnd: { type: MarkerType.ArrowClosed },
            }}
            colorMode="dark"
            deleteKeyCode={["Delete", "Backspace"]}
          >
            <Background gap={20} size={1} />
            <Controls showInteractive={false} />
          </ReactFlow>
        </div>
        <dialog
          ref={details}
          className="stage-details"
          aria-label="단계 속성"
          onClose={() => setEditingId(null)}
        >
          {editing && (
            <>
              <header>
                <h2>단계 속성</h2>
              </header>
              <label>
                이름{" "}
                <input
                  value={editing.data.label}
                  onChange={(e) => change("label", e.target.value)}
                />
              </label>
              <label>
                담당 역할
                <select
                  value={editing.data.role}
                  onChange={(e) => change("role", Number(e.target.value))}
                >
                  {config.roles.map((role, index) => (
                    <option key={index} value={index}>
                      {role.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                요청 권한
                <select
                  value={editing.data.access}
                  onChange={(e) => change("access", e.target.value)}
                >
                  {["자료 조회", "파일 수정", "외부 전달"].map((access) => (
                    <option key={access}>{access}</option>
                  ))}
                </select>
              </label>
              <label>
                완료 조건{" "}
                <textarea
                  value={editing.data.criterion}
                  onChange={(e) => change("criterion", e.target.value)}
                />
              </label>
              <div className="stage-actions">
                <button onClick={removeStage}>단계 삭제</button>
                <button onClick={() => details.current.close()}>닫기</button>
              </div>
            </>
          )}
        </dialog>
        <footer className="flow-foot" role="status" hidden={!notice}>
          {notice}
        </footer>
      </section>
    </Roles.Provider>
  );
}
window.mountCrewFlow = (element, config) => {
  const root = createRoot(element),
    controls = {
      getDraft: () => config.draft || null,
      dispose: () => root.unmount(),
    };
  root.render(<Editor controls={controls} config={config} />);
  return controls;
};
