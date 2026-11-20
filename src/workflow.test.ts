import { randomUUID } from "node:crypto";
import {
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
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
    vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
      if (system.startsWith("Plan one")) {
        if (followUp) expect(prompt).toContain('"previousPath":"notice.txt"');
        if (replan && !followUp)
          expect(prompt).toContain("검증할 문구를 명시해 주세요.");
        return {
          path: "notice.txt",
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
        expect(prompt).toContain("줄바꿈을 유지할까요?");
        return { answer: "줄바꿈 한 개를 유지하세요." };
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
      if (system.startsWith("Plan one"))
        return { path: "notice.txt", goal: request, criterion: target };
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
    expect(store.getMessages(thirdSession).at(-1)?.text).toContain(
      "검증 중 파일이 바뀌었어요.",
    );
    expect(store.readChanges(thirdSession)[0]).toMatchObject({
      jobId: third,
      checks: [
        { role: "review", passed: true },
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
      if (system.startsWith("Plan one")) {
        const { request } = JSON.parse(prompt);
        requested.push(request);
        if (request === "First") await release.promise;
        return { path: "notice.txt", goal: request, criterion: request };
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
