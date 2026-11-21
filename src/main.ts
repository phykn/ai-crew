import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  actions,
  type ChatEvent,
  type Completion,
  type ModelDetails,
} from "./actions";
import { ActionRunner } from "./app-actions";
import { appTools } from "./app-tools";
import { ChatQueue } from "./chat-queue";
import { findChatCommand } from "./chat-commands";
import { CodexConnection } from "./codex";
import { StopFence } from "./engine-fence";
import { classifyModelFailure } from "./model-errors";
import { runLocal, setLocalConnection } from "./local";
import { CrewMcp } from "./mcp";
import { crewInstructions } from "./crew-definition";
import { StyleWatch } from "./style-watch";
import { CrewStore } from "./store";
import { CrewWorkflow } from "./workflow";
import { mentionsWiki, wikiTools } from "./wiki-tools";

declare const MAIN_WINDOW_VITE_DEV_SERVER_URL: string | undefined;
declare const MAIN_WINDOW_VITE_NAME: string;

if (process.env.AI_CREW_DATA_DIR)
  app.setPath("userData", process.env.AI_CREW_DATA_DIR);

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  void app
    .whenReady()
    .then(startApp)
    .catch((error: unknown) => {
      dialog.showErrorBox(
        "AI Crew를 열 수 없어요",
        error instanceof Error ? error.message : String(error),
      );
      app.quit();
    });
}

