// The workflow the app drives: follow-ups, the job queue and the lifecycle of a
// run. Each step lives one level up the chain, so `CrewWorkflow` carries the
// same public methods as it did when everything was in this file.
//
//   WorkflowBase          run state, the model turn loop, retries
//   WorkflowTools         the MCP tool gate
//   WorkflowChecks        stage selection and file checks
//   WorkflowVerification  change-set verification, peer consultation
//   WorkflowPlanning      planning a request
//   WorkflowDevelopment   developing a change set
//   WorkflowRecovery      recovering a half-written job
//   CrewWorkflow          follow-ups, the queue, start/stop/resume

import { resolve, sep } from "node:path";
import { planFiles, planTargets, type Job } from "./actions";
import { ModelLimitError } from "./model-errors";
import { StalePlan, ClarificationRequired } from "./workflow-support";
import { WorkflowRecovery } from "./workflow-recovery";

export class CrewWorkflow extends WorkflowRecovery {
  delegate(sessionId: string, responseId: string, text: string) {
    const existing = this.store
      .readJobs(sessionId)
      .find((job) => job.id === responseId);
    if (existing) return { id: existing.id, status: existing.state };
    const job = this.store.createJob(sessionId, responseId, text);
    this.store.log(sessionId, "비서 → 플랜 · 사용자 요청 인계", job.id);
    this.notify();
    this.start(job, "planning");
    return { id: job.id, status: "planning" };
  }

  routeFollowup(sessionId: string, requestId: string, text: string) {
    const reference =
      /^(?:(?:그거|그 작업|이 작업|이거|아까(?: 그)? 작업)(?:를|을|는|도)?\s+|that (?:task|job)\s+|(?:redo|rerun|fix|change) (?:that|it)(?:\s+|$))/i;
    if (
      !reference.test(text) ||
      !/다시|고쳐|바꿔|수정|추가|빼줘|이어|redo|rerun|fix|change/i.test(text)
    )
      return false;
    const jobs = this.store.readJobs(sessionId);
    const active = jobs.filter(
      ({ state }) =>
        !["complete", "denied", "failed", "stopped"].includes(state),
    );
    const candidates = active.length
      ? active
      : jobs.filter(({ state }) => state !== "denied").slice(-6);
    if (!candidates.length) return false;
    const needsDetail =
      /^(?:그거|그 작업|이 작업|이거|아까(?: 그)? 작업)(?:를|을|는|도)?\s*(?:다시|수정|고쳐|바꿔|이어서)(?:\s*(?:해\s*줘|해|줘|주세요))?[.!?…\s]*$|^(?:redo|rerun|fix|change) (?:that|it)(?: (?:task|job))?[.!?\s]*$/i.test(
        text,
      );
    this.store.stageFollowup(
      sessionId,
      requestId,
      text,
      candidates.map(({ id }) => id),
      needsDetail,
    );
    return true;
  }

  selectFollowup(sessionId: string, requestId: string, jobId: string | null) {
    if (this.store.selectFollowup(sessionId, requestId, jobId) && jobId)
      this.applyQueuedFollowup(jobId, true);
  }

  restoreFollowups() {
    for (const id of this.store.queuedFollowupJobs())
      this.applyQueuedFollowup(id);
  }

  protected applyQueuedFollowup(id: string, explicitlySelected = false) {
    if (this.active.has(id)) return;
    const job = this.store.getJob(id);
    const canReplacePaused =
      explicitlySelected &&
      ["stopped", "failed"].includes(job.state) &&
      !this.store.readRecoveryJournal(id).length;
    if (!["complete", "denied"].includes(job.state) && !canReplacePaused)
      return;
    if (this.store.applyQueuedFollowup(job) === "planning")
      this.start(this.store.getJob(id), "planning");
  }

