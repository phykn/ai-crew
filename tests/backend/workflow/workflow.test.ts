import { createHash, randomUUID } from "node:crypto";
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
import { CodexConnection } from "../../../src/backend/server/codex/connection";
import { decideLocal } from "../../../src/backend/server/chat/local";
import { CrewStore } from "../../../src/backend/store/store";
import { CrewWorkflow } from "../../../src/backend/workflow/workflow";

vi.mock("../../../src/backend/server/chat/local", () => ({ decideLocal: vi.fn() }));
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
      if (system.startsWith("Plan only the changes")) {
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
        expect.stringContaining("리뷰 → 계획 · 계획 보완"),
        expect.stringContaining("리뷰 → 계획 · 계획 확인"),
      ]),
    );
    workflow.answer(id, randomUUID(), true);
    expect(store.getJob(id).state).toBe("approval");
    expect(readFileSync(file, "utf8")).toBe("Before\n");

    workflow.answer(id, approval, true);
    workflow.answer(id, approval, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    workflow.stop(id);
    expect(store.getJob(id).state).toBe("complete");
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
      if (system.startsWith("Plan only the changes"))
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
      if (system.startsWith("Plan only the changes")) {
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
      roleId: "assistant",
      name: "다른 비서",
      provider: "local",
    });
    const fourth = workflow.delegate(session.id, randomUUID(), "Fourth").id;
    await vi.waitFor(() => expect(store.getJob(fourth).state).toBe("approval"));
    expect(store.getAssignee(fourth, "assistant")).toBe(memberId);
    expect(store.getAgentContext(fourth, memberId)?.result).toContain("Fourth");
    expect(store.getAgentContext(fourth, "assistant")).toBeUndefined();
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
      if (system.startsWith("Plan only the changes"))
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
      if (system.startsWith("Plan only the changes"))
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
      if (system.startsWith("Plan only the changes"))
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

