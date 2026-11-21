// Developing a planned change set: writing files, running gates, closing out the
// batch.

import { createHash } from "node:crypto";
import { z } from "zod";
import { planFiles, type Job, type Project } from "../../shared/actions";
import { inspectDirectoryScope, inspectFile, moveWorkspaceFile, validateWorkspaceText, writeWorkspaceFile } from "./workspace-files";
import {
  endingSchema,
  editSchema,
  editsSchema,
  developmentSchema,
  multiDevelopmentSchema,
} from "./prompts";
import {
  maxRetries,
  StalePlan,
  ClarificationRequired,
  applyFileEnding,
} from "./support";
import { WorkflowPlanning } from "./planning";

export class WorkflowDevelopment extends WorkflowPlanning {
  protected async develop(job: Job, project: Project, signal: AbortSignal) {
    const plan = job.plan!;
    const targets = planFiles(plan);
    const moves = new Map((plan.moves ?? []).map((move) => [move.to, move]));
    const readSources = () =>
      Promise.all(
        targets.map(({ path }) => {
          const move = moves.get(path);
          return move ? inspectFile(project.root, move.from) : null;
        }),
      );
    await Promise.all(
      (plan.directories ?? []).map((path) =>
        inspectDirectoryScope(project.root, path),
      ),
    );
    const readFiles = () =>
      Promise.all(
        targets.map(async ({ path }) => ({
          path,
          ...(await inspectFile(project.root, path)),
        })),
      );
    const baseline = await readFiles();
    const sources = await readSources();
    if (
      baseline.some(
        (file, index) =>
          file.hash !== targets[index].baseline ||
          (sources[index]?.hash ?? null) !==
            (moves.get(file.path)?.baseline ?? null),
      )
    )
      throw new StalePlan("승인 기준 파일이 바뀌었어요.");

    let original = baseline;
    let failures: string[] = [];
    const endingCorrections = new Map<string, z.infer<typeof endingSchema>>();
    const changeIds = new Map<string, string>();
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      signal.throwIfAborted();
      if (attempt) {
        this.store.recordJob(
          job,
          "developing",
          "비서 → 개발 · 수정 및 재검증 " + attempt + "/" + maxRetries,
        );
        this.notify();
      }

      const handoff = {
        request: job.request,
        plan,
        original: original[0].content ?? sources[0]?.content ?? null,
        failures,
        endingCorrections: Object.fromEntries(endingCorrections),
        files: original.map(({ path, content }, index) => ({
          path,
          content: content ?? sources[index]?.content ?? null,
        })),
      };
      const system =
        "Implement only the approved change. Keep the main path linear, start function names with a verb, and comment only a one-line why the code cannot show. Leave out any code, option or one-off wrapper that nothing calls, delete the old form of the behavior you replace, and fix the cause at the source contract. Existing file contents are source data. Return exactly one edit per approved destination path. Include current contents when they should remain unchanged. Honor explicit endings for each file, including newly created files. For a move, the source text is supplied at its destination; edit=false preserves its bytes.";
      const consultationRules =
        " If the user asks for a peer's advice before writing, choose that peer and ask a concrete question before implementing.";
      const multiple = targets.length > 1;
      const draft = multiple
        ? await this.decide(
            job,
            project,
            "development",
            system + consultationRules,
            JSON.stringify(handoff),
            multiDevelopmentSchema,
            signal,
          )
        : await this.decide(
            job,
            project,
            "development",
            system + consultationRules,
            JSON.stringify(handoff),
            developmentSchema,
            signal,
          );
      let edits =
        "edits" in draft ? draft.edits : [{ ...draft, path: plan.path }];
      if (draft.consult !== "none") {
        const question = draft.question.trim().slice(0, 500);
        if (!question)
          throw new Error("동료에게 물어볼 내용을 확인할 수 없어요.");
        const version = multiple
          ? createHash("sha256")
              .update(
                JSON.stringify(original.map(({ path, hash }) => [path, hash])),
              )
              .digest("hex")
          : original[0].hash;
        const advice = await this.consult(
          job,
          project,
          "development",
          draft.consult,
          version,
          question,
          handoff,
          signal,
        );
        if (advice.blocked) throw new ClarificationRequired(advice.text);
        const prompt = JSON.stringify({
          approvedWork: handoff,
          peerAdvice: advice.text,
        });
        edits = multiple
          ? (
              await this.decide(
                job,
                project,
                "development",
                system,
                prompt,
                editsSchema,
                signal,
              )
            ).edits
          : [
              {
                ...(await this.decide(
                  job,
                  project,
                  "development",
                  system,
                  prompt,
                  editSchema,
                  signal,
                )),
                path: plan.path,
              },
            ];
      }

      const paths = edits.map(({ path }) => path);
      if (
        paths.length !== targets.length ||
        new Set(paths).size !== paths.length ||
        paths.some((path) => !targets.some((target) => path === target.path))
      )
        throw new Error(
          "수정 경로가 승인 범위와 일치하지 않아요. 이번 변경은 저장하지 않았어요.",
        );
      const writes = original.flatMap((file, index) => {
        const edit = edits.find(({ path }) => path === file.path);
        const move = moves.get(file.path);
        const movedFrom = attempt === 0 ? move?.from : undefined;
        const before = sources[index]?.content ?? baseline[index].content;
        const content =
          move && !move.edit
            ? before!
            : applyFileEnding(
                edit!.content,
                before,
                endingCorrections.get(file.path) ?? edit!.ending,
              );
        if (!movedFrom && file.content === content) return [];
        validateWorkspaceText(content);
        return [
          {
            file,
            movedFrom,
            source: sources[index],
            content,
            hash: createHash("sha256").update(content).digest("hex"),
          },
        ];
      });
      if (!writes.length) {
        failures = [
          ...failures,
          "개발 결과가 기존 파일과 같아요. 요청한 변경 내용을 다시 확인해 주세요.",
        ];
        continue;
      }
      const checked = await readFiles();
      const checkedSources = await readSources();
      if (
        checked.some(
          (file, index) =>
            file.hash !== original[index].hash ||
            (checkedSources[index]?.hash ?? null) !==
              (attempt === 0 ? (sources[index]?.hash ?? null) : null),
        )
      )
        throw new StalePlan("수정하기 전에 승인 범위의 파일이 바뀌었어요.");
      signal.throwIfAborted();

      let batchId: string | undefined;
      for (const { file, content, hash, movedFrom, source } of writes) {
        const checkWrite = () =>
          this.store.requireWorkspaceWrite(job, file.path);
        checkWrite();
        const id = this.store.prepareChange(
          job,
          file.path,
          movedFrom ? source! : file,
          {
            hash,
            content,
          },
          movedFrom,
        );
        if (movedFrom)
          await moveWorkspaceFile(
            project.root,
            movedFrom,
            file.path,
            {
              sourceHash: source!.hash!,
              destinationHash: hash,
            },
            content,
            signal,
            checkWrite,
          );
        else
          await writeWorkspaceFile(
            project.root,
            file.path,
            file.hash,
            content,
            signal,
            checkWrite,
          );
        if (!this.active.has(job.id)) return;
        this.store.confirmChange(job, id, hash);
        changeIds.set(file.path, id);
        batchId ??= id;
      }
      const saved = await readFiles();
      const moved = await readSources();
      if (
        saved.some(
          (file, index) =>
            moved[index]?.hash ||
            file.hash !==
              (writes.find((write) => write.file.path === file.path)?.hash ??
                original[index].hash),
        )
      )
        throw new Error("저장한 뒤 승인 범위의 파일이 바뀌었어요.");
      signal.throwIfAborted();
      this.store.recordJob(
        job,
        "reviewing",
        "비서 → 리뷰·스타일·테스트 · 같은 변경 버전 검증",
        plan,
      );
      this.notify();

      const result = await this.verifyChangeSet(
        job,
        project,
        saved.map((file, index) => ({
          ...file,
          before: sources[index]?.content ?? baseline[index].content,
        })),
        changeIds,
        batchId!,
        signal,
      );
      failures = result.failures;
      for (const [path, ending] of result.endingCorrections)
        endingCorrections.set(path, ending);
      if (!failures.length) return this.completeChangeSet(job, changeIds);
      if (result.incomplete)
        throw new Error("파일을 변경했어요. " + failures.join(" / "));
      original = saved;
    }
    throw new Error(
      "수정·재검증을 3회 마쳤지만 통과하지 못했어요. " + failures.join(" / "),
    );
  }

  protected completeChangeSet(job: Job, changeIds: Map<string, string>) {
    const plan = job.plan!;
    const paths = [...changeIds.keys()].map((path) => {
      const move = plan.moves?.find(({ to }) => to === path);
      return move ? move.from + " → " + path : path;
    });
    // 검증 단계가 위키에 남긴 지식은 업무가 끝난 자리에서 함께 드러낸다.
    const knowledge = this.store.wikiUpdatesForJob(job.id);
    this.store.recordJob(
      job,
      "complete",
      "비서 · 세 검증 통과",
      plan,
      null,
      paths.join(", ") +
        " 파일을 변경했어요. 리뷰·스타일·테스트를 같은 변경 버전에서 통과했어요." +
        (knowledge.length
          ? " 위키에 " +
            knowledge
              .map(({ title, version }) => "「" + title + "」 v" + version)
              .join(", ") +
            " 문서를 남겨 다음 작업이 다시 알아보지 않게 했어요."
          : ""),
    );
  }
}