  answer(id: string, requestId: string, allow: boolean, actor = "사용자") {
    const job = this.store.getJob(id);
    if (job.state !== "approval" || job.approvalId !== requestId || !job.plan)
      return;
    const decision = {
      id: requestId,
      actor,
      decision: allow ? "allow" : "deny",
    } as const;
    if (!allow) {
      this.store.recordJob(
        job,
        "denied",
        "사용자 · 파일 수정 거절",
        job.plan,
        null,
        "파일 수정 요청을 거절했어요. 작업 파일은 그대로예요.",
        decision,
      );
      this.applyQueuedFollowup(job.id);
      return;
    }
    if (this.active.has(job.id))
      throw new Error("업무를 정리 중이에요. 잠시 뒤 다시 눌러 주세요.");
    const paths = planTargets(job.plan);
    if (this.hasReservation(job, this.store.readQueuedJobs())) {
      this.store.recordJob(
        job,
        "queued",
        actor + " · 수정 승인 · " + paths + "의 앞 업무가 끝날 때까지 대기",
        job.plan,
        job.approvalId,
        undefined,
        decision,
      );
      return;
    }
    this.startDevelopment(
      job,
      actor + " → 개발 · " + paths + " 수정 승인",
      decision,
    );
  }

  protected startDevelopment(
    job: Job,
    note: string,
    decision?: { id: string; actor: string; decision: "allow" | "deny" },
  ) {
    this.store.recordJob(
      job,
      "developing",
      note,
      job.plan,
      job.approvalId,
      undefined,
      decision,
    );
    this.reserved.set(job.id, this.reservation(job));
    this.start(job, "developing");
  }

  protected reservation(job: Job) {
    const root = this.store.getProject(job.projectId).root;
    return [
      ...planFiles(job.plan!).map(({ path }) => path),
      ...(job.plan!.moves ?? []).map(({ from }) => from),
      ...(job.plan!.directories ?? []),
    ].map((path) => resolve(root, path).normalize("NFC").toLowerCase());
  }

  protected hasReservation(job: Job, earlier: Job[]) {
    const paths = this.reservation(job);
    return [
      ...this.reserved.values(),
      ...earlier.map((waiting) => this.reservation(waiting)),
    ].some((held) =>
      paths.some((path) =>
        held.some(
          (other) =>
            path === other ||
            path.startsWith(other + sep) ||
            other.startsWith(path + sep),
        ),
      ),
    );
  }

  protected dispatchQueuedJobs() {
    const waiting: Job[] = [];
    for (const next of this.store.readQueuedJobs()) {
      if (this.hasReservation(next, waiting)) waiting.push(next);
      else
        this.startDevelopment(
          next,
          "비서 → 개발 · 같은 파일의 앞 업무가 끝나 확인 시작",
        );
    }
  }

  stop(id: string) {
    const job = this.store.getJob(id);
    if (
      job.state === "approval" ||
      job.state === "queued" ||
      job.state === "clarification"
    ) {
      this.store.recordJob(
        job,
        "stopped",
        "비서 · " +
          (job.state === "queued"
            ? "파일 대기"
            : job.state === "clarification"
              ? "답변 대기"
              : "승인 대기") +
          " 업무 중단",
        job.plan,
        null,
        "업무를 멈췄어요.",
      );
      if (job.state === "queued") this.dispatchQueuedJobs();
      return;
    }
    const active = this.active.get(id);
    if (!active || active.signal.aborted) return;
    this.store.recordJob(job, "stopping", "비서 · 업무 중단 요청");
    active.abort();
  }

  resume(id: string) {
    const job = this.store.getJob(id);
    if (job.state !== "stopped" && job.state !== "failed") return;
    if (this.active.has(id)) return;
    if (job.plan && this.store.readRecoveryJournal(id).length) {
      if (this.hasReservation(job, this.store.readQueuedJobs()))
        throw new Error(
          "다른 업무가 작업 경로를 사용 중이에요. 완료된 뒤 다시 이어가 주세요.",
        );
      this.store.recordJob(
        job,
        "recovering",
        "비서 · 저장 기록과 실제 파일 확인",
      );
      this.reserved.set(job.id, this.reservation(job));
      this.start(job, "recovering");
    } else {
      this.store.recordJob(
        job,
        "planning",
        "비서 → 플랜 · 현재 파일 상태에서 이어가기",
        null,
      );
      this.start(job, "planning");
    }
  }

