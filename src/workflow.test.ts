import { randomUUID } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodexConnection } from "./codex";
import { decideLocal } from "./local";
import { CrewStore } from "./store";
import { CrewWorkflow } from "./workflow";

vi.mock("./local", () => ({ decideLocal: vi.fn() }));
afterEach(() => vi.resetAllMocks());

test("peer consultation and a follow-up share a job with separate approvals", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-peer-")));
  const file = join(folder, "notice.txt");
  const database = join(folder, ".crew.sqlite");
  writeFileSync(file, "Before\n");
  let store = new CrewStore(database);
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  try {
    let followUp = false;
    let replan = false;
    let styleTurns = 0;
    let reviewTurns = 0;
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      if (system.startsWith("Plan text-file")) {
        if (followUp) expect(prompt).toContain('"previousPath":"notice.txt"');
        if (replan && !followUp)
          expect(prompt).toContain("검증할 문구를 명시해 주세요.");
        return {
          paths: ["notice.txt"],
          goal: "문구 변경",
          criterion: followUp ? "Final과 줄바꿈" : "After와 줄바꿈",
        };
      }
      if (system.startsWith("Review the proposed") && !replan) {
        replan = true;
        return { passed: false, note: "검증할 문구를 명시해 주세요." };
      }
      if (system.startsWith("Reply directly")) {
        expect(readFileSync(file, "utf8")).toBe("Before\n");
        if (prompt.includes('"requester":"style"')) {
          if (++reviewTurns === 1)
            return {
              kind: "consult",
              peer: "development",
              question: "개발 담당에게 먼저 확인",
              answer: "",
            };
          expect(prompt).toContain("순환 요청이 보류");
          return {
            kind: "answer",
            peer: "none",
            question: "",
            answer: "파일 끝에 줄바꿈을 유지하세요.",
          };
        }
        expect(prompt).toContain("줄바꿈을 유지할까요?");
        if (++styleTurns === 1)
          return {
            kind: "clarify",
            peer: "none",
            question: "승인 범위가 어디까지인가요?",
            answer: "",
          };
        if (styleTurns === 2) {
          expect(prompt).toContain("notice.txt 한 파일");
          return {
            kind: "consult",
            peer: "review",
            question: "리뷰 기준을 확인해 주세요.",
            answer: "",
          };
        }
        expect(prompt).toContain("파일 끝에 줄바꿈을 유지하세요.");
        return {
          kind: "answer",
          peer: "none",
          question: "",
          answer: "줄바꿈 한 개를 유지하세요.",
        };
      }
      if (system.startsWith("Answer a clarification")) {
        expect(prompt).toContain("승인 범위가 어디까지인가요?");
        return { answer: "notice.txt 한 파일" };
      }
      if (system.startsWith("Implement only")) {
        if (followUp)
          return {
            content: "Final",
            ending: "preserve",
            consult: "none",
            question: "",
          };
        if (prompt.includes("peerAdvice")) {
          expect(prompt).toContain("줄바꿈 한 개를 유지하세요.");
          return { content: "After", ending: "one-line-break" };
        }
        return {
          content: "After",
          ending: "one-line-break",
          consult: "style",
          question: "줄바꿈을 유지할까요?",
        };
      }
      if (system.startsWith("Choose an independent")) {
        if (followUp) expect(prompt).not.toContain('"expected":"After"');
        return {
          kind: "text",
          expected: followUp ? "Final" : "After",
          exact: true,
          ending: "one-line-break",
          reason: "",
        };
      }
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const { id } = workflow.delegate(
      sessionId,
      randomUUID(),
      "문구 변경 전에 스타일 담당에게 확인해줘",
    );
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    const approval = store.getJob(id).approvalId!;
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("리뷰 → 플랜 · 계획 보완"),
        expect.stringContaining("리뷰 → 플랜 · 계획 확인"),
      ]),
    );
    workflow.answer(id, randomUUID(), true);
    expect(store.getJob(id).state).toBe("approval");
    expect(readFileSync(file, "utf8")).toBe("Before\n");

    workflow.answer(id, approval, true);
    workflow.answer(id, approval, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(readFileSync(file, "utf8")).toBe("After\n");
    const [firstChange] = store.readChanges(sessionId);
    expect(firstChange).toMatchObject({
      jobId: id,
      planId: approval,
      path: "notice.txt",
      checks: [
        { role: "review", passed: true },
        { role: "style", passed: true },
        { role: "test", passed: true },
      ],
    });
    const activity = store.snapshot().activity.map(({ text }) => text);
    expect(
      activity.filter((text) => text.startsWith("개발 → 스타일")),
    ).toHaveLength(1);
    expect(
      activity.filter((text) => text.startsWith("스타일 → 개발")),
    ).toHaveLength(1);
    expect(activity).toEqual(
      expect.arrayContaining([
        expect.stringContaining("보완 질문 · 승인 범위가 어디까지인가요?"),
        expect.stringContaining("보완 내용 · notice.txt 한 파일"),
        expect.stringContaining("스타일 → 리뷰 · notice.txt"),
        expect.stringContaining("리뷰 → 개발 순환 요청 보류"),
        expect.stringContaining(
          "리뷰 → 스타일 · 파일 끝에 줄바꿈을 유지하세요.",
        ),
      ]),
    );

    const originalReport = store
      .getMessages(sessionId)
      .find((message) => message.role === "assistant" && message.jobId === id);
    expect(originalReport).toBeDefined();
    followUp = true;
    const revision = randomUUID();
    const instruction = "같은 파일의 문구를 Final로 바꿔줘";
    expect(() =>
      workflow.revise(id, randomUUID(), revision, instruction),
    ).toThrow();
    workflow.revise(id, sessionId, revision, instruction);
    workflow.revise(id, sessionId, revision, instruction);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    const newApproval = store.getJob(id).approvalId!;
    expect(newApproval).not.toBe(approval);
    workflow.answer(id, approval, true);
    expect(readFileSync(file, "utf8")).toBe("After\n");
    workflow.answer(id, newApproval, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(readFileSync(file, "utf8")).toBe("Final\n");
    const [latestChange, previousChange] = store.readChanges(sessionId);
    expect(previousChange).toEqual(firstChange);
    expect(latestChange.planId).toBe(newApproval);
    expect(latestChange.beforeHash).toBe(firstChange.afterHash);
    expect(latestChange.afterHash).not.toBe(firstChange.afterHash);
    expect(store.readJobs(sessionId)).toHaveLength(1);
    expect(
      store.getMessages(sessionId).filter((message) => message.jobId === id),
    ).toEqual([
      originalReport,
      expect.objectContaining({ role: "user", text: instruction }),
      expect.objectContaining({ role: "assistant" }),
    ]);
    workflow.close();
    store.close();
    store = new CrewStore(database);
    expect(store.readChanges(sessionId)).toEqual([
      latestChange,
      previousChange,
    ]);
  } finally {
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("overlapping jobs replan and checks stay attached to the version they reviewed", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-queue-")));
  const file = join(folder, "notice.txt");
  writeFileSync(file, "Before\n");
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const firstEdit = Promise.withResolvers<void>();
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      const request = JSON.parse(prompt.split("\n\n").at(-1)!).request;
      const target = { First: "One", Second: "Two", Third: "Three" }[
        String(request)
      ];
      if (system.startsWith("Plan text-file"))
        return { paths: ["notice.txt"], goal: request, criterion: target };
      if (system.startsWith("Implement only")) {
        if (request === "First") await firstEdit.promise;
        return {
          content: target,
          ending: "preserve",
          consult: "none",
          question: "",
        };
      }
      if (system.startsWith("Choose an independent"))
        return {
          kind: "text",
          expected: target,
          exact: true,
          ending: "preserve",
          reason: "",
        };
      if (request === "Third" && system.startsWith("Check code style"))
        writeFileSync(file, "External edit\n");
      if (request === "Third" && system.startsWith("Check whether the change"))
        return {
          passed: true,
          note: "저장한 버전 확인",
          findings: [
            {
              path: "notice.txt",
              startLine: 1,
              endLine: 1,
              note: "저장된 문구",
            },
            {
              path: "notice.txt",
              startLine: 2,
              endLine: 2,
              note: "범위 밖 줄",
            },
            { path: "other.txt", startLine: 1, endLine: 1, note: "다른 파일" },
          ],
        };
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const { current, session } = store.snapshot();
    const first = workflow.delegate(session!.id, randomUUID(), "First").id;
    store.newSession(current!.id);
    const second = workflow.delegate(
      store.snapshot().session!.id,
      randomUUID(),
      "Second",
    ).id;
    await vi.waitFor(() => {
      expect(store.getJob(first).state).toBe("approval");
      expect(store.getJob(second).state).toBe("approval");
    });
    const originalApproval = store.getJob(second).approvalId!;
    workflow.answer(first, store.getJob(first).approvalId!, true);
    workflow.answer(second, originalApproval, true);
    expect(store.getJob(second).state).toBe("queued");
    expect(readFileSync(file, "utf8")).toBe("Before\n");
    firstEdit.resolve();
    await vi.waitFor(() => {
      expect(store.getJob(first).state).toBe("complete");
      expect(store.getJob(second).state).toBe("approval");
    });
    expect(readFileSync(file, "utf8")).toBe("One\n");
    expect(store.getJob(second).approvalId).not.toBe(originalApproval);
    workflow.answer(second, originalApproval, true);
    expect(store.getJob(second).state).toBe("approval");
    workflow.answer(second, store.getJob(second).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(second).state).toBe("complete"));
    expect(readFileSync(file, "utf8")).toBe("Two\n");

    const thirdSession = store.snapshot().session!.id;
    const third = workflow.delegate(thirdSession, randomUUID(), "Third").id;
    await vi.waitFor(() => expect(store.getJob(third).state).toBe("approval"));
    workflow.answer(third, store.getJob(third).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(third).state).toBe("failed"));
    expect(readFileSync(file, "utf8")).toBe("External edit\n");
    expect(store.snapshot().activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: third,
          text: expect.stringContaining("작성자 미확인 · notice.txt"),
        }),
      ]),
    );
    expect(store.getMessages(thirdSession).at(-1)?.text).toContain(
      "검증 중 파일이 바뀌었어요.",
    );
    expect(store.readChanges(thirdSession)[0]).toMatchObject({
      jobId: third,
      checks: [
        {
          role: "review",
          passed: true,
          findings: [
            { startLine: 1, endLine: 1, note: "저장된 문구", excerpt: "Three" },
          ],
        },
        { role: "style", passed: true },
        { role: "test", passed: true },
      ],
    });
  } finally {
    firstEdit.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("stopping one queued role request leaves work ahead and behind it intact", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-turn-")));
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const release = Promise.withResolvers<void>();
  const requested: string[] = [];
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      if (system.startsWith("Plan text-file")) {
        const { request } = JSON.parse(prompt);
        requested.push(request);
        if (request === "First") await release.promise;
        return { paths: ["notice.txt"], goal: request, criterion: request };
      }
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const session = store.snapshot().session!;
    const first = workflow.delegate(session.id, randomUUID(), "First").id;
    await vi.waitFor(() => expect(requested).toEqual(["First"]));
    const second = workflow.delegate(session.id, randomUUID(), "Second").id;
    const third = workflow.delegate(session.id, randomUUID(), "Third").id;
    await vi.waitFor(() => {
      expect(store.snapshot().activity).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            jobId: second,
            text: expect.stringContaining("앞 요청"),
          }),
          expect.objectContaining({
            jobId: third,
            text: expect.stringContaining("앞 요청"),
          }),
        ]),
      );
    });
    workflow.stop(second);
    await vi.waitFor(() => expect(store.getJob(second).state).toBe("stopped"));
    expect(requested).toEqual(["First"]);
    const memberId = randomUUID();
    store.addMember(session.projectId, {
      id: memberId,
      roleId: "plan",
      name: "다른 플랜 담당",
      provider: "local",
    });
    const fourth = workflow.delegate(session.id, randomUUID(), "Fourth").id;
    await vi.waitFor(() => expect(store.getJob(fourth).state).toBe("approval"));
    expect(store.getAssignee(fourth, "plan")).toBe(memberId);
    expect(store.getAgentContext(fourth, memberId)?.result).toContain("Fourth");
    expect(store.getAgentContext(fourth, "plan")).toBeUndefined();
    expect(requested).toEqual(["First", "Fourth"]);
    release.resolve();
    await vi.waitFor(() => {
      expect(store.getJob(first).state).toBe("approval");
      expect(store.getJob(third).state).toBe("approval");
    });
    expect(requested).toEqual(["First", "Fourth", "Third"]);
  } finally {
    release.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("unresolved peer guidance waits for the current user question across restart", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-clarify-")));
  const file = join(folder, "notice.txt");
  const database = join(folder, ".crew.sqlite");
  writeFileSync(file, "Before\n");
  let store = new CrewStore(database);
  let workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      const clarified = prompt.includes("사용자 답변: Final");
      if (system.startsWith("Plan text-file"))
        return {
          paths: ["notice.txt"],
          goal: "문구 변경",
          criterion: clarified ? "Final" : "새 문구",
        };
      if (system.startsWith("Implement only"))
        return {
          content: clarified ? "Final" : "Guessed",
          ending: "no-line-break",
          consult: clarified ? "none" : "style",
          question: clarified ? "" : "쓸 문구를 확인해 주세요.",
        };
      if (system.startsWith("Reply directly"))
        return {
          kind: "blocked",
          peer: "none",
          question: "",
          answer: "어떤 문구로 바꿀까요?",
        };
      if (system.startsWith("Choose an independent"))
        return {
          kind: "text",
          expected: "Final",
          exact: true,
          ending: "preserve",
          reason: "",
        };
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const { id } = workflow.delegate(sessionId, randomUUID(), "문구를 바꿔줘");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    const previousApproval = store.getJob(id).approvalId!;
    workflow.answer(id, previousApproval, true);
    await vi.waitFor(() =>
      expect(store.getJob(id).state).toBe("clarification"),
    );
    const question = store.getJob(id).clarification!;
    expect(question.text).toBe("어떤 문구로 바꿀까요?");
    expect(readFileSync(file, "utf8")).toBe("Before\n");
    expect(store.readChanges(sessionId)).toEqual([]);
    workflow.close();
    store.close();
    store = new CrewStore(database);
    workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    expect(store.getJob(id).clarification).toEqual(question);
    const request = randomUUID();
    expect(() =>
      workflow.revise(id, sessionId, request, "Final", randomUUID()),
    ).toThrow();
    workflow.revise(id, sessionId, request, "Final", question.id);
    workflow.revise(id, sessionId, request, "Final", question.id);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, previousApproval, true);
    expect(readFileSync(file, "utf8")).toBe("Before\n");
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(readFileSync(file, "utf8")).toBe("Final\n");
    expect(store.readChanges(sessionId)).toHaveLength(2);
    expect(
      store.getMessages(sessionId).filter(({ role }) => role === "user"),
    ).toHaveLength(1);
    expect(store.getJob(id).clarification).toBeNull();
  } finally {
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a coordinated edit reserves all files and rejects an out-of-scope write before saving", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-scope-")));
  const a = join(folder, "a.txt");
  const b = join(folder, "b.txt");
  const other = join(folder, "other.txt");
  const docs = join(folder, "docs");
  mkdirSync(docs);
  const nestedFile = join(docs, "note.txt");
  writeFileSync(nestedFile, "old note\n");
  writeFileSync(a, "old A\n");
  writeFileSync(b, "old B\n");
  writeFileSync(other, "external\n");
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const edit = Promise.withResolvers<void>();
  try {
    let batchPass = 0;
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      const { request, path, files } = JSON.parse(prompt.split("\n\n").at(-1)!);
      if (system.startsWith("Plan text-file"))
        return {
          paths:
            request === "Nested"
              ? ["note.txt"]
              : request === "Shared"
                ? ["b.txt"]
                : ["a.txt", "b.txt"],
          directories: request === "Batch" ? ["docs"] : [],
          goal: request,
          criterion: "new values",
        };
      if (system.startsWith("Implement only")) {
        if (request === "Nested")
          return {
            content: "new note",
            ending: "preserve",
            consult: "none",
            question: "",
          };
        if (request === "Batch") {
          batchPass++;
          await edit.promise;
        }
        return {
          edits: [
            { path: "a.txt", content: "new A", ending: "preserve" },
            {
              path: request === "Outside" ? "other.txt" : "b.txt",
              content:
                request === "Batch" && batchPass === 1 ? "old B" : "new B",
              ending: "preserve",
            },
          ],
          consult: "none",
          question: "",
        };
      }
      if (system.startsWith("Choose an independent")) {
        const check = (target: string) => ({
          kind: "text",
          expected:
            target === "note.txt"
              ? "new note"
              : target === "a.txt"
                ? "new A"
                : "new B",
          exact: true,
          ending: "preserve",
          reason: "",
        });
        return files
          ? {
              checks: files.map(({ path }: { path: string }) => ({
                path,
                ...check(path),
              })),
            }
          : check(path);
      }
      if (
        request === "Batch" &&
        system.startsWith("Check whether the change")
      ) {
        expect(prompt).toContain('"after":"new A\\n"');
        expect(prompt).toContain(
          batchPass === 1 ? '"after":"old B\\n"' : '"after":"new B\\n"',
        );
        if (batchPass === 1)
          return {
            passed: true,
            note: "첫 검토",
            findings: [
              {
                path: "a.txt",
                startLine: 1,
                endLine: 1,
                note: "첫 버전의 문구",
              },
            ],
          };
      }
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const session = store.snapshot().session!;
    const outside = workflow.delegate(session.id, randomUUID(), "Outside").id;
    await vi.waitFor(() =>
      expect(store.getJob(outside).state).toBe("approval"),
    );
    workflow.answer(outside, store.getJob(outside).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(outside).state).toBe("failed"));
    expect([a, b, other].map((file) => readFileSync(file, "utf8"))).toEqual([
      "old A\n",
      "old B\n",
      "external\n",
    ]);
    expect(store.readChanges(session.id)).toEqual([]);

    const batch = workflow.delegate(session.id, randomUUID(), "Batch").id;
    const shared = workflow.delegate(session.id, randomUUID(), "Shared").id;
    store.openFolder(docs);
    const nestedSession = store.snapshot().session!;
    const nested = workflow.delegate(
      nestedSession.id,
      randomUUID(),
      "Nested",
    ).id;
    await vi.waitFor(() => {
      expect(store.getJob(batch).state).toBe("approval");
      expect(store.getJob(shared).state).toBe("approval");
      expect(store.getJob(nested).state).toBe("approval");
    });
    const oldApproval = store.getJob(shared).approvalId!;
    workflow.answer(batch, store.getJob(batch).approvalId!, true);
    workflow.answer(shared, oldApproval, true);
    workflow.answer(nested, store.getJob(nested).approvalId!, true);
    expect(store.getJob(shared).state).toBe("queued");
    expect(store.getJob(nested).state).toBe("queued");
    expect(readFileSync(nestedFile, "utf8")).toBe("old note\n");
    edit.resolve();
    await vi.waitFor(() => {
      expect(store.getJob(batch).state).toBe("complete");
      expect(store.getJob(shared).state).toBe("approval");
      expect(store.getJob(nested).state).toBe("complete");
    });
    expect(store.getJob(shared).approvalId).not.toBe(oldApproval);
    expect(batchPass).toBe(2);
    expect(readFileSync(nestedFile, "utf8")).toBe("new note\n");
    store.openSession(session.id);
    expect(store.snapshot().activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: batch,
          text: expect.stringContaining(
            "테스트 · b.txt · 변경 없음 · 기대 결과와 달라요.",
          ),
        }),
      ]),
    );
    expect([a, b, other].map((file) => readFileSync(file, "utf8"))).toEqual([
      "new A\n",
      "new B\n",
      "external\n",
    ]);
    const changes = store.readChanges(session.id);
    expect(changes.map(({ path }) => path)).toEqual(["b.txt", "a.txt"]);
    expect(changes[1].previousChecks[0][0].findings).toEqual([
      { startLine: 1, endLine: 1, note: "첫 버전의 문구", excerpt: "new A" },
    ]);
    expect(
      new Set(
        changes.flatMap(({ checks }) => checks.map(({ batchId }) => batchId)),
      ).size,
    ).toBe(1);
    for (const change of changes) {
      expect(change.jobId).toBe(batch);
      expect(
        change.checks.map(({ role, passed }) => ({ role, passed })),
      ).toEqual([
        { role: "review", passed: true },
        { role: "style", passed: true },
        { role: "test", passed: true },
      ]);
    }
  } finally {
    edit.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("moving a file reserves both endpoints, preserves bytes, and never overwrites a destination", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-move-")));
  const source = join(folder, "before.txt");
  const destination = join(folder, "after.txt");
  const conflict = join(folder, "occupied.txt");
  const lateDestination = join(folder, "late.txt");
  const original = Buffer.from("\ufeffKeep the content\r\n");
  writeFileSync(source, original, { mode: 0o640 });
  writeFileSync(conflict, "Not this file\n");
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const moveTurn = Promise.withResolvers<void>();
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, input) => {
      const { request } = JSON.parse(input.split("\n\n").at(-1)!);
      if (system.startsWith("Plan text-file"))
        return {
          goal: request,
          criterion: "preserve bytes",
          paths:
            request === "Source"
              ? ["before.txt"]
              : request === "Destination"
                ? ["after.txt"]
                : [],
          moves: ["Move", "Conflict", "Late"].includes(request)
            ? [
                {
                  from: "before.txt",
                  to:
                    request === "Move"
                      ? "after.txt"
                      : request === "Late"
                        ? "late.txt"
                        : "occupied.txt",
                  edit: false,
                },
              ]
            : [],
          directories: [],
        };
      if (system.startsWith("Implement only")) {
        await moveTurn.promise;
        return {
          content: "Ignored because the move is unchanged",
          ending: "preserve",
          consult: "none",
          question: "",
        };
      }
      return { passed: true, note: "확인했어요.", findings: [] };
    });
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const invalid = workflow.delegate(sessionId, randomUUID(), "Conflict").id;
    await vi.waitFor(() => expect(store.getJob(invalid).state).toBe("failed"));
    expect(readFileSync(conflict, "utf8")).toBe("Not this file\n");
    expect(readFileSync(source)).toEqual(original);
    const late = workflow.delegate(sessionId, randomUUID(), "Late").id;
    await vi.waitFor(() => expect(store.getJob(late).state).toBe("approval"));
    writeFileSync(lateDestination, "Created outside Crew\n");
    workflow.answer(late, store.getJob(late).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(late).state).toBe("failed"));
    expect(readFileSync(lateDestination, "utf8")).toBe(
      "Created outside Crew\n",
    );
    expect(readFileSync(source)).toEqual(original);

    const moved = workflow.delegate(sessionId, randomUUID(), "Move").id;
    const editSource = workflow.delegate(sessionId, randomUUID(), "Source").id;
    const editDestination = workflow.delegate(
      sessionId,
      randomUUID(),
      "Destination",
    ).id;
    await vi.waitFor(() => {
      for (const id of [moved, editSource, editDestination])
        expect(store.getJob(id).state).toBe("approval");
    });

    for (const id of [moved, editSource, editDestination])
      workflow.answer(id, store.getJob(id).approvalId!, true);
    expect(store.getJob(editSource).state).toBe("queued");
    expect(store.getJob(editDestination).state).toBe("queued");
    expect(readFileSync(source)).toEqual(original);
    expect(() => readFileSync(destination)).toThrow();
    moveTurn.resolve();

    await vi.waitFor(() => {
      expect(store.getJob(moved).state).toBe("complete");
      expect(store.getJob(editSource).state).toBe("approval");
      expect(store.getJob(editDestination).state).toBe("approval");
    });
    expect(() => readFileSync(source)).toThrow();
    expect(readFileSync(destination)).toEqual(original);
    expect(statSync(destination).mode & 0o777).toBe(0o640);
    const [change] = store.readChanges(sessionId);
    expect(change).toMatchObject({
      path: "after.txt",
      movedFrom: "before.txt",
    });
    expect(change.beforeHash).toBe(change.afterHash);
    expect(change.checks.find(({ role }) => role === "test")?.passed).toBe(
      true,
    );
  } finally {
    moveTurn.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
