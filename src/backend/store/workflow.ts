// Saved workflows and their versions, plus the model connections the app can call.

import { randomUUID } from "node:crypto";
import { defaultGraph, remainingStages, validateGraph } from "../workflow/graph";
import { type ModelConnection, type Workflow, type WorkflowGraph } from "../../shared/actions";
import { validateEndpointUrl } from "../server/diagnostics/run";
import { StoreMembers } from "./members";
export class StoreWorkflow extends StoreMembers {
  saveWorkflow(
    projectId: string,
    input: {
      id: string;
      version: number;
      name: string;
      graph: WorkflowGraph;
      author: string;
    },
  ) {
    this.getProject(projectId);
    const problems = validateGraph(input.graph);
    if (problems.length) throw new Error(problems[0]);
    return this.transaction(() => {
      const existing = this.db
        .prepare("SELECT project_id FROM workflows WHERE id = ?")
        .get(input.id) as { project_id: string } | undefined;
      let version: number;
      if (existing) {
        if (existing.project_id !== projectId)
          throw new Error("다른 프로젝트의 워크플로우는 저장할 수 없어요.");
        const latest = this.db
          .prepare(
            "SELECT MAX(version) FROM workflow_versions WHERE workflow_id = ?",
          )
          .get(input.id) as { "MAX(version)": number };
        if (latest["MAX(version)"] !== input.version)
          throw new Error(
            "워크플로우가 바뀌었어요. 최신 내용을 확인한 뒤 다시 저장해 주세요.",
          );
        version = input.version + 1;
        this.db
          .prepare("UPDATE workflows SET name = ? WHERE id = ?")
          .run(input.name, input.id);
      } else {
        if (input.version !== 0)
          throw new Error("처음 저장하는 워크플로우는 버전 0에서 시작해 주세요.");
        version = 1;
        this.db
          .prepare("INSERT INTO workflows VALUES (?, ?, ?, ?)")
          .run(input.id, projectId, input.name, new Date().toISOString());
      }
      this.db
        .prepare("INSERT INTO workflow_versions VALUES (?, ?, ?, ?, ?)")
        .run(
          input.id,
          version,
          JSON.stringify(input.graph),
          input.author,
          new Date().toISOString(),
        );
      const session = this.db
        .prepare("SELECT last_session FROM projects WHERE id = ?")
        .get(projectId)?.last_session;
      if (typeof session === "string")
        this.log(
          session,
          input.author +
            " · 워크플로우 저장 · " +
            input.name +
            " v" +
            version,
        );
      return this.getWorkflow(input.id)!;
    });
  }

  getWorkflow(id: string) {
    const row = this.db
      .prepare(
        `SELECT w.id, w.name, v.version, v.graph, v.author, v.saved_at AS savedAt
         FROM workflows w JOIN workflow_versions v ON v.workflow_id = w.id
         WHERE w.id = ? ORDER BY v.version DESC LIMIT 1`,
      )
      .get(id) as (Omit<Workflow, "graph"> & { graph: string }) | undefined;
    if (!row) return undefined;
    return { ...row, graph: JSON.parse(row.graph) as WorkflowGraph };
  }

  getWorkflowVersion(id: string, version: number) {
    const row = this.db
      .prepare(
        `SELECT w.id, w.name, v.version, v.graph, v.author, v.saved_at AS savedAt
         FROM workflows w JOIN workflow_versions v ON v.workflow_id = w.id
         WHERE w.id = ? AND v.version = ?`,
      )
      .get(id, version) as (Omit<Workflow, "graph"> & { graph: string }) | undefined;
    if (!row) return undefined;
    return { ...row, graph: JSON.parse(row.graph) as WorkflowGraph };
  }

  listWorkflows(projectId: string): Workflow[] {
    this.getProject(projectId);
    this.ensureWorkflow(projectId);
    const rows = this.db
      .prepare(
        `SELECT w.id, w.name, v.version, v.graph, v.author, v.saved_at AS savedAt
         FROM workflows w JOIN workflow_versions v ON v.workflow_id = w.id
         WHERE w.project_id = ? AND v.version = (
           SELECT MAX(version) FROM workflow_versions WHERE workflow_id = w.id
         ) ORDER BY w.rowid`,
      )
      .all(projectId) as (Omit<Workflow, "graph"> & { graph: string })[];
    return rows.map((row) => ({
      ...row,
      graph: JSON.parse(row.graph) as WorkflowGraph,
    }));
  }

  protected ensureWorkflow(projectId: string) {
    const existing = this.db
      .prepare("SELECT 1 FROM workflows WHERE project_id = ?")
      .get(projectId);
    if (existing) return;
    const id = randomUUID();
    const now = new Date().toISOString();
    this.transaction(() => {
      this.db
        .prepare("INSERT INTO workflows VALUES (?, ?, ?, ?)")
        .run(id, projectId, "기본 개발 흐름", now);
      this.db
        .prepare("INSERT INTO workflow_versions VALUES (?, 1, ?, ?, ?)")
        .run(id, JSON.stringify(defaultGraph()), "기본", now);
    });
  }

  setSessionWorkflow(sessionId: string, workflowId: string | null) {
    const session = this.getSession(sessionId);
    if (
      workflowId &&
      !this.listWorkflows(session.projectId).some(({ id }) => id === workflowId)
    )
      throw new Error("이 프로젝트의 워크플로우를 선택해 주세요.");
    if (session.workflowId === workflowId) return;
    this.db
      .prepare("UPDATE sessions SET workflow_id = ? WHERE id = ?")
      .run(workflowId, sessionId);
    const workflow = workflowId
      ? this.listWorkflows(session.projectId).find(({ id }) => id === workflowId)
      : undefined;
    this.log(
      sessionId,
      "사용자 · 워크플로우 선택 · " +
        (workflow ? workflow.name + " v" + workflow.version : "프로젝트 기본"),
    );
  }