async function startApp() {
  const store = new CrewStore(join(app.getPath("userData"), "crew.sqlite"));
  const codex = new CodexConnection();
  const mcp = new CrewMcp(store);
  const runs = new Map<
    string,
    { id: string; request: string; controller: AbortController }
  >();
  /** 멈춘 응답의 세대. 멈춘 뒤 도착하는 스트림 청크를 버린다. */
  const fences = new StopFence();
  const waiting = new ChatQueue();
  let window: BrowserWindow | null;
  let closing = false;
  const workflow = new CrewWorkflow(store, codex, () => publish(null), mcp);
  // 파일이 바뀔 때마다 스타일 감시자에게 알린다. 결과는 채팅 말풍선이 아니라
  // 비서가 다음에 읽는 보고로 쌓인다.
  const styleWatch = new StyleWatch((change) => {
    store.recordStyleReport(change);
    publish(null);
  });

  function publish(event: ChatEvent | null) {
    if (window && !window.isDestroyed())
      window.webContents.send("crew:update", event);
  }

  async function generate(
    sessionId: string,
    id: string,
    text: string,
    controller: AbortController,
    generation: number,
  ) {
    const session = store.getSession(sessionId);
    const project = store.getProject(session.projectId);
    const assistant = store.readMembers(project.id, "assistant")[0];
    const history = store
      .getMessages(sessionId)
      .filter(
        (message) =>
          message.id !== id &&
          message.text &&
          !waiting.requests(sessionId).includes(message.id) &&
          (message.role === "user" ||
            message.state === "complete" ||
            message.state === "stopped"),
      )
      .map(({ role, text: content }) => ({ role, content }));
    let status: Completion = "complete";
    let failure: string | null = null;
    const started = performance.now();
    const details: ModelDetails = {};
    const wiki = store.wikiOutline(project.id);
    const instructions = crewInstructions(
      assistant,
      store.listSkills(project.id),
      store.listMemories(project.id, assistant.id),
      wiki,
      { styleReports: store.takeStyleReports(project.id) },
    );
    const emit = (delta: string) => {
      if (closing || controller.signal.aborted) return;
      if (fences.isStale(id, generation)) return;
      store.append(id, delta);
      publish({ sessionId, responseId: id, delta });
    };

    try {
      if (assistant.provider === "codex") {
        const previous = store.getCodexThread(sessionId);
        const withHistory = () =>
          history.length > 1
            ? "Earlier conversation in this AI Crew session:\n" +
              JSON.stringify(history.slice(0, -1)) +
              "\n\nCurrent request:\n" +
              text
            : text;
        await codex.run(
          project,
          previous,
          instructions + "\n\n" + (previous ? text : withHistory()),
          controller.signal,
          emit,
          (thread) => {
            if (!closing) store.setCodexThread(sessionId, thread);
          },
          undefined,
          () => {
            if (!closing)
              store.log(sessionId, "비서 · 저장한 대화에서 Codex 맥락 복구");
            return instructions + "\n\n" + withHistory();
          },
          undefined,
          details,
        );
      } else {
        if (store.getCodexThread(sessionId))
          store.setCodexThread(sessionId, null);
        await runLocal(
          project,
          history,
          controller.signal,
          emit,
          (event) => {
            if (!closing) store.log(sessionId, event);
          },
          () => workflow.delegate(sessionId, id, text),
          mcp.modelTools(
            { projectId: project.id, sessionId },
            assistant,
            controller.signal,
          ),
          instructions,
          details,
          (body, shared) => {
            controller.signal.throwIfAborted();
            store.saveMemory(sessionId, body, shared ? null : assistant.id, {
              id: assistant.id,
              name: assistant.name,
            });
            publish(null);
          },
          {
            ...appTools(runner),
            ...(mentionsWiki(text)
              ? wikiTools(
                  store,
                  {
                    projectId: project.id,
                    sessionId,
                    canRead: wiki.length > 0,
                  },
                  assistant,
                  controller.signal,
                  () => publish(null),
                )
              : {}),
          },
        );
      }
    } catch (error) {
      const limited =
        !controller.signal.aborted && classifyModelFailure(error) === "limit";
      status = controller.signal.aborted || limited ? "stopped" : "failed";
      if (limited) failure = "비서 모델이 한도에 도달했어요.";
      else if (status === "failed")
        failure = (
          error instanceof Error ? error.message : String(error)
        ).slice(0, 400);
    } finally {
      if (runs.get(sessionId)?.controller === controller) runs.delete(sessionId);
      if (!closing) {
        store.recordModelRun(
          sessionId,
          null,
          assistant,
          performance.now() - started,
          details,
        );
        store.finish(
          id,
          controller.signal.aborted ? "stopped" : status,
          failure,
        );
        publish(null);
        const next = waiting.shift(sessionId);
        if (next) {
          startResponse(sessionId, next);
          publish(null);
        }
      }
    }
  }

  /** 응답 하나를 시작한다. 답변 중에 보낸 메시지는 앞선 답변이 끝난 뒤 여기서 시작한다. */
  function startResponse(
    sessionId: string,
    { responseId, requestId, text }: { responseId: string; requestId: string; text: string },
  ) {
    store.startResponse(responseId);
    const controller = new AbortController();
    runs.set(sessionId, { id: responseId, request: requestId, controller });
    void generate(
      sessionId,
      responseId,
      text,
      controller,
      fences.begin(responseId),
    );
  }

  const applyModelConnections = (
    connections: { provider: string; baseUrl: string | null; model: string | null; enabled: boolean }[],
  ) => {
    const local = connections.find(
      ({ provider, enabled }) => provider === "local" && enabled,
    );
    setLocalConnection(
      local ? { baseUrl: local.baseUrl, model: local.model } : null,
    );
  };
  applyModelConnections(store.listModelConnections());

  const runner = new ActionRunner({
    store,
    workflow,
    mcp,
    applyModelConnections,
    quit: () => app.quit(),
    fileChange: (change) => styleWatch.noteChange(change),
    pickFolder: async () => {
      const selected = await dialog.showOpenDialog(window!, {
        properties: ["openDirectory"],
        title: "프로젝트 폴더 열기",
      });
      return selected.canceled || !selected.filePaths[0]
        ? null
        : await realpath(selected.filePaths[0]);
    },
  });

  runner.attachChat({
    send: (action) => {
      const command = findChatCommand(action.text);
      const current = runs.get(action.sessionId);
      if (current?.request === action.requestId) return;
      if (command === "/clear") {
        // 새 대화를 열면 앞 대화에 쌓인 대기 메시지는 접는다.
        for (const pending of waiting.take(action.sessionId))
          store.finish(pending.responseId, "stopped");
        store.clearSession(action.sessionId, action.requestId);
        return;
      }
      if (
        !store.isHired(
          store.getSession(action.sessionId).projectId,
          "assistant",
        )
      )
        throw new Error("크루에서 비서를 재고용해 주세요.");
      if (current) {
        // 답변 중에 보낸 메시지는 앞선 답변이 끝난 뒤 이어서 답한다.
        const responseId = store.beginResponse(
          action.sessionId,
          action.requestId,
          action.text,
          "queued",
        );
        if (responseId)
          waiting.add(action.sessionId, {
            responseId,
            requestId: action.requestId,
            text: action.text,
          });
        publish(null);
        return;
      }
      if (
        workflow.routeFollowup(
          action.sessionId,
          action.requestId,
          action.text,
        )
      )
        return;
      const id = store.beginResponse(
        action.sessionId,
        action.requestId,
        action.text,
      );
      if (id)
        startResponse(action.sessionId, {
          responseId: id,
          requestId: action.requestId,
          text: action.text,
        });
    },
    stop: (sessionId, responseId) => {
      const run = runs.get(sessionId);
      if (!run || run.id !== responseId || run.controller.signal.aborted) return;
      fences.stop(responseId);
      store.finish(run.id, "stopping");
      run.controller.abort();
      // 멈추면 기다리던 메시지도 함께 접는다.
      for (const pending of waiting.take(sessionId))
        store.finish(pending.responseId, "stopped");
      publish(null);
    },
  });

  ipcMain.handle("crew:action", async (event, input: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("현재 앱 창에서 요청해 주세요.");
    const outcome = await runner.run(input, "ui");
    // 환경 진단은 저장된 상태에 없는 점검 결과를 화면에 함께 돌려준다.
    return outcome.status === "diagnostics"
      ? { ...outcome.snapshot, diagnostics: outcome.report }
      : outcome.snapshot;
  });

  async function showWindow() {
    window = new BrowserWindow({
      title: "AI Crew",
      width: 1320,
      height: 850,
      minWidth: 440,
      minHeight: 540,
      backgroundColor: "#1c1e1a",
      webPreferences: {
        preload: join(__dirname, "preload.cjs"),
        contextIsolation: true,
        sandbox: true,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
    window.webContents.on("will-navigate", (event) => event.preventDefault());
    window.on("closed", () => {
      window = null;
    });
    if (MAIN_WINDOW_VITE_DEV_SERVER_URL)
      await window.loadURL(MAIN_WINDOW_VITE_DEV_SERVER_URL);
    else
      await window.loadFile(
        join(__dirname, "../renderer", MAIN_WINDOW_VITE_NAME, "index.html"),
      );
  }

  app.on("activate", () => {
    if (!window) void showWindow();
  });
  app.on("second-instance", () => window?.focus());
  app.on("window-all-closed", () => {
    if (process.platform !== "darwin") app.quit();
  });
  app.on("before-quit", () => {
    if (closing) return;
    closing = true;
    for (const run of runs.values()) {
      store.finish(run.id, "stopped");
      run.controller.abort();
    }
    workflow.close();
    styleWatch.close();
    codex.close();
    store.close();
  });
  workflow.restoreFollowups();
  await showWindow();
}
