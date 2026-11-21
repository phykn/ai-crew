import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, test, vi } from "vitest";
import { CodexConnection } from "../server/codex/connection";
import { decideLocal } from "../server/chat/local";
import { CrewStore } from "../store/store";
import { CrewWorkflow } from "./workflow";

vi.mock("../server/chat/local", () => ({ decideLocal: vi.fn() }));
afterEach(() => vi.resetAllMocks());

function git(cwd: string, ...args: string[]) {
  return execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: {
      ...process.env,
      GIT_AUTHOR_NAME: "Test",
      GIT_AUTHOR_EMAIL: "test@localhost",
      GIT_COMMITTER_NAME: "Test",
      GIT_COMMITTER_EMAIL: "test@localhost",
    },
  }).trim();
}

function repository() {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-git-")));
  git(folder, "init", "-q", "-b", "main");
  writeFileSync(join(folder, "notice.txt"), "Before\n");
  git(folder, "add", "-A");
  git(folder, "commit", "-qm", "start");
  return folder;
}

function planAll() {
  vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
    if (system.startsWith("Plan only the changes"))
      return {
        paths: ["notice.txt"],
        goal: "문구 변경",
        criterion: "After와 줄바꿈",
      };
    if (system.startsWith("Choose an independent"))
      return {
        kind: "text",
        expected: "After",
        exact: true,
        ending: "one-line-break",
        reason: "",
      };
    if (system.startsWith("Implement only"))
      return { content: "After", ending: "one-line-break", consult: "none", question: "" };
    if (prompt.includes("Review the proposed")) return { passed: true, note: "확인했어요." };
    return { passed: true, note: "확인했어요." };
  });
}

test("an isolated job edits its own worktree and applies to the original", async () => {
  const folder = repository();
  const store = new CrewStore(join(mkdtempSync(join(tmpdir(), "crew-db-")), "crew.sqlite"));
  const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
  try {
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    planAll();
    const { id } = workflow.delegate(sessionId, randomUUID(), "문구를 After로 바꿔줘");
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"));
    const prepared = await store.prepareIsolatedWorkspace(id);
    expect(prepared.worktree).toBeTruthy();
    expect(prepared.branch).toMatch(/^crew\//);
    expect(prepared.baseCommit).toBe(git(folder, "rev-parse", "HEAD"));
    expect(readFileSync(join(prepared.worktree!, "notice.txt"), "utf8")).toBe(
      "Before\n",
    );

    workflow.answer(id, store.getJob(id).approvalId!, true);
    await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"));
    expect(readFileSync(join(prepared.worktree!, "notice.txt"), "utf8")).toBe(
      "After\n",
    );
    expect(readFileSync(join(folder, "notice.txt"), "utf8")).toBe("Before\n");

    git(prepared.worktree!, "add", "-A");
    git(prepared.worktree!, "commit", "-qm", "crew change");
    const applied = await store.applyJob(id);
    expect(applied.applyState).toBe("applied");
    expect(readFileSync(join(folder, "notice.txt"), "utf8")).toBe("After\n");
    expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
      expect.arrayContaining([
        expect.stringContaining("격리 작업공간 준비"),
        expect.stringContaining("원본 반영 완료"),
      ]),
    );

    await store.cleanupWorkspace(id);
    expect(existsSync(prepared.worktree!)).toBe(false);
    expect(store.getJob(id)).toMatchObject({
      worktree: null,
      branch: prepared.branch,
      baseCommit: prepared.baseCommit,
      applyState: "applied",
    });
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("a conflicting original keeps both sides and stays in 반영 대기", async () => {
  const folder = repository();
  const store = new CrewStore(join(mkdtempSync(join(tmpdir(), "crew-db-")), "crew.sqlite"));
  try {
    store.openFolder(folder);
    const sessionId = store.snapshot().session!.id;
    const job = store.createJob(sessionId, randomUUID(), "다른 문구로 바꿔줘");
    const prepared = await store.prepareIsolatedWorkspace(job.id);
    writeFileSync(join(prepared.worktree!, "notice.txt"), "Isolated\n");
    git(prepared.worktree!, "add", "-A");
    git(prepared.worktree!, "commit", "-qm", "isolated");
    writeFileSync(join(folder, "notice.txt"), "Original\n");
    git(folder, "add", "-A");
    git(folder, "commit", "-qm", "original");
    store.recordJob(store.getJob(job.id), "complete", "완료");

    const blocked = await store.applyJob(job.id);
    expect(blocked.applyState).toBe("blocked");
    expect(blocked.applyNote).toContain("충돌");
    expect(readFileSync(join(folder, "notice.txt"), "utf8")).toBe("Original\n");
    expect(readFileSync(join(prepared.worktree!, "notice.txt"), "utf8")).toBe(
      "Isolated\n",
    );
    expect(git(folder, "worktree", "list")).toContain(prepared.worktree!);
    expect(
      store.snapshot().activity.map(({ text }) => text),
    ).toEqual(expect.arrayContaining([expect.stringContaining("원본 반영 대기")]));

    const dirty = join(folder, "draft.txt");
    writeFileSync(dirty, "uncommitted\n");
    const second = store.createJob(sessionId, randomUUID(), "또 바꿔줘");
    await expect(store.prepareIsolatedWorkspace(second.id)).rejects.toThrow(
      "커밋하지 않은 변경",
    );
    rmSync(dirty);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
