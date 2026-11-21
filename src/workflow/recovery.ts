// Recovering a job whose files or state were left half-written.

import { planFiles, type Job, type Project } from "../shared/actions";
import { inspectFile } from "./workspace-files";
import { ClarificationRequired } from "./support";
import { WorkflowDevelopment } from "./development";

export class WorkflowRecovery extends WorkflowDevelopment {
  protected async recover(job: Job, project: Project, signal: AbortSignal) {
    const plan = job.plan!;
    const journal = this.store.readRecoveryJournal(job.id);
    const changeIds = new Map<string, string>();
    const files: {
      path: string;
      hash: string | null;
      content: string | null;
      before: string | null;
    }[] = [];
    const uncertain: string[] = [];
    const incompleteMoves: string[] = [];
    for (const { path, baseline } of planFiles(plan)) {
      signal.throwIfAborted();
      const move = plan.moves?.find(({ to }) => to === path);
      const entries = journal.filter((entry) => entry.path === path);
      const latest = entries.at(-1);
      try {
        const current = await inspectFile(project.root, path);
        const source = move ? await inspectFile(project.root, move.from) : null;
        signal.throwIfAborted();
        const sourceRemoved = !source?.hash;
        let recovered =
          latest && current.hash === latest.afterHash && sourceRemoved
            ? latest
            : undefined;
        if (!recovered && latest && !latest.savedAt) {
          const prior = entries.at(-2);
          if (
            prior?.savedAt &&
            sourceRemoved &&
            current.hash === prior.afterHash
          )
            recovered = prior;
        }
        if (recovered) {
          if (!recovered.savedAt)
            this.store.confirmChange(job, recovered.id, recovered.afterHash);
          changeIds.set(path, recovered.id);
        } else if (
          !entries.some(({ savedAt }) => savedAt) &&
          current.hash === baseline &&
          (!move || source?.hash === move.baseline)
        ) {
          if (move) incompleteMoves.push(move.from + " → " + path);
        } else {
          uncertain.push(move ? move.from + " → " + path : path);
        }
        files.push({
          path,
          ...current,
          before: entries.length ? entries[0].beforeText : current.content,
        });
      } catch (error) {
        if (signal.aborted) throw error;
        uncertain.push(move ? move.from + " → " + path : path);
      }
    }
    if (uncertain.length)
      throw new ClarificationRequired(
        "저장 여부를 확인할 수 없는 경로가 있어요. " +
          uncertain.join(", ") +
          " 파일의 현재 상태를 확인해 주세요. 어느 변경을 유지하고 무엇을 이어갈까요?",
      );
    if (!changeIds.size) {
      const current = this.store.getJob(job.id);
      this.store.recordJob(
        current,
        "planning",
        "비서 → 계획 · 반영된 변경 없이 새 계획 작성",
        null,
      );
      this.notify();
      return this.plan(current, project, signal);
    }
    if (incompleteMoves.length)
      throw new ClarificationRequired(
        "저장된 변경은 보존했어요. 아직 이동되지 않은 경로는 " +
          incompleteMoves.join(", ") +
          "예요. 남은 이동을 이어갈까요?",
      );

    this.store.recordJob(
      job,
      "reviewing",
      "비서 · 저장한 파일을 다시 쓰지 않고 남은 검증 시작",
    );
    this.notify();
    const batchId = [...changeIds.values()].at(-1)!;
    const result = await this.verifyChangeSet(
      job,
      project,
      files,
      changeIds,
      batchId,
      signal,
    );
    if (result.failures.length)
      throw new ClarificationRequired(
        "저장한 파일은 보존했지만 남은 검증을 통과하지 못했어요. " +
          result.failures.join(" / ").slice(0, 650) +
          " 어떤 부분을 수정할까요?",
      );
    this.completeChangeSet(job, changeIds);
  }
}
