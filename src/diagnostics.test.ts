import { execFileSync } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { createServer as createHttpServer, type Server } from "node:http";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { ActionRunner } from "./app-actions";
import { CodexConnection } from "./codex";
import { runDiagnostics, validateEndpointUrl } from "./diagnostics";
import { CrewMcp } from "./mcp";
import { CrewStore } from "./store";
import { CrewWorkflow } from "./workflow";

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
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-diag-")));
  git(folder, "init", "-q", "-b", "main");
  writeFileSync(join(folder, "notice.txt"), "Before\n");
  git(folder, "add", "-A");
  git(folder, "commit", "-qm", "start");
  return folder;
}

async function listen(server: Server) {
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  return "http://127.0.0.1:" + (typeof address === "object" && address ? address.port : 0);
}

test("only an http(s) address without credentials or a fragment passes", () => {
  expect(validateEndpointUrl("http://127.0.0.1:8082/v1")).toBe(
    "http://127.0.0.1:8082/v1",
  );
  expect(validateEndpointUrl("https://example.com/mcp", "mcp")).toBe(
    "https://example.com/mcp",
  );
  expect(() => validateEndpointUrl("not a url")).toThrow("형식이 올바르지 않아요");
  expect(() => validateEndpointUrl("ftp://example.com")).toThrow("http: 또는 https:");
  expect(() => validateEndpointUrl("file:///etc/passwd")).toThrow("http: 또는 https:");
  expect(() => validateEndpointUrl("https://user:pw@example.com/v1")).toThrow(
    "인증값을 포함하지 않은 HTTP 주소",
  );
  expect(() => validateEndpointUrl("https://token@example.com/mcp", "mcp")).toThrow(
    "인증값을 포함하지 않은 HTTP MCP 주소",
  );
  expect(() => validateEndpointUrl("https://example.com/v1#frag")).toThrow(
    "# 뒤 조각",
  );
});

test("the model address check refuses credentials and accepts a plain address", () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-diag-store-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    expect(() =>
      store.addModelConnection({
        id: randomUUID(),
        name: "자격증명",
        provider: "local",
        baseUrl: "http://user:pw@127.0.0.1:8082/v1",
        model: null,
        enabled: true,
      }),
    ).toThrow("인증값을 포함하지 않은 HTTP 주소");
    expect(() =>
      store.addModelConnection({
        id: randomUUID(),
        name: "형식 오류",
        provider: "local",
        baseUrl: "localhost:8082",
        model: null,
        enabled: true,
      }),
    ).toThrow("http: 또는 https:");
    store.addModelConnection({
      id: randomUUID(),
      name: "집 서버",
      provider: "local",
      baseUrl: "http://127.0.0.1:8082/v1",
      model: "qwen",
      enabled: true,
    });
    expect(store.listModelConnections()).toHaveLength(1);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("diagnostics report the repository, codex, the local model and mcp servers", async () => {
  const root = repository();
  const store = new CrewStore(join(root, ".crew.sqlite"));
  const model = createHttpServer((request, response) => {
    if (request.url === "/v1/models") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ data: [{ id: "qwen", loaded: true }] }));
      return;
    }
    response.writeHead(404);
    response.end();
  });
  const mcpServer = createHttpServer((_request, response) => {
    response.writeHead(405, { allow: "POST" });
    response.end();
  });
  try {
    const modelUrl = await listen(model);
    const mcpUrl = await listen(mcpServer);
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    store.saveMcpEndpoint(projectId, {
      id: randomUUID(),
      name: "노션",
      url: mcpUrl,
      enabled: true,
      tools: [],
    });

    const report = await runDiagnostics({
      store,
      projectId,
      localTarget: () => ({ baseUrl: modelUrl + "/v1", model: "qwen" }),
      codexBin: process.execPath,
      timeoutMs: 3000,
    });
    expect(report.ok).toBe(true);
    expect(report.checks.map(({ id }) => id)).toEqual([
      "git",
      "codex",
      "local-model",
      "mcp",
    ]);
    expect(report.checks[0].detail).toContain("main");
    expect(report.checks[2].detail).toContain("qwen");
    expect(report.checks[3].detail).toContain("HTTP 405");

    // 로컬 모델이 꺼져 있으면 실패한 점검만 알린다.
    const offline = await runDiagnostics({
      store,
      projectId,
      localTarget: () => ({ baseUrl: "http://127.0.0.1:9/v1", model: "qwen" }),
      codexBin: join(root, "missing-codex"),
      timeoutMs: 1500,
    });
    expect(offline.ok).toBe(false);
    expect(
      offline.checks.filter(({ ok }) => !ok).map(({ id }) => id).sort(),
    ).toEqual(["codex", "local-model"]);
  } finally {
    store.close();
    model.close();
    mcpServer.close();
    rmSync(root, { recursive: true, force: true });
  }
});

test("the runner exposes diagnostics as an app action", async () => {
  const root = repository();
  const store = new CrewStore(join(root, ".crew.sqlite"));
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    const runner = new ActionRunner({
      store,
      workflow: new CrewWorkflow(store, new CodexConnection(), () => {}),
      mcp: new CrewMcp(store),
      diagnostics: async (id) => ({
        ok: true,
        checkedAt: new Date().toISOString(),
        checks: [
          { id: "git", label: "Git 저장소", ok: true, detail: id === projectId ? "main" : "" },
        ],
      }),
    });
    const outcome = await runner.run({ type: "diagnostics.run", projectId });
    expect(outcome.status).toBe("diagnostics");
    if (outcome.status !== "diagnostics") return;
    expect(outcome.report.ok).toBe(true);
    expect(outcome.snapshot.current!.id).toBe(projectId);
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
