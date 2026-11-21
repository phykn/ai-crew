import { randomUUID, createHash } from "node:crypto";
import {
  link,
  lstat,
  open,
  readdir,
  realpath,
  rename,
  unlink,
} from "node:fs/promises";
import { constants } from "node:fs";
import { dirname, isAbsolute, relative, resolve, sep } from "node:path";

const ignored = new Set(["node_modules", "dist", "out", "coverage"]);
const maxBytes = 24_000;

export function validateWorkspaceText(content: string) {
  if (Buffer.byteLength(content) > maxBytes || content.includes("\0"))
    throw new Error("작은 텍스트 파일만 이 작업에서 수정할 수 있어요.");
}

export async function listWorkspace(root: string) {
  const entries: string[] = [];
  async function walk(folder: string, depth: number) {
    for (const entry of await readdir(folder, { withFileTypes: true })) {
      if (entries.length >= 120) return;
      if (
        entry.name.startsWith(".") ||
        ignored.has(entry.name) ||
        entry.isSymbolicLink()
      )
        continue;
      const path = resolve(folder, entry.name);
      if (entry.isFile()) entries.push(relative(root, path));
      if (entry.isDirectory() && depth < 2) await walk(path, depth + 1);
    }
  }
  await walk(root, 0);
  return entries.sort();
}

function resolveWorkspacePath(root: string, path: string) {
  if (
    !path ||
    isAbsolute(path) ||
    path.includes("\\") ||
    path
      .split("/")
      .some((part) => !part || part.startsWith(".") || ignored.has(part))
  ) {
    throw new Error("프로젝트 안의 작업 파일 경로를 지정해 주세요.");
  }
  return resolve(root, path);
}

export async function inspectDirectoryScope(root: string, path: string) {
  const target = path === "." ? root : resolveWorkspacePath(root, path);
  if (
    (await realpath(target)) !== target ||
    !(await lstat(target)).isDirectory()
  )
    throw new Error(
      "예약할 작업 폴더는 프로젝트 안의 실제 디렉터리여야 합니다.",
    );
}

export async function inspectFile(root: string, path: string) {
  const target = resolveWorkspacePath(root, path);
  const parent = await realpath(dirname(target));
  if (
    parent !== dirname(target) ||
    (parent !== root && !parent.startsWith(root + sep))
  ) {
    throw new Error("프로젝트 밖으로 연결된 경로는 열 수 없어요.");
  }
  try {
    const meta = await lstat(target);
    if (!meta.isFile() || meta.size > maxBytes)
      throw new Error("작은 텍스트 파일만 이 작업에서 수정할 수 있어요.");
    const file = await open(target, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const bytes = Buffer.alloc(maxBytes + 1);
      const { bytesRead } = await file.read(bytes, 0, bytes.length, 0);
      if (bytesRead > maxBytes || bytes.subarray(0, bytesRead).includes(0))
        throw new Error("작은 텍스트 파일만 이 작업에서 수정할 수 있어요.");
      const content = new TextDecoder("utf-8", {
        fatal: true,
        ignoreBOM: true,
      }).decode(bytes.subarray(0, bytesRead));
      return {
        target,
        mode: meta.mode & 0o777,
        content,
        hash: createHash("sha256")
          .update(bytes.subarray(0, bytesRead))
          .digest("hex"),
      };
    } finally {
      await file.close();
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT")
      return { target, mode: 0o644, content: null, hash: null };
    throw error;
  }
}

export async function writeWorkspaceFile(
  root: string,
  path: string,
  expected: string | null,
  content: string,
  signal: AbortSignal,
  checkWrite: () => void,
  fileMode?: number,
) {
  const entry = await inspectFile(root, path);
  if (entry.hash !== expected)
    throw new Error(
      "계획을 승인한 뒤 파일이 바뀌었어요. 최신 파일을 기준으로 다시 계획해 주세요.",
    );
  validateWorkspaceText(content);
  signal.throwIfAborted();
  checkWrite();
  const temporary = resolve(dirname(entry.target), ".crew-" + randomUUID());
  const file = await open(temporary, "wx", fileMode ?? entry.mode);
  try {
    try {
      await file.writeFile(content, "utf8");
      if (fileMode !== undefined) await file.chmod(fileMode);
      await file.sync();
    } finally {
      await file.close();
    }
    if ((await inspectFile(root, path)).hash !== expected)
      throw new Error("저장 직전에 파일이 바뀌었어요.");
    signal.throwIfAborted();
    checkWrite();
    if (expected === null) await link(temporary, entry.target);
    else await rename(temporary, entry.target);
  } finally {
    await unlink(temporary).catch((error: NodeJS.ErrnoException) => {
      if (error.code !== "ENOENT") throw error;
    });
  }
}

export async function moveWorkspaceFile(
  root: string,
  from: string,
  to: string,
  expected: { sourceHash: string; destinationHash: string },
  content: string,
  signal: AbortSignal,
  checkWrite: () => void,
) {
  const source = await inspectFile(root, from);
  if (source.hash !== expected.sourceHash)
    throw new Error("이동할 원본이 승인 이후 바뀌었어요.");
  await writeWorkspaceFile(
    root,
    to,
    null,
    content,
    signal,
    checkWrite,
    source.mode,
  );
  const destination = await inspectFile(root, to);
  if (
    destination.hash !== expected.destinationHash ||
    (await inspectFile(root, from)).hash !== expected.sourceHash
  )
    throw new Error("이동 중 파일이 바뀌었어요. 원본 경로는 보존했어요.");
  signal.throwIfAborted();
  checkWrite();
  await unlink(source.target);
}
