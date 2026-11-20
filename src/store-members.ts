// Hiring, member settings, workspace write permissions, and job assignment.

import { randomUUID } from "node:crypto";
import {
  planFiles,
  roles,
  type CrewMember,
  type Job,
  type Provider,
  type RoleId,
} from "./actions";
import { StoreCrew } from "./store-crew";
export class StoreMembers extends StoreCrew {
  setWorkspaceWrite(projectId: string, memberId: string, allow: boolean) {
    const member = this.readMembers(projectId, "development").find(
      ({ id }) => memberId === id,
    );
    if (!member)
      throw new Error("개발 역할의 파일 쓰기 권한만 변경할 수 있어요.");
    if (member.writeAllowed === allow) return;
    this.transaction(() => {
      this.db
        .prepare(
          `INSERT INTO crew_workspace_write VALUES (?, ?, ?)
        ON CONFLICT(project_id, member_id) DO UPDATE SET allowed = excluded.allowed`,
        )
        .run(projectId, memberId, Number(allow));
      const session = this.db
        .prepare("SELECT last_session FROM projects WHERE id = ?")
        .get(projectId)?.last_session;
      if (typeof session === "string")
        this.log(
          session,
          "사용자 · " +
            member.name +
            " · 파일 쓰기 권한 " +
            (allow ? "부여" : "회수"),
        );
    });
  }

  requireWorkspaceWrite(job: Job, path: string) {
    const current = this.getJob(job.id);
    if (
      current.state !== "developing" ||
      !current.plan ||
      !planFiles(current.plan).some((file) => file.path === path)
    )
      throw new Error("현재 승인 범위에서 파일을 쓸 수 없어요. " + path);
    const writer = this.getAssignee(job.id, "development");
    if (
      typeof writer !== "string" ||
      !this.isWorkspaceWriteAllowed(job.projectId, writer)
    )
      throw new Error("개발 담당의 파일 쓰기 권한이 없어요. " + path);
  }

