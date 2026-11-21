// 로컬 클라이언트(웹 화면, 다른 기기, 스크립트)가 앱의 실행기를 그대로 쓰는
// 작은 HTTP 서버. Node 내장 http만 쓰고 127.0.0.1에만 바인딩한다.
//
//   GET  /health        살아 있는지 (토큰 없이)
//   GET  /api/snapshot  현재 화면 상태
//   POST /api/action    화면과 같은 ActionRunner로 동작 실행
//   GET  /api/events    SSE. 스트림 청크와 상태 변경을 보내고 주기적으로 : ping

import { randomBytes } from "node:crypto";
import {
  createServer,
  type IncomingMessage,
  type Server,
  type ServerResponse,
} from "node:http";
import type { ChatEvent } from "../../shared/actions";
import type { ActionRunner } from "../app/actions";
import { sanitizeText } from "../diagnostics/sanitizer";
import { ReloadDefer } from "../../workflow/engine-fence";

type CrewHttpOptions = {
  runner: ActionRunner;
  /** 메인 프로세스의 변경 알림(`crew:update`)을 그대로 넘긴다. */
  subscribe?: (receive: (event: ChatEvent | null) => void) => () => void;
  /** 지정하지 않으면 시작할 때마다 새로 만든다. */
  token?: string;
  port?: number;
  host?: string;
  heartbeatMs?: number;
  maxBodyBytes?: number;
};

type CrewHttpServer = {
  server: Server;
  port: number;
  url: string;
  token: string;
  close: () => Promise<void>;
};

const json = (response: ServerResponse, status: number, body: unknown) => {
  const text = JSON.stringify(body);
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(text),
    "cache-control": "no-store",
  });
  response.end(text);
};

export async function createCrewHttpServer(
  options: CrewHttpOptions,
): Promise<CrewHttpServer> {
  const token = options.token ?? randomBytes(24).toString("hex");
  const heartbeatMs = options.heartbeatMs ?? 15_000;
  const maxBody = options.maxBodyBytes ?? 1_000_000;
  const clients = new Set<ServerResponse>();
  const reload = new ReloadDefer();
  let heartbeat: NodeJS.Timeout | null = null;
  let unsubscribe: (() => void) | null = null;

  const write = (client: ServerResponse, chunk: string) => {
    if (client.writableEnded || client.destroyed) return;
    client.write(chunk);
  };

  const broadcast = (event: string, data: unknown) => {
    const chunk =
      "event: " + event + "\ndata: " + JSON.stringify(data) + "\n\n";
    for (const client of clients) write(client, chunk);
  };

  const authorized = (request: IncomingMessage, url: URL) => {
    const header = request.headers.authorization ?? "";
    const bearer = header.startsWith("Bearer ") ? header.slice(7) : "";
    // EventSource는 헤더를 넣을 수 없으므로 스트림에 한해 쿼리 토큰도 받는다.
    return bearer === token || url.searchParams.get("token") === token;
  };

  const subscribe = () => {
    if (!options.subscribe || unsubscribe) return;
    unsubscribe = options.subscribe((event) => {
      if (!event) {
        // 실행 중에 온 변경 알림은 하나로 모아 실행이 끝난 뒤 보낸다.
        if (reload.request()) return;
        broadcast("change", {});
        return;
      }
      broadcast("delta", event);
    });
  };

  const readBody = (request: IncomingMessage) =>
    new Promise<string>((resolveBody, rejectBody) => {
      const chunks: Buffer[] = [];
      let size = 0;
      request.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBody) {
          rejectBody(new Error("요청 본문이 너무 커요."));
          request.destroy();
          return;
        }
        chunks.push(chunk);
      });
      request.on("end", () => resolveBody(Buffer.concat(chunks).toString("utf8")));
      request.on("error", rejectBody);
    });

  const events = (request: IncomingMessage, response: ServerResponse) => {
    response.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    response.write("retry: 3000\n\n");
    response.write("event: ready\ndata: {}\n\n");
    clients.add(response);
    subscribe();
    heartbeat ??= setInterval(() => {
      for (const client of clients) write(client, ": ping\n\n");
    }, heartbeatMs);
    heartbeat.unref?.();
    const drop = () => {
      clients.delete(response);
      if (clients.size) return;
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe?.();
      unsubscribe = null;
    };
    request.on("close", drop);
    response.on("close", drop);
    response.on("error", drop);
  };

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://127.0.0.1");
    try {
      if (url.pathname === "/health" && request.method === "GET") {
        json(response, 200, { ok: true, name: "ai-crew", version: "0.1.0" });
        return;
      }
      if (!["/api/snapshot", "/api/action", "/api/events"].includes(url.pathname)) {
        json(response, 404, { error: "없는 경로예요." });
        return;
      }
      if (!authorized(request, url)) {
        response.setHeader("www-authenticate", "Bearer");
        json(response, 401, { error: "토큰이 필요해요." });
        return;
      }
      if (url.pathname === "/api/snapshot") {
        if (request.method !== "GET") {
          json(response, 405, { error: "GET으로 요청해 주세요." });
          return;
        }
        json(response, 200, options.runner.store.snapshot());
        return;
      }
      if (url.pathname === "/api/events") {
        if (request.method !== "GET") {
          json(response, 405, { error: "GET으로 요청해 주세요." });
          return;
        }
        events(request, response);
        return;
      }
      if (request.method !== "POST") {
        json(response, 405, { error: "POST로 요청해 주세요." });
        return;
      }
      let body: unknown;
      try {
        body = JSON.parse(await readBody(request));
      } catch (error) {
        json(response, 400, {
          error:
            error instanceof Error && error.message === "요청 본문이 너무 커요."
              ? error.message
              : "동작을 JSON으로 보내 주세요.",
        });
        return;
      }
      const release = reload.enter();
      try {
        const outcome = await options.runner.run(body, "app");
        json(response, 200, {
          status: outcome.status,
          message: outcome.status === "waiting" ? outcome.message : "적용했어요.",
          state: outcome.snapshot,
          ...(outcome.status === "diagnostics"
            ? { report: outcome.report }
            : {}),
        });
      } catch (error) {
        json(response, 400, {
          error: sanitizeText(
            error instanceof Error ? error.message : String(error),
          ),
        });
      } finally {
        release();
        if (reload.take()) broadcast("change", {});
      }
    } catch (error) {
      if (!response.headersSent)
        json(response, 500, {
          error: sanitizeText(
            error instanceof Error ? error.message : String(error),
          ),
        });
      else response.end();
    }
  });

  await new Promise<void>((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(options.port ?? 0, options.host ?? "127.0.0.1", () => {
      server.off("error", rejectListen);
      resolveListen();
    });
  });
  const address = server.address();
  const port = typeof address === "object" && address ? address.port : 0;

  return {
    server,
    port,
    url: "http://127.0.0.1:" + port,
    token,
    close: async () => {
      for (const client of clients) client.end();
      clients.clear();
      if (heartbeat) clearInterval(heartbeat);
      heartbeat = null;
      unsubscribe?.();
      unsubscribe = null;
      await new Promise<void>((resolveClose) => {
        server.closeAllConnections?.();
        server.close(() => resolveClose());
      });
    },
  };
}
