import { app, BrowserWindow, dialog, ipcMain } from "electron";
import { realpath } from "node:fs/promises";
import { join } from "node:path";
import {
  actions,
  type ChatEvent,
  type Completion,
  type ModelDetails,
} from "./actions";
import { findChatCommand } from "./chat-commands";
import { CodexConnection } from "./codex";
import { classifyModelFailure } from "./model-errors";
import { runLocal } from "./local";
import { CrewMcp } from "./mcp";
import { crewInstructions } from "./crew-definition";
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
  let window: BrowserWindow | null;
  let closing = false;
  const workflow = new CrewWorkflow(store, codex, () => publish(null), mcp);

  function publish(event: ChatEvent | null) {
    if (window && !window.isDestroyed())
      window.webContents.send("crew:update", event);
  }

  async function generate(
    sessionId: string,
    id: string,
    text: string,
    controller: AbortController,
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
    );
    const emit = (delta: string) => {
      if (closing || controller.signal.aborted) return;
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
          mentionsWiki(text)
            ? wikiTools(
                store,
                { projectId: project.id, sessionId, canRead: wiki.length > 0 },
                assistant,
                controller.signal,
                () => publish(null),
              )
            : undefined,
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
      runs.delete(sessionId);
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
      }
    }
  }

  ipcMain.handle("crew:action", async (event, input: unknown) => {
    if (
      !window ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame
    )
      throw new Error("현재 앱 창에서 요청해 주세요.");
    const action = actions.parse(input);
    switch (action.type) {
      case "project.pick": {
        const selected = await dialog.showOpenDialog(window, {
          properties: ["openDirectory"],
          title: "프로젝트 폴더 열기",
        });
        if (!selected.canceled && selected.filePaths[0])
          store.openFolder(await realpath(selected.filePaths[0]));
        break;
      }
      case "project.approval":
        store.setApprovalMode(action.projectId, action.mode);
        break;
      case "project.open":
        store.openProject(action.projectId);
        break;
      case "session.new":
        store.newSession(action.projectId);
        break;
      case "session.open":
        store.openSession(action.sessionId);
        break;
      case "session.draft":
        store.saveDraft(action.sessionId, action.draft);
        break;
      case "crew.member.add":
        store.addMember(action.projectId, {
          id: action.memberId,
          roleId: action.roleId,
          name: action.name,
          provider: action.provider,
        });
        break;
      case "crew.member.update":
        store.updateMember(action.projectId, action.memberId, action);
        break;
      case "crew.workspace.write":
        store.setWorkspaceWrite(
          action.projectId,
          action.memberId,
          action.allow,
        );
        break;
      case "mcp.connect":
        await mcp.connect(
          action.projectId,
          action.serverId,
          action.name,
          action.url,
        );
        break;
      case "mcp.disconnect":
        store.disconnectMcpEndpoint(action.projectId, action.serverId);
        break;
      case "mcp.grant":
        store.setMcpGrant(
          action.projectId,
          action.serverId,
          action.memberId,
          action.toolName,
          action.allow,
        );
        break;
      case "crew.skill.add":
        store.addSkill(action.projectId, {
          id: action.skillId,
          memberId: action.memberId,
          name: action.name,
          markdown: action.markdown,
        });
        break;
      case "crew.skill.remove":
        store.removeSkill(action.projectId, action.memberId, action.skillId);
        break;
      case "memory.add":
        store.saveMemory(action.sessionId, action.body, action.ownerId);
        break;
      case "memory.remove":
        store.removeMemory(action.projectId, action.memoryId);
        break;
      case "wiki.save":
        store.saveWiki(action.sessionId, {
          id: action.pageId, version: action.version, title: action.title,
          body: action.body, links: action.links,
        });
        break;
      case "wiki.remove":
        store.removeWiki(action.projectId, action.pageId, action.version);
        break;
      case "chat.send": {
        const command = findChatCommand(action.text);
        const current = runs.get(action.sessionId);
        if (
          current &&
          current.request !== action.requestId &&
          !command
        )
          throw new Error("이 대화에서 이미 답변을 생성하고 있어요.");
        if (command === "/clear") {
          store.clearSession(action.sessionId, action.requestId);
          break;
        }
        if (
          !store.isHired(
            store.getSession(action.sessionId).projectId,
            "assistant",
          )
        )
          throw new Error("크루에서 비서를 재고용해 주세요.");
        if (
          workflow.routeFollowup(
            action.sessionId,
            action.requestId,
            action.text,
          )
        )
          break;
        const id = store.beginResponse(
          action.sessionId,
          action.requestId,
          action.text,
        );
        if (id) {
          const controller = new AbortController();
          runs.set(action.sessionId, {
            id,
            request: action.requestId,
            controller,
          });
          void generate(action.sessionId, id, action.text, controller);
        }
        break;
      }
      case "job.answer":
        workflow.answer(action.jobId, action.requestId, action.allow);
        break;
      case "job.stop":
        workflow.stop(action.jobId);
        break;
      case "job.resume":
        workflow.resume(action.jobId);
        break;
      case "job.followup.select":
        workflow.selectFollowup(
          action.sessionId,
          action.requestId,
          action.jobId,
        );
        break;
      case "job.revise":
        workflow.revise(
          action.jobId,
          action.sessionId,
          action.requestId,
          action.text,
          action.questionId,
        );
        break;
      case "chat.stop": {
        const run = runs.get(action.sessionId);
        if (run?.id === action.responseId && !run.controller.signal.aborted) {
          store.finish(run.id, "stopping");
          run.controller.abort();
        }
        break;
      }
    }
    return store.snapshot();
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
    codex.close();
    store.close();
  });
  workflow.restoreFollowups();
  await showWindow();
}
