// Crew memories, the project wiki, and recorded model runs.

import { randomUUID } from "node:crypto";
import {
  type CrewMember,
  type CrewMemory,
  type ModelDetails,
  type WikiPage,
  type WikiRevision,
} from "./actions";
import { StoreRun } from "./store-run";
export class StoreMemory extends StoreRun {
  listMemories(projectId: string, ownerId?: string) {
    const fields = `id, owner_id AS ownerId, author_id AS authorId, author_name AS authorName,
      source_session_id AS sourceSessionId, source_job_id AS sourceJobId, body, created_at AS createdAt`;
    return (ownerId === undefined
      ? this.db.prepare(`SELECT ${fields} FROM crew_memories WHERE project_id = ? ORDER BY rowid DESC`).all(projectId)
      : this.db.prepare(`SELECT ${fields} FROM crew_memories WHERE project_id = ? AND (owner_id IS NULL OR owner_id = ?) ORDER BY rowid DESC LIMIT 16`).all(projectId, ownerId)
    ) as CrewMemory[];
  }

  saveMemory(
    sessionId: string,
    body: string,
    ownerId: string | null,
    author?: { id: string; name: string; jobId?: string },
  ) {
    const { projectId } = this.getSession(sessionId);
    if (ownerId && !this.readMembers(projectId).some(({ id }) => id === ownerId))
      throw new Error("이 프로젝트의 담당자를 선택해 주세요.");
    if (author?.jobId && this.getJob(author.jobId).sessionId !== sessionId)
      throw new Error("이 세션의 업무를 선택해 주세요.");
    const text = body.trim();
    if (!text || text.length > 4000)
      throw new Error("기억은 1자 이상 4,000자 이하로 적어 주세요.");
    this.transaction(() => {
      const duplicate = this.db.prepare(`
        SELECT 1 FROM crew_memories WHERE project_id = ? AND owner_id IS ? AND body = ?
      `).get(projectId, ownerId, text);
      if (duplicate) return;
      this.db.prepare(`
        INSERT INTO crew_memories VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        randomUUID(), projectId, ownerId, author?.id ?? null,
        author?.name ?? "사용자", sessionId, author?.jobId ?? null,
        text, new Date().toISOString(),
      );
      this.log(sessionId, (author?.name ?? "사용자") + " · 기억 기록", author?.jobId);
    });
  }

  removeMemory(projectId: string, id: string) {
    this.db.prepare("DELETE FROM crew_memories WHERE project_id = ? AND id = ?").run(projectId, id);
  }

  listWiki(projectId: string) {
    const pages = this.db.prepare(`
      SELECT id, title, body, version, links FROM wiki_pages
      WHERE project_id = ? AND deleted = 0 ORDER BY title, id
    `).all(projectId) as (Omit<WikiPage, "links" | "revisions"> & { links: string })[];
    const ids = new Set(pages.map(({ id }) => id));
    const readRevisions = this.db.prepare(`
      SELECT version, title, body, author_name AS authorName, created_at AS createdAt,
             source_session_id AS sourceSessionId, source_job_id AS sourceJobId
      FROM wiki_revisions WHERE page_id = ? ORDER BY version DESC
    `);
    return pages.map(({ links, ...page }): WikiPage => ({
      ...page,
      links: (JSON.parse(links) as string[]).filter((id) => ids.has(id)),
      revisions: readRevisions.all(page.id) as WikiRevision[],
    }));
  }

  wikiOutline(projectId: string) {
    return this.db.prepare(`
      SELECT id, title, version, substr(body, 1, 220) AS excerpt FROM wiki_pages
      WHERE project_id = ? AND deleted = 0 ORDER BY rowid DESC LIMIT 60
    `).all(projectId) as { id: string; title: string; version: number; excerpt: string }[];
  }

  readWiki(projectId: string, id: string) {
    const page = this.db.prepare(`
      SELECT id, title, body, version, links FROM wiki_pages WHERE project_id = ? AND id = ? AND deleted = 0
    `).get(projectId, id) as (Omit<WikiPage, "links" | "revisions"> & { links: string }) | undefined;
    if (!page) return undefined;
    const active = this.db.prepare("SELECT 1 FROM wiki_pages WHERE project_id = ? AND id = ? AND deleted = 0");
    return {
      ...page,
      links: (JSON.parse(page.links) as string[]).filter((target) => active.get(projectId, target)),
    };
  }

  saveWiki(
    sessionId: string,
    page: Pick<WikiPage, "id" | "version" | "title" | "body" | "links">,
    author?: { name: string; jobId?: string },
  ) {
    const { projectId } = this.getSession(sessionId);
    if (author?.jobId && this.getJob(author.jobId).sessionId !== sessionId)
      throw new Error("이 세션의 업무를 선택해 주세요.");
    this.transaction(() => {
      const current = this.db.prepare(`
        SELECT version, deleted FROM wiki_pages WHERE id = ? AND project_id = ?
      `).get(page.id, projectId);
      if (current?.deleted || page.version !== (current?.version ?? 0))
        throw new Error("위키 문서가 바뀌었어요. 최신 내용을 확인해 주세요.");
      const hasPage = this.db.prepare(`
        SELECT 1 FROM wiki_pages WHERE id = ? AND project_id = ? AND deleted = 0
      `);
      const links = [...new Set(page.links)];
      if (links.some((id) => id === page.id || !hasPage.get(id, projectId)))
        throw new Error("현재 프로젝트의 다른 위키 문서만 연결할 수 있어요.");
      const version = page.version + 1;
      if (current) {
        this.db.prepare(`
          UPDATE wiki_pages SET title = ?, body = ?, version = ?, links = ? WHERE id = ? AND project_id = ?
        `).run(page.title, page.body, version, JSON.stringify(links), page.id, projectId);
      } else {
        this.db.prepare(`
          INSERT INTO wiki_pages (id, project_id, title, body, version, links) VALUES (?, ?, ?, ?, ?, ?)
        `).run(page.id, projectId, page.title, page.body, version, JSON.stringify(links));
      }
      this.db.prepare("INSERT INTO wiki_revisions VALUES (?, ?, ?, ?, ?, ?, ?, ?)").run(
        page.id, version, page.title, page.body, author?.name ?? "사용자",
        new Date().toISOString(), sessionId, author?.jobId ?? null,
      );
      this.log(sessionId, (author?.name ?? "사용자") + " · 위키 " + (current ? "수정" : "생성") + " · " + page.title, author?.jobId);
    });
  }

  removeWiki(projectId: string, id: string, version: number) {
    const removed = this.db.prepare(`
      UPDATE wiki_pages SET deleted = 1 WHERE project_id = ? AND id = ? AND version = ? AND deleted = 0
    `).run(projectId, id, version);
    if (!removed.changes)
      throw new Error("위키 문서가 바뀌었어요. 최신 내용을 확인해 주세요.");
  }

  recordModelRun(
    sessionId: string,
    jobId: string | null,
    member: Pick<CrewMember, "roleId" | "provider">,
    elapsed: number,
    details: ModelDetails,
  ) {
    this.db
      .prepare(`
        INSERT INTO model_runs (session_id, job_id, role_id, provider, model, elapsed_ms, input_tokens, output_tokens, cost_usd)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `)
      .run(
        sessionId,
        jobId,
        member.roleId,
        member.provider,
        details.model ?? null,
        Math.round(elapsed),
        details.inputTokens ?? null,
        details.outputTokens ?? null,
        details.costUsd ?? null,
      );
  }
}