  revise(
    id: string,
    sessionId: string,
    requestId: string,
    text: string,
    questionId?: string,
  ) {
    const job = this.store.getJob(id);
    if (job.sessionId !== sessionId)
      throw new Error("이 세션의 업무를 선택해 주세요.");
    if (!this.store.isHired(job.projectId, "assistant"))
      throw new Error("크루에서 비서를 재고용해 주세요.");
    if (this.store.reviseJob(job, requestId, text, questionId))
      this.start(this.store.getJob(id), "planning");
  }

  close() {
    for (const controller of this.active.values()) controller.abort();
    this.active.clear();
  }

  protected start(job: Job, phase: "planning" | "developing" | "recovering") {
    const controller = new AbortController();
    this.active.set(job.id, controller);
    const base = this.store.getProject(job.projectId);
    const fresh = this.store.getJob(job.id);
    const project = fresh.worktree ? { ...base, root: fresh.worktree } : base;
    const work =
      phase === "planning"
        ? this.plan(job, project, controller.signal)
        : phase === "recovering"
          ? this.recover(job, project, controller.signal)
          : this.develop(job, project, controller.signal);
    let authorized: string | undefined;
    let replan = false;
    void work
      .then((approval) => {
        authorized = approval || undefined;
      })
      .catch((error: unknown) => {
        if (!this.active.has(job.id)) return;
        const current = this.store.getJob(job.id);
        const note = error instanceof Error ? error.message : String(error);
        if (controller.signal.reason instanceof ModelLimitError) {
          const saved = [
            ...new Set(
              this.store
                .readRecoveryJournal(job.id)
                .filter(({ savedAt }) => savedAt)
                .map(({ path }) => path),
            ),
          ];
          const remaining =
            current.state === "reviewing"
              ? "남은 검증"
              : current.state === "developing"
                ? "남은 파일 작업과 검증"
                : "계획 확인과 후속 작업";
          this.store.recordJob(
            current,
            "stopped",
            "비서 · 모델 사용 한도로 정지",
            current.plan,
            null,
            controller.signal.reason.message +
              (saved.length
                ? " 저장한 파일: " + saved.join(", ") + ". "
                : " 이 실행에서 아직 파일을 저장하지 않았어요. ") +
              remaining +
              "은 이어갈 때 진행합니다.",
          );
        } else if (controller.signal.aborted)
          this.store.recordJob(
            current,
            "stopped",
            "비서 · 업무 정지 확인",
            current.plan,
            null,
            "업무를 멈췄어요. 저장한 파일은 보존했어요.",
          );
        else if (error instanceof ClarificationRequired) {
          this.store.askJobQuestion(current, error.message);
        } else if (error instanceof StalePlan && job.state === "queued") {
          replan = true;
          this.store.recordJob(
            current,
            "planning",
            "비서 → 플랜 · 대기 중 바뀐 파일을 기준으로 다시 계획",
            null,
          );
        } else
          this.store.recordJob(
            current,
            "failed",
            note.slice(0, 400),
            current.plan,
            null,
            "업무를 마치지 못했어요. " + note.slice(0, 300),
          );
      })
      .finally(() => {
        if (this.active.get(job.id) !== controller) return;
        this.active.delete(job.id);
        if (phase !== "planning" && job.plan) {
          this.reserved.delete(job.id);
          this.dispatchQueuedJobs();
        }
        if (replan) this.start(this.store.getJob(job.id), "planning");
        if (authorized) {
          try {
            this.answer(job.id, authorized, true, "비서");
          } catch (error) {
            if (error instanceof Error)
              this.store.log(
                job.sessionId,
                "비서 · 자동 배정 보류 · " + error.message,
                job.id,
              );
          }
        }
        this.applyQueuedFollowup(job.id);
        this.notify();
      });
  }

  isRunning(id: string) {
    return this.active.has(id);
  }
}