  applyWorkflow(jobId: string, scope: "current" | "once") {
    const job = this.getJob(jobId);
    if (["complete", "denied", "failed"].includes(job.state))
      throw new Error("끝난 업무에는 워크플로우를 적용할 수 없어요.");
    const session = this.getSession(job.sessionId);
    const workflows = this.listWorkflows(job.projectId);
    const latest =
      workflows.find(({ id }) => id === (job.workflowId ?? session.workflowId)) ??
      workflows[0];
    if (!latest) throw new Error("이 프로젝트에 워크플로우가 없어요.");
    const remaining = remainingStages(latest.graph, []);
    const titles = latest.graph.stages
      .filter(({ id, required }) => required && remaining.includes(id))
      .map(({ title }) => title);
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE jobs SET workflow_id = ?, workflow_version = ? WHERE id = ?",
        )
        .run(latest.id, latest.version, jobId);
      this.log(
        job.sessionId,
        "사용자 · 워크플로우 " +
          (scope === "current" ? "이번 업무에도" : "이번에만") +
          " 적용 · " +
          latest.name +
          " v" +
          latest.version +
          (titles.length ? " · 남은 필수 단계: " + titles.join(", ") : ""),
        jobId,
      );
      if (scope === "current")
        this.db
          .prepare("UPDATE sessions SET workflow_id = ? WHERE id = ?")
          .run(latest.id, job.sessionId);
    });
    return latest;
  }

  listModelConnections() {
    return this.db
      .prepare(
        `SELECT id, name, provider, base_url AS baseUrl, model, enabled, vision
         FROM model_connections ORDER BY rowid`,
      )
      .all()
      .map((row) => ({
        ...row,
        enabled: Boolean(row.enabled),
        vision: Boolean(row.vision),
      })) as ModelConnection[];
  }

  addModelConnection(connection: Omit<ModelConnection, "vision"> & { vision?: boolean }) {
    this.checkConnection(connection);
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO model_connections (id, name, provider, base_url, model, enabled, vision, created_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          connection.id,
          connection.name,
          connection.provider,
          connection.baseUrl,
          connection.model,
          Number(connection.enabled),
          Number(connection.vision ?? false),
          new Date().toISOString(),
        );
      this.logCurrent("사용자 · 모델 연결 추가 · " + connection.name);
      this.auditModelConnection("추가", connection);
    });
  }

  updateModelConnection(
    id: string,
    patch: Partial<Omit<ModelConnection, "id" | "provider">>,
  ) {
    const current = this.listModelConnections().find((item) => item.id === id);
    if (!current) throw new Error("모델 연결을 찾을 수 없어요.");
    const next = { ...current, ...patch };
    this.checkConnection(next);
    this.transaction(() => {
      this.db
        .prepare(
          "UPDATE model_connections SET name = ?, base_url = ?, model = ?, enabled = ?, vision = ? WHERE id = ?",
        )
        .run(
          next.name,
          next.baseUrl,
          next.model,
          Number(next.enabled),
          Number(next.vision),
          id,
        );
      this.logCurrent("사용자 · 모델 연결 수정 · " + next.name);
      this.auditModelConnection("수정", next);
    });
    return next;
  }

  removeModelConnection(id: string) {
    const row = this.db
      .prepare("DELETE FROM model_connections WHERE id = ? RETURNING name")
      .get(id);
    if (!row) throw new Error("모델 연결을 찾을 수 없어요.");
    this.logCurrent("사용자 · 모델 연결 제거 · " + row.name);
    this.auditModelConnection("제거", { name: String(row.name), baseUrl: null });
    return row.name as string;
  }

  protected checkConnection(
    connection: Pick<ModelConnection, "name" | "provider" | "baseUrl">,
  ) {
    if (!connection.name.trim())
      throw new Error("연결 이름을 적어 주세요.");
    if (connection.provider === "local") {
      if (!connection.baseUrl)
        throw new Error("로컬 모델 연결에는 OpenAI 호환 주소가 필요해요.");
      validateEndpointUrl(connection.baseUrl, "model");
    }
  }

  /** 모델 연결은 프로젝트와 별개라, 지금 열어 둔 프로젝트의 감사 기록에 남긴다. */
  private auditModelConnection(
    change: "추가" | "수정" | "제거",
    connection: { name: string; baseUrl: string | null },
  ) {
    const current = this.db
      .prepare("SELECT value FROM settings WHERE key = 'current_project'")
      .get()?.value;
    if (typeof current !== "string") return;
    if (!this.db.prepare("SELECT 1 FROM projects WHERE id = ?").get(current))
      return;
    this.recordAudit({
      projectId: current,
      event: "model.connection",
      outcome: "changed",
      actor: "사용자",
      subject: connection.name,
      detail: change + (connection.baseUrl ? " · " + connection.baseUrl : ""),
    });
  }

  logCurrent(note: string) {
    const session = this.db
      .prepare("SELECT value FROM settings WHERE key = 'current_project'")
      .get()?.value;
    if (typeof session !== "string") return;
    const last = this.db
      .prepare("SELECT last_session FROM projects WHERE id = ?")
      .get(session)?.last_session;
    if (typeof last === "string") this.log(last, note);
  }
}
