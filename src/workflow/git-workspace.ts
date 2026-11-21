import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

async function git(root: string, args: string[]) {
  const { stdout } = await exec("git", args, {
    cwd: root,
    maxBuffer: 16 * 1024 * 1024,
    env: {
      ...process.env,
      GIT_TERMINAL_PROMPT: "0",
      GIT_AUTHOR_NAME: process.env.GIT_AUTHOR_NAME ?? "AI Crew",
      GIT_AUTHOR_EMAIL: process.env.GIT_AUTHOR_EMAIL ?? "crew@localhost",
      GIT_COMMITTER_NAME: process.env.GIT_COMMITTER_NAME ?? "AI Crew",
      GIT_COMMITTER_EMAIL: process.env.GIT_COMMITTER_EMAIL ?? "crew@localhost",
    },
  });
  return stdout.trim();
}

async function tryGit(root: string, args: string[]) {
  try {
    return await git(root, args);
  } catch {
    return null;
  }
}

async function capture(root: string, args: string[]) {
  try {
    const { stdout, stderr } = await exec("git", args, {
      cwd: root,
      maxBuffer: 16 * 1024 * 1024,
    });
    return { ok: true, stdout: stdout.trim(), stderr: stderr.trim() };
  } catch (error) {
    const detail = error as { stdout?: string; stderr?: string };
    return {
      ok: false,
      stdout: (detail.stdout ?? "").trim(),
      stderr: (detail.stderr ?? "").trim(),
    };
  }
}

type RepositoryState = {
  repository: boolean;
  branch: string | null;
  head: string | null;
  clean: boolean;
};

export async function repositoryState(root: string): Promise<RepositoryState> {
  const inside = await tryGit(root, ["rev-parse", "--is-inside-work-tree"]);
  if (inside !== "true")
    return { repository: false, branch: null, head: null, clean: true };
  const branch = await tryGit(root, ["rev-parse", "--abbrev-ref", "HEAD"]);
  const head = await tryGit(root, ["rev-parse", "HEAD"]);
  const status = await tryGit(root, ["status", "--porcelain"]);
  return {
    repository: true,
    branch: branch === "HEAD" ? null : branch,
    head,
    clean: status === "",
  };
}

/**
 * 업무 전용 브랜치와 워크트리를 만든다. 미커밋 변경이 있는 원본에서는
 * 기준 버전을 정할 수 없으므로 시작하지 않는다.
 */
export async function createWorktree(
  root: string,
  options: { path: string; branch: string; base: string },
) {
  const state = await repositoryState(root);
  if (!state.repository) throw new Error("Git 저장소가 아니에요.");
  if (!state.clean)
    throw new Error(
      "원본 폴더에 커밋하지 않은 변경이 있어요. 격리 실행은 커밋된 기준에서 시작해요.",
    );
  if (!state.head) throw new Error("기준 커밋을 찾을 수 없어요.");
  await git(root, [
    "worktree",
    "add",
    "-b",
    options.branch,
    options.path,
    options.base || state.head,
  ]);
  return { path: options.path, branch: options.branch, base: options.base || state.head };
}

export async function removeWorktree(root: string, path: string) {
  await git(root, ["worktree", "remove", "--force", path]);
  await git(root, ["worktree", "prune"]);
}

type ApplyResult =
  | { applied: true; commit: string }
  | { applied: false; reason: string; conflicts: string[] };

/** 검증을 마친 업무 브랜치를 원본 브랜치에 합친다. 충돌하면 아무것도 바꾸지 않는다. */
export async function applyBranch(
  root: string,
  options: { branch: string; target: string | null; message: string },
): Promise<ApplyResult> {
  const state = await repositoryState(root);
  if (!state.repository) return { applied: false, reason: "Git 저장소가 아니에요.", conflicts: [] };
  if (!state.clean)
    return {
      applied: false,
      reason: "원본 폴더에 커밋하지 않은 변경이 있어 반영하지 않았어요.",
      conflicts: [],
    };
  if (options.target && state.branch !== options.target)
    return {
      applied: false,
      reason:
        "원본이 " +
        options.target +
        " 브랜치가 아니에요. 지금은 " +
        (state.branch ?? "분리된 HEAD") +
        " 상태예요.",
      conflicts: [],
    };
  const merged = await capture(root, [
    "merge-tree",
    "--write-tree",
    "--name-only",
    "HEAD",
    options.branch,
  ]);
  if (!merged.ok) {
    const conflicts = [...(merged.stdout + "\n" + merged.stderr).matchAll(
      /CONFLICT \([^)]*\): [^\n]*? in ([^\n]+)/g,
    )]
      .map((match) => match[1].trim())
      .filter(Boolean);
    return {
      applied: false,
      reason: "업무 브랜치와 원본이 충돌해 반영을 기다리고 있어요.",
      conflicts: [...new Set(conflicts)],
    };
  }
  await git(root, ["merge", "--squash", options.branch]);
  await git(root, ["commit", "-m", options.message]);
  return { applied: true, commit: await git(root, ["rev-parse", "HEAD"]) };
}
