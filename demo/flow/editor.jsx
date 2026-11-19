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
      {id !== "start" && <Handle type="target" position={Position.Left} />}
      {role && (
        <small>
          {role.role === data.label ? role.name : role.role + " · " + role.name}
        </small>
      )}
      <strong>{data.label || "이름 없는 단계"}</strong>
      {id !== "end" && <Handle type="source" position={Position.Right} />}
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
  const [error, setError] = useState("");
  const [saved, setSaved] = useState(config.graph);
  const [version, setVersion] = useState(config.version);
  const canvas = useRef(null),
    instance = useRef(null);
  const selected = nodes.find((n) => n.selected && n.data.role !== undefined);
  const selectedEdge = edges.find((e) => e.selected);
  const draft = definition(nodes, edges);
  const dirty = JSON.stringify(draft) !== JSON.stringify(saved);
  controls.getDraft = () => (dirty ? draft : null);
  useEffect(() => {
    setError("");
  }, [nodes, edges]);
  function change(key, value) {
    setNodes((list) =>
      list.map((n) =>
        n.id === selected.id ? { ...n, data: { ...n.data, [key]: value } } : n,
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
  }
  function removeSelected() {
    if (selected) {
      setNodes((list) => list.filter((n) => n.id !== selected.id));
      setEdges((list) =>
        list.filter(
          (e) => e.source !== selected.id && e.target !== selected.id,
        ),
      );
    } else if (selectedEdge)
      setEdges((list) => list.filter((e) => e.id !== selectedEdge.id));
  }
  function loadPreset(name) {
    const preset = config.makeStages(name);
    setNodes(visualNodes(preset));
    setEdges(preset.edges);
    requestAnimationFrame(() => instance.current?.fitView({ padding: "6%" }));
  }
  function save() {
    try {
      config.validate(draft);
    } catch (e) {
      setError(e.message);
      return;
    }
    setVersion(config.save(draft, logic(draft) !== logic(saved)));
    setSaved(draft);
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
          <select
            aria-label="워크플로우 예시로 초안 교체"
            value=""
            onChange={(e) => loadPreset(e.target.value)}
          >
            <option value="" disabled>
              예시
            </option>
            <option>개발</option>
            <option>조사</option>
          </select>
          <button className="primary" onClick={save} disabled={!dirty}>
            저장
          </button>
        </div>
        <div className="flow-layout">
          <div className="flow-space" ref={canvas}>
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
          {selected && (
            <aside className="flow-inspector">
              <h3>단계 속성</h3>
              <label>
                이름
                <input
                  value={selected.data.label}
                  onChange={(e) => change("label", e.target.value)}
                />
              </label>
              <label>
                담당 역할
                <select
                  value={selected.data.role}
                  onChange={(e) => change("role", Number(e.target.value))}
                >
                  {config.roles.map((r, i) => (
                    <option key={i} value={i}>
                      {r.role}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                요청 권한
                <select
                  value={selected.data.access}
                  onChange={(e) => change("access", e.target.value)}
                >
                  {["자료 조회", "파일 수정", "외부 전달"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                완료 조건
                <textarea
                  value={selected.data.criterion}
                  onChange={(e) => change("criterion", e.target.value)}
                />
              </label>
              <details>
                <summary>선행 단계</summary>
                {nodes
                  .filter((n) => n.id !== selected.id && n.id !== "end")
                  .map((n) => (
                    <label key={n.id}>
                      <input
                        type="checkbox"
                        checked={edges.some(
                          (e) => e.source === n.id && e.target === selected.id,
                        )}
                        onChange={(e) =>
                          setEdges((es) =>
                            e.target.checked
                              ? addEdge(
                                  { source: n.id, target: selected.id },
                                  es,
                                )
                              : es.filter(
                                  (edge) =>
                                    !(
                                      edge.source === n.id &&
                                      edge.target === selected.id
                                    ),
                                ),
                          )
                        }
                      />
                      {n.data.label}
                    </label>
                  ))}
              </details>
              <button onClick={removeSelected}>단계 삭제</button>
            </aside>
          )}
          {!selected && selectedEdge && (
            <aside className="edge-action">
              <button onClick={removeSelected}>선택한 연결 삭제</button>
            </aside>
          )}
        </div>
        <footer className="flow-foot" role="status">
          {error ||
            "저장한 흐름은 다음 새 업무부터 적용돼요. 노드 위치는 실행 순서에 영향을 주지 않아요."}
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
