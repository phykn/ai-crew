// 사전 진단: 프로젝트 폴더, Codex 설치, 로컬 모델, MCP 서버까지 지금 실행에
// 필요한 조건을 한 번에 확인한다. 모델·MCP 주소는 여기 한 곳의 규칙으로 검사한다.

import { existsSync } from "node:fs";
import { delimiter, join } from "node:path";
import type { CrewStore } from "../store/store";
import { repositoryState } from "../workflow/git-workspace";
import { localTarget as defaultLocalTarget } from "./local";

type EndpointRole = "model" | "mcp";

/**
 * 모델·MCP 주소를 실행 전에 검사한다. HTTP(S)만 쓰고, 주소에 실린 사용자·비밀번호와
 * `#` 뒤 조각은 받지 않는다. 통과하면 정규화한 주소를 돌려준다.
 */
export function validateEndpointUrl(url: string, role: EndpointRole = "model") {
  const label = role === "mcp" ? "HTTP MCP 주소" : "HTTP 주소";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error(label + " 형식이 올바르지 않아요.");
  }
  if (!["http:", "https:"].includes(parsed.protocol))
    throw new Error(label + "는 http: 또는 https:여야 해요.");
  if (parsed.username || parsed.password)
    throw new Error("인증값을 포함하지 않은 " + label + "를 입력해 주세요.");
  if (parsed.hash)
    throw new Error(label + "에 # 뒤 조각을 넣을 수 없어요.");
  return parsed.href;
}

export type DiagnosticCheck = {
  id: "git" | "codex" | "local-model" | "mcp";
  label: string;
  ok: boolean;
  detail: string;
};

export type DiagnosticsReport = {
  ok: boolean;
  checkedAt: string;
  checks: DiagnosticCheck[];
};

type DiagnosticsInput = {
  store: CrewStore;
  projectId: string;
  /** 로컬 모델 주소를 읽는 함수. 테스트와 다른 실행 환경에서 바꿔 끼운다. */
  localTarget?: () => { baseUrl: string; model?: string | null };
  /** Codex 실행 파일 경로. 지정하면 PATH 탐색보다 우선한다. */
  codexBin?: string;
  /** 각 점검의 시간 제한. */
  timeoutMs?: number;
};

/** Git 저장소, Codex, 로컬 모델 연결, MCP 서버를 순서대로 확인한다. */
export async function runDiagnostics(
  input: DiagnosticsInput,
): Promise<DiagnosticsReport> {
  const timeout = input.timeoutMs ?? 4000;
  const project = input.store.getProject(input.projectId);
  const checks: DiagnosticCheck[] = [
    await checkGit(project.root),
    checkCodex(input.codexBin),
    await checkLocalModel(input.localTarget ?? defaultLocalTarget, timeout),
    ...(await checkMcpEndpoints(input.store, input.projectId, timeout)),
  ];
  return {
    ok: checks.every(({ ok }) => ok),
    checkedAt: new Date().toISOString(),
    checks,
  };
}

async function checkGit(root: string): Promise<DiagnosticCheck> {
  try {
    const state = await repositoryState(root);
    if (!state.repository)
      return {
        id: "git",
        label: "Git 저장소",
        ok: false,
        detail: "이 폴더는 Git 저장소가 아니에요. 격리 작업과 원본 반영을 쓸 수 없어요.",
      };
    return {
      id: "git",
      label: "Git 저장소",
      ok: true,
      detail:
        (state.branch ?? "분리된 HEAD") +
        (state.head ? " @ " + state.head.slice(0, 8) : "") +
        (state.clean ? " · 변경 없음" : " · 미커밋 변경 있음"),
    };
  } catch (error) {
    return {
      id: "git",
      label: "Git 저장소",
      ok: false,
      detail: error instanceof Error ? error.message.slice(0, 200) : "확인 실패",
    };
  }
}

function checkCodex(explicit?: string): DiagnosticCheck {
  const candidates = [
    explicit,
    process.env.AI_CREW_CODEX_BIN,
    ...(process.platform === "darwin"
      ? ["/opt/homebrew/bin/codex", "/usr/local/bin/codex"]
      : []),
  ].filter((path): path is string => Boolean(path));
  const found = candidates.find((path) => path.includes("/") && existsSync(path));
  const onPath = found ?? searchPath("codex");
  return {
    id: "codex",
    label: "Codex CLI",
    ok: Boolean(onPath),
    detail: onPath
      ? onPath
      : "Codex CLI를 찾지 못했어요. 설치하거나 AI_CREW_CODEX_BIN으로 경로를 지정해 주세요.",
  };
}

function searchPath(binary: string) {
  for (const directory of (process.env.PATH ?? "").split(delimiter)) {
    if (!directory) continue;
    const path = join(directory, binary);
    if (existsSync(path)) return path;
  }
  return null;
}

async function checkLocalModel(
  target: () => { baseUrl: string; model?: string | null },
  timeoutMs: number,
): Promise<DiagnosticCheck> {
  const { baseUrl, model } = target();
  const label = "로컬 모델";
  try {
    const response = await fetch(baseUrl.replace(/\/+$/, "") + "/models", {
      signal: AbortSignal.timeout(timeoutMs),
      redirect: "error",
    });
    if (!response.ok)
      return {
        id: "local-model",
        label,
        ok: false,
        detail: model ? model + " · HTTP " + response.status : "HTTP " + response.status,
      };
    return {
      id: "local-model",
      label,
      ok: true,
      detail: (model ?? baseUrl) + " · 응답 확인",
    };
  } catch (error) {
    return {
      id: "local-model",
      label,
      ok: false,
      detail:
        (model ? model + " · " : baseUrl + " · ") +
        (error instanceof Error ? error.message.slice(0, 160) : "연결 실패"),
    };
  }
}

async function checkMcpEndpoints(
  store: CrewStore,
  projectId: string,
  timeoutMs: number,
): Promise<DiagnosticCheck[]> {
  const servers = store.listMcpEndpoints(projectId).filter(({ enabled }) => enabled);
  if (!servers.length)
    return [
      {
        id: "mcp",
        label: "MCP 서버",
        ok: true,
        detail: "연결한 MCP 서버가 없어요.",
      },
    ];
  const checks: DiagnosticCheck[] = [];
  for (const server of servers) {
    let ok = false;
    let detail: string;
    try {
      const response = await fetch(server.url, {
        method: "GET",
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
        headers: { accept: "application/json, text/event-stream" },
      });
      ok = response.status < 500;
      detail = server.name + " · HTTP " + response.status;
    } catch (error) {
      detail =
        server.name +
        " · " +
        (error instanceof Error ? error.message.slice(0, 140) : "연결 실패");
    }
    checks.push({ id: "mcp", label: "MCP 서버", ok, detail });
  }
  return checks;
}