  recruitMember(
    job: Job,
    role: RoleId,
    provider: Provider,
    label: string,
    specialty?: string,
    permanent = false,
  ) {
    return this.transaction(() => {
      const id = randomUUID();
      const name = label + (permanent ? " 담당" : " 알바");
      this.log(job.sessionId, "인사팀 · " + label + " 후보 준비", job.id);
      this.db
        .prepare(
          `
        INSERT INTO crew_members (id, project_id, role, name, provider, assignment_job_id, specialty)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
        )
        .run(
          id,
          job.projectId,
          role,
          name,
          provider,
          permanent ? null : job.id,
          specialty ?? null,
        );
      this.log(job.sessionId, "비서 · " + name + " 채택·고용", job.id);
      return {
        id,
        name,
        roleId: role,
        provider,
        hired: true,
        ...(permanent ? {} : { assignmentJobId: job.id }),
        ...(specialty ? { specialty } : {}),
      } satisfies CrewMember;
    });
  }

  protected releaseTemporaryMembers(job: Job) {
    const members = this.db
      .prepare(
        "UPDATE crew_members SET hired = 0 WHERE assignment_job_id = ? AND hired = 1 RETURNING name",
      )
      .all(job.id);
    for (const { name } of members)
      this.log(job.sessionId, "비서 · " + name + " 업무 종료 · 미고용", job.id);
  }

  addMember(projectId: string, member: Omit<CrewMember, "hired">) {
    this.getProject(projectId);
    this.transaction(() => {
      const existing = this.db
        .prepare("SELECT project_id, role FROM crew_members WHERE id = ?")
        .get(member.id);
      if (existing) {
        if (
          existing.project_id !== projectId ||
          existing.role !== member.roleId
        )
          throw new Error("이미 다른 팀원에게 사용된 ID예요.");
        return;
      }
      this.db
        .prepare(
          "INSERT INTO crew_members (id, project_id, role, name, provider) VALUES (?, ?, ?, ?, ?)",
        )
        .run(member.id, projectId, member.roleId, member.name, member.provider);
      this.logMemberEmployment(projectId, member.name, true);
    });
  }

  updateMember(
    projectId: string,
    memberId: string,
    patch: Partial<Pick<CrewMember, "name" | "provider" | "hired">>,
  ) {
    this.getProject(projectId);
    const member = this.readMembers(projectId).find(
      ({ id }) => id === memberId,
    );
    if (!member) throw new Error("이 프로젝트에서 해당 팀원을 찾을 수 없어요.");
    const {
      name = member.name,
      provider = member.provider,
      hired = member.hired,
    } = patch;
    if (hired && !member.hired && member.assignmentJobId)
      throw new Error("종료한 알바는 새 업무에 다시 배정할 수 없어요.");
    this.transaction(() => {
      if (member.id === member.roleId)
        this.db
          .prepare(
            `INSERT INTO crew (project_id, role, name, provider, hired) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, role) DO UPDATE SET name = excluded.name, provider = excluded.provider, hired = excluded.hired`,
          )
          .run(projectId, member.roleId, name, provider, Number(hired));
      else
        this.db
          .prepare(
            "UPDATE crew_members SET name = ?, provider = ?, hired = ? WHERE id = ? AND project_id = ?",
          )
          .run(name, provider, Number(hired), memberId, projectId);
      if (hired !== member.hired) {
        this.logMemberEmployment(projectId, name, hired);
        if (!hired) {
          const affected = this.db
            .prepare(
              `
            SELECT j.id, j.session_id FROM job_assignees a JOIN jobs j ON j.id = a.job_id
            WHERE a.member_id = ? AND j.project_id = ? AND j.state NOT IN ('complete','denied','failed','stopped')
            GROUP BY j.id
          `,
            )
            .all(memberId, projectId);
          for (const { id, session_id } of affected)
            this.log(
              String(session_id),
              "비서 · " +
                name +
                " 새 배정 종료 · 진행 단계 정리 후 다음 담당자에게 인계",
              String(id),
            );
        }
      }
    });
  }

  /**
   * 인사 역할의 뽑기. 처음 받은 로스터의 역할을 다시 고용하고, 별명과 모델을 함께 정한다.
   * 이미 고용 중이면 별명·모델만 바뀐다.
   */
  hireMember(
    projectId: string,
    roleId: RoleId,
    patch: { name?: string; provider?: Provider } = {},
  ) {
    const before = this.readMembers(projectId, roleId).find(
      ({ id }) => id === roleId,
    );
    if (!before) throw new Error("이 프로젝트에서 해당 역할을 찾을 수 없어요.");
    this.updateMember(projectId, roleId, { ...patch, hired: true });
    const after = this.readMembers(projectId, roleId).find(
      ({ id }) => id === roleId,
    )!;
    if (
      !before.hired ||
      after.name !== before.name ||
      after.provider !== before.provider
    )
      this.recordAudit({
        projectId,
        event: "crew.roster",
        outcome: "changed",
        actor: "인사",
        subject: after.name,
        detail: (before.hired ? "역할 설정 변경 · " : "채용 · ") + roleId,
      });
  }

  /** 인사 역할의 해고. 진행 중인 배정은 기존 절차대로 정리하고 기록은 남긴다. */
  fireMember(projectId: string, memberId: string) {
    const before = this.readMembers(projectId).find(({ id }) => id === memberId);
    if (!before) throw new Error("이 프로젝트에서 해당 크루를 찾을 수 없어요.");
    this.updateMember(projectId, memberId, { hired: false });
    if (before.hired)
      this.recordAudit({
        projectId,
        event: "crew.roster",
        outcome: "changed",
        actor: "인사",
        subject: before.name,
        detail: "해고 · " + before.roleId,
      });
  }

  protected logMemberEmployment(projectId: string, name: string, hired: boolean) {
    const session = this.db
      .prepare("SELECT last_session FROM projects WHERE id = ?")
      .get(projectId)?.last_session;
    if (typeof session === "string")
      this.log(
        session,
        "사용자 · " + name + " · " + (hired ? "고용" : "미고용"),
      );
  }

  getAssignee(jobId: string, role: RoleId, specialty?: string) {
    return this.db
      .prepare(
        "SELECT member_id FROM job_assignees WHERE job_id = ? AND role = ?",
      )
      .get(jobId, specialty ? role + ":" + specialty : role)?.member_id;
  }

  assignMember(job: Job, member: CrewMember) {
    this.transaction(() => {
      const previous = this.getAssignee(
        job.id,
        member.roleId,
        member.specialty,
      );
      if (typeof previous === "string" && previous !== member.id) {
        const prior = this.readMembers(job.projectId, member.roleId).find(
          ({ id }) => id === previous,
        );
        this.log(
          job.sessionId,
          "비서 · " +
            (prior?.name ?? previous) +
            " → " +
            member.name +
            " 담당 인계",
          job.id,
        );
      }
      this.db
        .prepare(
          `INSERT INTO job_assignees VALUES (?, ?, ?)
        ON CONFLICT(job_id, role) DO UPDATE SET member_id = excluded.member_id`,
        )
        .run(
          job.id,
          member.specialty
            ? member.roleId + ":" + member.specialty
            : member.roleId,
          member.id,
        );
      const title = roles.find(({ id }) => id === member.roleId)?.title;
      this.log(
        job.sessionId,
        "비서 → " + title + " · " + member.name + " 배정",
        job.id,
      );
    });
  }
}
