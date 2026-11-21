// Prepared changes, verification checkpoints, recorded checks, and the artifacts they leave.

import { randomUUID } from "node:crypto";
import { basename } from "node:path";
import {
  type Job,
  type ReviewFinding,
  type WorkChange,
  type WorkCheck,
} from "../shared/actions";
import { StoreJobs } from "./jobs";
export class StoreChanges extends StoreJobs {
  prepareChange(
    job: Job,
    path: string,
    before: { hash: string | null; content: string | null },
    after: { hash: string; content: string },
    movedFrom?: string,
  ) {
    const id = randomUUID();
    this.db
      .prepare(
        `INSERT INTO work_changes (id, job_id, plan_id, path, before_hash, after_hash, before_text, after_text, moved_from, author_member_id)
         VALUES (?, ?, (SELECT id FROM work_plans WHERE id = ?), ?, ?, ?, ?, ?, ?, ?)`,
      )
      .run(
        id,
        job.id,
        job.approvalId,
        path,
        before.hash,
        after.hash,
        before.content,
        after.content,
        movedFrom ?? null,
        this.getAssignee(job.id, "development") ?? null,
      );
    return id;
  }

  readRecoveryJournal(jobId: string) {
    return this.db
      .prepare(
        `
      SELECT c.id, c.path, c.after_hash AS afterHash, c.before_text AS beforeText, c.saved_at AS savedAt
      FROM work_changes c JOIN jobs j ON j.id = c.job_id AND c.plan_id = j.execution_plan_id
      WHERE j.id = ? ORDER BY c.rowid
    `,
      )
      .all(jobId) as {
      id: string;
      path: string;
      afterHash: string;
      beforeText: string | null;
      savedAt: string | null;
    }[];
  }

  readVerificationCheckpoint(
    jobId: string,
    version: string,
    role: string,
    path = "",
  ) {
    const row = this.db
      .prepare(
        `
      SELECT result FROM verification_checkpoints WHERE job_id = ? AND version = ? AND role = ? AND path = ?
    `,
      )
      .get(jobId, version, role, path);
    return row ? (JSON.parse(String(row.result)) as unknown) : undefined;
  }

  saveVerificationCheckpoint(
    jobId: string,
    version: string,
    role: string,
    result: object,
    path = "",
  ) {
    this.db
      .prepare(
        `
      INSERT INTO verification_checkpoints VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(job_id, version, role, path) DO NOTHING
    `,
      )
      .run(jobId, version, role, path, JSON.stringify(result));
  }

  confirmChange(job: Job, changeId: string, hash: string) {
    this.transaction(() => {
      const saved = this.db
        .prepare(
          `UPDATE work_changes SET saved_at = ?
          WHERE id = ? AND job_id = ? AND after_hash = ? AND saved_at IS NULL RETURNING path, moved_from`,
        )
        .get(new Date().toISOString(), changeId, job.id, hash);
      if (saved) {
        this.log(
          job.sessionId,
          "개발 → 비서 · " +
            (saved.moved_from ? saved.moved_from + " → " : "") +
            saved.path +
            " 저장 · " +
            hash,
          job.id,
        );
        this.recordArtifact(job, changeId, hash);
      }
    });
  }

  protected recordArtifact(job: Job, changeId: string, hash: string) {
    const change = this.db
      .prepare(
        "SELECT path, moved_from AS movedFrom, author_member_id AS authorId FROM work_changes WHERE id = ?",
      )
      .get(changeId) as
      | { path: string; movedFrom: string | null; authorId: string | null }
      | undefined;
    if (!change) return;
    this.db
      .prepare(
        `INSERT INTO artifacts VALUES (?, ?, ?, ?, ?, ?, 'file', ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET hash = excluded.hash`,
      )
      .run(
        changeId,
        job.projectId,
        job.id,
        change.authorId,
        changeId,
        basename(change.path),
        change.path,
        hash,
        new Date().toISOString(),
      );
  }

  recordCheck(
    job: Job,
    changeId: string,
    batchId: string,
    role: string,
    label: string,
    result: {
      passed: boolean;
      note: string;
      unavailable?: boolean;
      command?: string;
      findings?: Omit<ReviewFinding, "excerpt">[];
    },
  ) {
    this.transaction(() => {
      const change = this.db
        .prepare(
          "SELECT after_hash, after_text FROM work_changes WHERE id = ? AND job_id = ? AND saved_at IS NOT NULL",
        )
        .get(changeId, job.id);
      if (!change) return;
      const lines = String(change.after_text).split(/\r\n|\r|\n/);
      if (lines.at(-1) === "") lines.pop();
      const findings = (result.findings ?? []).filter(
        ({ startLine, endLine }) =>
          Number.isInteger(startLine) &&
          Number.isInteger(endLine) &&
          startLine >= 1 &&
          endLine >= startLine &&
          endLine <= lines.length &&
          endLine - startLine < 12,
      );
      const saved = this.db
        .prepare(
          `INSERT OR IGNORE INTO work_checks
          SELECT id, ?, ?, ?, ?, ?, ?, ?, ?, ? FROM work_changes
          WHERE id = ? AND job_id = ? AND saved_at IS NOT NULL RETURNING change_id`,
        )
        .get(
          role,
          Number(result.passed),
          Number(!!result.unavailable),
          result.note,
          result.command ?? null,
          new Date().toISOString(),
          batchId,
          JSON.stringify(findings),
          label,
          changeId,
          job.id,
        );
      if (saved) {
        this.log(
          job.sessionId,
          label + " · " + result.note + " · " + change.after_hash,
          job.id,
        );
      }
    });
  }

  readChanges(sessionId: string) {
    const changes = this.db
      .prepare(
        `SELECT c.id, c.job_id AS jobId, c.plan_id AS planId,
      c.path, c.moved_from AS movedFrom, c.author_member_id AS authorMemberId,
      c.before_hash AS beforeHash, c.after_hash AS afterHash, c.saved_at AS savedAt, c.after_text AS afterText
      FROM work_changes c JOIN jobs j ON j.id = c.job_id
      WHERE j.session_id = ? AND c.saved_at IS NOT NULL ORDER BY c.rowid DESC`,
      )
      .all(sessionId) as (Omit<WorkChange, "checks" | "previousChecks"> & {
      afterText: string;
    })[];
    const checks = this.db
      .prepare(`SELECT role, label, passed, unavailable, note, command, checked_at AS checkedAt, batch_id AS batchId, findings
      FROM work_checks WHERE change_id = ? ORDER BY rowid`);
    type CheckRow = Omit<
      WorkChange["checks"][number],
      "passed" | "unavailable" | "findings"
    > & {
      passed: number;
      unavailable: number;
      findings: string;
    };
    return changes.map(({ afterText, ...change }): WorkChange => {
      const batches = new Map<string, WorkCheck[]>();
      const lines = afterText.split(/\r\n|\r|\n/);
      for (const row of checks.all(change.id) as CheckRow[]) {
        const batch = batches.get(row.batchId) ?? [];
        batch.push({
          ...row,
          passed: Boolean(row.passed),
          unavailable: Boolean(row.unavailable),
          findings: (
            JSON.parse(row.findings) as Omit<ReviewFinding, "excerpt">[]
          ).map((finding) => ({
            ...finding,
            excerpt: lines
              .slice(finding.startLine - 1, finding.endLine)
              .join("\n")
              .slice(0, 1600),
          })),
        });
        batches.set(row.batchId, batch);
      }
      const [latest = [], ...previousChecks] = [...batches.values()].reverse();
      return { ...change, checks: latest, previousChecks };
    });
  }
}
