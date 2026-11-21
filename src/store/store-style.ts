// 스타일 감시자가 남기는 보고. 사용자 말풍선이 아니라 비서가 읽는 자리에 쌓이고,
// 비서에게 한 번 전달되면 다시 전달하지 않는다.

import { StoreAudit } from "./store-audit";

export type StyleReport = {
  id: number;
  sessionId: string | null;
  paths: string[];
  note: string;
  reportedAt: string;
};

export class StoreStyle extends StoreAudit {
  /** 파일이 바뀐 사실을 비서 앞으로 남긴다. 같은 파일은 한 줄로 모아 적는다. */
  recordStyleReport({
    projectId,
    sessionId,
    paths,
    note = "",
  }: {
    projectId: string;
    sessionId: string | null;
    paths: string[];
    note?: string;
  }) {
    this.getProject(projectId);
    const unique = [...new Set(paths)].slice(0, 40);
    if (!unique.length) return;
    this.transaction(() => {
      this.db
        .prepare(
          "INSERT INTO style_reports (project_id, session_id, paths, note, created_at) VALUES (?, ?, ?, ?, ?)",
        )
        .run(
          projectId,
          sessionId,
          JSON.stringify(unique),
          note,
          new Date().toISOString(),
        );
      if (sessionId)
        this.log(
          sessionId,
          "스타일 → 비서 · 파일 변경 감지 · " + unique.join(", "),
        );
    });
  }

  pendingStyleReports(projectId: string): StyleReport[] {
    return (
      this.db
        .prepare(
          `SELECT id, session_id AS sessionId, paths, note, created_at AS reportedAt
           FROM style_reports WHERE project_id = ? AND seen_at IS NULL ORDER BY id`,
        )
        .all(projectId) as (Omit<StyleReport, "paths"> & { paths: string })[]
    ).map(({ paths, ...row }) => ({ ...row, paths: JSON.parse(paths) as string[] }));
  }

  /** 비서에게 건넬 보고를 꺼내 간다. 꺼낸 보고는 다시 건네지 않는다. */
  takeStyleReports(projectId: string): StyleReport[] {
    const reports = this.pendingStyleReports(projectId);
    if (reports.length)
      this.db
        .prepare(
          "UPDATE style_reports SET seen_at = ? WHERE project_id = ? AND seen_at IS NULL",
        )
        .run(new Date().toISOString(), projectId);
    return reports;
  }
}