test.each(["written", "external", "copy-only"] as const)(
  "reopening a %s write reconciles the journal before any further work",
  async (scenario) => {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-recover-")));
    const database = join(folder, ".crew.sqlite");
    const source = join(folder, "source.txt");
    const file = join(folder, "notice.txt");
    const hash = (content: string) =>
      createHash("sha256").update(content).digest("hex");
    let store = new CrewStore(database);
    let workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    try {
      const move = scenario === "copy-only";
      const before = "Before\n";
      const after = move ? before : "After\n";
      writeFileSync(move ? source : file, before);
      store.openFolder(folder);
      const { id: sessionId } = store.snapshot().session!;
      const job = store.createJob(sessionId, randomUUID(), "파일 변경");
      const plan = {
        path: "notice.txt",
        baseline: move ? null : hash(before),
        goal: "파일 변경",
        criterion: after,
        ...(move
          ? {
              moves: [
                {
                  from: "source.txt",
                  to: "notice.txt",
                  baseline: hash(before),
                  edit: false,
                },
              ],
            }
          : {}),
      };
      const approval = store.proposeWorkPlan(job, plan);
      store.recordJob(job, "approval", "승인 요청", plan, approval);
      const approved = store.getJob(job.id);
      store.recordJob(approved, "developing", "수정 승인", plan, approval);
      const changeId = store.prepareChange(
        approved,
        "notice.txt",
        { hash: hash(before), content: before },
        { hash: hash(after), content: after },
        move ? "source.txt" : undefined,
      );
      const onDisk = scenario === "external" ? "External edit\n" : after;
      writeFileSync(file, onDisk);
      workflow.close();
      store.close();
      store = new CrewStore(database);
      workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
      expect(store.getJob(job.id).state).toBe("stopped");
      expect(store.readRecoveryJournal(job.id)).toMatchObject([
        { id: changeId, savedAt: null },
      ]);

      vi.mocked(decideLocal).mockImplementation(async (system) => {
        expect(system).not.toMatch(/^(Plan only the changes|Implement only)/);
        if (system.startsWith("Choose an independent"))
          return {
            kind: "text",
            expected: "After",
            exact: true,
            ending: "preserve",
            reason: "",
          };
        return { passed: true, note: "복구 검증", findings: [] };
      });
      workflow.resume(job.id);
      await vi.waitFor(() =>
        expect(store.getJob(job.id).state).toBe(
          scenario === "written" ? "complete" : "clarification",
        ),
      );
      expect(readFileSync(file, "utf8")).toBe(onDisk);
      expect(store.snapshot().jobs).toHaveLength(1);
      if (scenario === "written") {
        const [change] = store.readChanges(sessionId);
        expect(change.id).toBe(changeId);
        expect(change.checks).toHaveLength(3);
      } else {
        expect(store.getJob(job.id).clarification?.text).toContain(
          "저장 여부를 확인할 수 없는 경로가 있어요",
        );
        expect(decideLocal).not.toHaveBeenCalled();
        expect(store.readChanges(sessionId)).toEqual([]);
      }
      if (move) expect(readFileSync(source, "utf8")).toBe(before);
    } finally {
      workflow.close();
      store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  },
);

test.each(["recovers", "exhausted", "limited"] as const)(
  "model connection %s without replaying writes or exceeding the retry allowance",
  async (scenario) => {
    const folder = realpathSync(
      mkdtempSync(join(tmpdir(), "crew-model-retry-")),
    );
    const database = join(folder, ".crew.sqlite");
    let store = new CrewStore(database);
    let workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    let calls = 0;
    try {
      vi.mocked(decideLocal).mockImplementation(async (system) => {
        if (system.startsWith("Plan only the changes")) {
          calls++;
          if (scenario === "limited") throw new Error("Usage limit exceeded");
          if (scenario === "exhausted" || calls === 1)
            throw new TypeError("fetch failed", {
              cause: Object.assign(new Error("socket"), { code: "ECONNRESET" }),
            });
          return {
            paths: ["file.txt"],
            directories: [],
            moves: [],
            goal: "파일 추가",
            criterion: "문구 확인",
          };
        }
        return { passed: true, note: "확인했어요." };
      });
      store.openFolder(folder);
      const session = store.snapshot().session!;
      const { id } = workflow.delegate(session.id, randomUUID(), "파일 추가");
      const expected =
        scenario === "recovers"
          ? "approval"
          : scenario === "limited"
            ? "stopped"
            : "failed";
      await vi.waitFor(() => expect(store.getJob(id).state).toBe(expected), {
        timeout: 3000,
      });
      expect(calls).toBe(
        scenario === "recovers" ? 2 : scenario === "limited" ? 1 : 4,
      );
      expect(store.readChanges(session.id)).toHaveLength(0);
      expect(
        store
          .snapshot()
          .activity.filter(({ text }) => text.includes("모델 연결 재시도")),
      ).toHaveLength(
        scenario === "recovers" ? 1 : scenario === "limited" ? 0 : 3,
      );
      if (scenario === "limited")
        expect(store.getMessages(session.id).at(-1)?.text).toContain(
          "모델이 한도에 도달",
        );
      if (scenario === "exhausted") {
        workflow.close();
        store.close();
        store = new CrewStore(database);
        workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
        workflow.resume(id);
        await vi.waitFor(() => {
          expect(calls).toBe(5);
          expect(store.getJob(id).state).toBe("failed");
        });
        expect(
          store
            .snapshot()
            .activity.filter(({ text }) => text.includes("모델 연결 재시도")),
        ).toHaveLength(3);
      }
    } finally {
      workflow.close();
      store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  },
);

test("a disconnected Codex role resumes its new thread before falling back to the saved handoff", async () => {
  const folder = realpathSync(
    mkdtempSync(join(tmpdir(), "crew-codex-reconnect-")),
  );
  const store = new CrewStore(":memory:");
  const codex = new CodexConnection();
  const workflow = new CrewWorkflow(store, codex, () => {});
  try {
    store.openFolder(folder);
    const session = store.snapshot().session!;
    store.updateMember(session.projectId, "assistant", { provider: "codex" });
    const calls = vi.spyOn(codex, "run");
    calls.mockImplementationOnce(
      async (
        _project,
        saved,
        _prompt,
        _signal,
        emit,
        remember,
        _schema,
        _recover,
        tracking,
      ) => {
        expect(saved).toBeNull();
        remember("new-thread");
        tracking?.onTurn("new-thread", "interrupted-turn");
        emit('{"truncated":');
        throw Object.assign(new Error("connection reset"), {
          code: "ECONNRESET",
        });
      },
    );
    calls.mockImplementationOnce(
      async (
        _project,
        saved,
        _prompt,
        _signal,
        emit,
        remember,
        _schema,
        recover,
        tracking,
      ) => {
        expect(saved).toBe("new-thread");
        expect(tracking?.resumeTurn).toBe("interrupted-turn");
        expect(recover?.()).toContain("파일 추가");
        remember("recovered-thread");
        emit(
          JSON.stringify({
            paths: ["file.txt"],
            moves: [],
            directories: [],
            goal: "파일 추가",
            criterion: "파일 확인",
            specialist: { specialty: "", permanent: false },
          }),
        );
      },
    );
    vi.mocked(decideLocal).mockResolvedValue({
      passed: true,
      note: "확인했어요.",
    });
    const { id } = workflow.delegate(session.id, randomUUID(), "파일 추가");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    expect(calls).toHaveBeenCalledTimes(2);
    expect(store.getAgentContext(id, "assistant")?.threadId).toBe(
      "recovered-thread",
    );
    expect(store.snapshot().activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: id,
          text: expect.stringContaining("모델 연결 재시도 1/3"),
        }),
        expect.objectContaining({
          jobId: id,
          text: expect.stringContaining("이전 Codex 세션 new-thread"),
        }),
      ]),
    );
  } finally {
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test.each([
  { timing: "before completion", clear: false },
  { timing: "after completion", clear: false },
  { timing: "after completion", clear: true },
] as const)(
  "the chosen follow-up affects only that job when selected $timing (clear=$clear)",
  async ({ timing, clear }) => {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-followup-")));
    const database = join(folder, ".crew.sqlite");
    writeFileSync(join(folder, "first.txt"), "Before\n");
    writeFileSync(join(folder, "second.txt"), "Other\n");
    let store = new CrewStore(database);
    let workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    try {
      vi.mocked(decideLocal).mockImplementation(async (system, input) => {
        if (system.startsWith("Plan only the changes"))
          return {
            paths: [input.includes("Second") ? "second.txt" : "first.txt"],
            moves: [],
            directories: [],
            goal: input.includes("Second") ? "Second" : "First",
            criterion: "확인",
          };
        if (system.startsWith("Implement only"))
          return {
            content: "After",
            ending: "preserve",
            consult: "none",
            question: "",
          };
        if (system.startsWith("Choose an independent"))
          return {
            kind: "text",
            expected: "After",
            exact: true,
            ending: "preserve",
            reason: "",
          };
        return { passed: true, note: "확인했어요.", findings: [] };
      });
      store.openFolder(folder);
      const { id: sessionId } = store.snapshot().session!;
      const first = workflow.delegate(sessionId, randomUUID(), "First").id;
      const second = workflow.delegate(sessionId, randomUUID(), "Second").id;
      await vi.waitFor(() => {
        expect(store.getJob(first).state).toBe("approval");
        expect(store.getJob(second).state).toBe("approval");
      });
      const request = randomUUID();
      const instruction = clear
        ? "그거 first.txt 첫 줄을 Final로 바꿔줘"
        : "그거 다시 해줘";
      expect(workflow.routeFollowup(sessionId, request, instruction)).toBe(
        true,
      );
      expect(workflow.routeFollowup(sessionId, request, instruction)).toBe(
        true,
      );
      expect(store.snapshot().followups).toEqual([
        { id: request, text: instruction, candidateIds: [first, second] },
      ]);
      const otherBefore = store.getJob(second);
      workflow.close();
      store.close();
      store = new CrewStore(database);
      workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
      const select = () => workflow.selectFollowup(sessionId, request, first);
      expect(() =>
        workflow.selectFollowup(randomUUID(), request, first),
      ).toThrow();
      if (timing === "before completion") {
        select();
        expect(store.getJob(first).state).toBe("approval");
      }
      workflow.answer(first, store.getJob(first).approvalId!, true);
      if (timing === "after completion") {
        await vi.waitFor(() =>
          expect(store.getJob(first).state).toBe("complete"),
        );
        select();
      }
      await vi.waitFor(() =>
        expect(store.getJob(first).state).toBe(
          clear ? "approval" : "clarification",
        ),
      );
      select();
      if (clear) {
        expect(store.getJob(first).request).toBe(instruction);
        expect(store.previousJobInstruction(first)?.request).toBe("First");
      } else {
        expect(store.getJob(first).clarification?.text).toContain(
          "이 업무에서 어떻게 바꿀까요?",
        );
      }
      expect(store.getJob(second)).toEqual(otherBefore);
      expect(store.readChanges(sessionId)).toMatchObject([
        { jobId: first, path: "first.txt" },
      ]);
      expect(readFileSync(join(folder, "second.txt"), "utf8")).toBe("Other\n");
      expect(
        store.getMessages(sessionId).filter(({ text }) => text === instruction),
      ).toHaveLength(1);
      expect(store.snapshot().followups).toEqual([]);
    } finally {
      workflow.close();
      store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  },
);

test("stopping during development records a late response without writing it", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-stop-turn-")));
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const release = Promise.withResolvers<void>();
  const began = Promise.withResolvers<void>();
  try {
    vi.mocked(decideLocal).mockImplementation(async (system) => {
      if (system.startsWith("Plan only the changes"))
        return {
          paths: ["note.txt"],
          moves: [],
          directories: [],
          goal: "추가",
          criterion: "값",
        };
      if (system.startsWith("Implement only")) {
        began.resolve();
        await release.promise;
        return {
          content: "Late",
          ending: "as-written",
          consult: "none",
          question: "",
        };
      }
      return { passed: true, note: "확인했어요." };
    });
    store.openFolder(folder);
    const session = store.snapshot().session!;
    const { id } = workflow.delegate(session.id, randomUUID(), "파일 추가");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await began.promise;
    const followup = randomUUID();
    expect(workflow.routeFollowup(session.id, followup, "그거 다시 해줘")).toBe(
      true,
    );
    workflow.selectFollowup(session.id, followup, id);
    workflow.stop(id);
    expect(store.getJob(id).state).toBe("stopping");
    release.resolve();
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("stopped"));
    workflow.restoreFollowups();
    expect(store.getJob(id).state).toBe("stopped");
    expect(store.readChanges(session.id)).toEqual([]);
    expect(() => readFileSync(join(folder, "note.txt"))).toThrow();
    expect(store.snapshot().activity).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          jobId: id,
          text: expect.stringContaining("중단 이후 응답 도착"),
        }),
      ]),
    );
  } finally {
    release.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("staffing fills a vacant role and retires job-scoped hires without losing authorship", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-hiring-")));
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, input) => {
      const revised = input.includes("Final");
      if (system.startsWith("Plan only the changes"))
        return {
          paths: ["notice.txt"],
          directories: [],
          moves: [],
          goal: "파일과 전문 검토",
          criterion: revised ? "Final" : "Initial",
          specialist: { specialty: "접근성", permanent: true },
        };
      if (system.startsWith("Implement only"))
        return {
          content: revised ? "Final" : "Initial",
          ending: "as-written",
          consult: "none",
          question: "",
        };
      if (system.startsWith("Choose an independent"))
        return {
          kind: "text",
          expected: revised ? "Final" : "Initial",
          exact: true,
          ending: "as-written",
          reason: "",
        };
      return { passed: true, note: "확인했어요.", findings: [] };
    });
    store.openFolder(folder);
    const session = store.snapshot().session!;
    store.updateMember(session.projectId, "development", { hired: false });
    const { id } = workflow.delegate(
      session.id,
      randomUUID(),
      "Initial 문구와 정규 접근성 검토 담당",
    );
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    const first = store.readChanges(session.id)[0];
    const temp = store
      .readMembers(session.projectId, "development")
      .find(({ id }) => id === first.authorMemberId)!;
    const specialist = store
      .readMembers(session.projectId, "review")
      .find(({ specialty }) => specialty === "접근성")!;
    expect(temp).toMatchObject({
      hired: false,
      assignmentJobId: id,
      provider: "local",
    });
    expect(specialist.hired).toBe(true);
    expect(specialist.assignmentJobId).toBeUndefined();
    expect(store.getAgentContext(id, temp.id)?.result).toContain("Initial");

    workflow.revise(
      id,
      session.id,
      randomUUID(),
      "Final 문구로 바꾸고 접근성 검토",
    );
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    const [latest, original] = store.readChanges(session.id);
    expect(original.authorMemberId).toBe(temp.id);
    expect(latest.authorMemberId).not.toBe(temp.id);
    expect(store.getAssignee(id, "review", "접근성")).toBe(specialist.id);
    expect(readFileSync(join(folder, "notice.txt"), "utf8")).toBe("Final");
    expect(
      store
        .snapshot()
        .activity.filter(({ text }) => text.includes("후보 준비")),
    ).toHaveLength(3);
    expect(
      store
        .snapshot()
        .activity.filter(({ text }) => text.includes("업무 종료 · 미고용")),
    ).toHaveLength(2);
  } finally {
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("dismissing an assigned developer twice preserves its running handoff and blocks future assignment", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-dismiss-")));
  const store = new CrewStore(":memory:");
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  const entered = Promise.withResolvers<void>();
  const release = Promise.withResolvers<void>();
  try {
    vi.mocked(decideLocal).mockImplementation(async (system, input) => {
      const revised = input.includes("Final");
      if (system.startsWith("Plan only the changes"))
        return {
          paths: ["notice.txt"],
          moves: [],
          directories: [],
          goal: "문구",
          criterion: revised ? "Final" : "Initial",
        };
      if (system.startsWith("Implement only")) {
        if (!revised) {
          entered.resolve();
          await release.promise;
        }
        return {
          content: revised ? "Final" : "Initial",
          ending: "as-written",
          consult: "none",
          question: "",
        };
      }
      if (system.startsWith("Choose an independent"))
        return {
          kind: "text",
          expected: revised ? "Final" : "Initial",
          exact: true,
          ending: "as-written",
          reason: "",
        };
      return { passed: true, note: "확인했어요.", findings: [] };
    });
    store.openFolder(folder);
    const session = store.snapshot().session!;
    const { id } = workflow.delegate(
      session.id,
      randomUUID(),
      "Initial 파일 작성",
    );
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await entered.promise;
    store.updateMember(session.projectId, "development", { hired: false });
    store.updateMember(session.projectId, "development", { hired: false });
    expect(store.getJob(id).state).toBe("developing");
    release.resolve();
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(store.readChanges(session.id)[0].authorMemberId).toBe("development");
    expect(
      store
        .snapshot()
        .activity.filter(({ text }) => text.includes("새 배정 종료")),
    ).toHaveLength(1);

    workflow.revise(id, session.id, randomUUID(), "Final로 수정");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(
      store.readChanges(session.id).map(({ authorMemberId }) => authorMemberId),
    ).toEqual([expect.not.stringMatching(/^development$/), "development"]);
    store.updateMember(session.projectId, "development", { hired: true });
    expect(
      store.readMembers(session.projectId, "development")[0],
    ).toMatchObject({
      hired: true,
      provider: "local",
      id: "development",
    });
  } finally {
    release.resolve();
    workflow.close();
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test.each(["manual", "auto", "always"] as const)(
  "records the %s approval and respects current write grants",
  async (mode) => {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-approval-")));
    const store = new CrewStore(":memory:");
    const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
    const started = Promise.withResolvers<void>();
    const release = Promise.withResolvers<void>();
    let automaticDecisions = 0;
    try {
      vi.mocked(decideLocal).mockImplementation(async (system) => {
        if (system.startsWith("Plan only the changes"))
          return {
            paths: ["note.txt"],
            moves: [],
            directories: [],
            goal: "확인",
            criterion: "After",
          };
        if (system.startsWith("Approve an in-project")) {
          automaticDecisions++;
          return { allow: true };
        }
        if (system.startsWith("Implement only")) {
          started.resolve();
          if (mode === "always") await release.promise;
          return {
            content: "After",
            ending: "as-written",
            consult: "none",
            question: "",
          };
        }
        if (system.startsWith("Choose an independent"))
          return {
            kind: "text",
            expected: "After",
            exact: true,
            ending: "as-written",
            reason: "",
          };
        return { passed: true, note: "확인했어요.", findings: [] };
      });
      store.openFolder(folder);
      const session = store.snapshot().session!;
      store.setApprovalMode(session.projectId, mode);
      const { id } = workflow.delegate(
        session.id,
        randomUUID(),
        "메모 파일 생성",
      );
      if (mode === "manual") {
        await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
        const approval = store.getJob(id).approvalId!;
        store.setApprovalMode(session.projectId, "always");
        workflow.answer(id, randomUUID(), true);
        expect(store.getJob(id).state).toBe("approval");
        workflow.answer(id, approval, false);
        expect(store.getJob(id).state).toBe("denied");
        expect(store.snapshot().fileApprovals[0]).toMatchObject({
          id: approval,
          mode,
          scope: "note.txt",
          actor: "사용자",
          decision: "deny",
        });
        expect(() => readFileSync(join(folder, "note.txt"))).toThrow();
      } else if (mode === "always") {
        await started.promise;
        expect(() =>
          store.setWorkspaceWrite(session.projectId, "review", true),
        ).toThrow();
        store.newSession(session.projectId);
        store.setWorkspaceWrite(session.projectId, "development", false);
        store.openSession(session.id);
        release.resolve();
        await vi.waitFor(() => expect(store.getJob(id).state).toBe("failed"));
        expect(store.getMessages(session.id).at(-1)?.text).toContain(
          "파일 쓰기 권한이 없어요",
        );
        expect(() => readFileSync(join(folder, "note.txt"))).toThrow();
        expect(store.readChanges(session.id)).toEqual([]);
        store.openFolder(join(folder, "other-project"));
        const otherProject = store.snapshot().current!;
        expect(otherProject.approvalMode).toBe("manual");
        expect(
          store.readMembers(otherProject.id, "development")[0].writeAllowed,
        ).toBe(true);
        store.openSession(session.id);
      } else {
        await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
        expect(readFileSync(join(folder, "note.txt"), "utf8")).toBe("After");
      }
      if (mode !== "manual")
        expect(store.snapshot().fileApprovals[0]).toMatchObject({
          mode,
          scope: "note.txt",
          actor: "비서",
          decision: "allow",
        });
      expect(automaticDecisions).toBe(mode === "auto" ? 1 : 0);
    } finally {
      release.resolve();
      workflow.close();
      store.close();
      rmSync(folder, { recursive: true, force: true });
    }
  },
);
