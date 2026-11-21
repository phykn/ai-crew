import {
  chmodSync,
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

const search = `export function search(items, term) {
  if (!term) return [];
  return items.filter((item) => item.includes(term));
}
`;

function fakeCodex(directory: string) {
  const executable = join(directory, "fake-codex");
  writeFileSync(
    executable,
    `#!${process.execPath}
const readline = require("node:readline");
let threadId = "thread-1";
readline.createInterface({ input: process.stdin }).on("line", (line) => {
  const message = JSON.parse(line);
  if (message.id === undefined) return;
  const send = (result) => process.stdout.write(JSON.stringify({ id: message.id, result }) + "\\n");
  const notify = (method, params) => process.stdout.write(JSON.stringify({ method, params }) + "\\n");
  switch (message.method) {
    case "initialize": return send({});
    case "thread/start": return send({ thread: { id: threadId }, model: "codex-test" });
    case "thread/resume": return send({ thread: { id: message.params.threadId }, model: "codex-test" });
    case "thread/turns/list": return send({ data: [] });
    case "turn/start": {
      const turnId = "turn-" + Math.random().toString(36).slice(2, 8);
      send({ turn: { id: turnId, status: "inProgress" } });
      setTimeout(() => {
        notify("item/agentMessage/delta", {
          threadId: message.params.threadId,
          turnId,
          delta: process.env.CREW_TEST_CODEX_OUTPUT || "{}",
        });
        notify("turn/completed", {
          threadId: message.params.threadId,
          turn: { id: turnId, status: "completed" },
        });
      }, 5);
      return;
    }
    default: return send({});
  }
});
`,
  );
  chmodSync(executable, 0o755);
  return executable;
}

test(
  "a request runs plan handoff, three checks, a test failure and a recheck, then resumes after restart",
  async () => {
    const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-flow-")));
    const executable = fakeCodex(folder);
    const previous = {
      bin: process.env.AI_CREW_CODEX_BIN,
      output: process.env.CREW_TEST_CODEX_OUTPUT,
    };
    process.env.AI_CREW_CODEX_BIN = executable;
    process.env.CREW_TEST_CODEX_OUTPUT = JSON.stringify({
      specialist: { specialty: "", permanent: false },
      paths: ["search.js"],
      moves: [],
      directories: [],
      goal: "빈 검색어는 전체 목록",
      criterion: "빈 검색어일 때 모든 항목이 나온다",
    });
    writeFileSync(join(folder, "search.js"), search);
    const database = join(mkdtempSync(join(tmpdir(), "crew-db-")), "crew.sqlite");
    let store = new CrewStore(database);
    try {
      store.openFolder(folder);
      const projectId = store.snapshot().current!.id;
      const sessionId = store.snapshot().session!.id;
      const planMember = store.readMembers(projectId, "assistant")[0];
      store.updateMember(projectId, planMember.id, { provider: "codex" });

      let attempts = 0;
      let phase2 = false;
      vi.mocked(decideLocal).mockImplementation(async (system, prompt) => {
        if (system.startsWith("Review the proposed"))
          return { passed: true, note: "범위가 요청과 맞아요." };
        if (system.startsWith("Implement only")) {
          attempts++;
          if (phase2)
            return {
              content: search
                .replace("if (!term) return [];", "if (!term) return items;")
                .replace("export function search", "// 2026-11 개선\nexport function search"),
              ending: "preserve",
              consult: "none",
              question: "",
            };
          if (attempts === 1)
            return {
              content: search.replace(
                "  if (!term) return [];",
                "  // 빈 검색어 처리\n  if (!term) return [];",
              ),
              ending: "preserve",
              consult: "none",
              question: "",
            };
          expect(prompt).toContain("기대 결과와 달라요");
          return {
            content: search.replace("if (!term) return [];", "if (!term) return items;"),
            ending: "preserve",
            consult: "none",
            question: "",
          };
        }
        if (system.startsWith("Choose an independent"))
          return {
            kind: "text",
            expected: "if (!term) return items;",
            exact: false,
            ending: "as-written",
            reason: "",
          };
        return { passed: true, note: "확인했어요." };
      });

      const workflow = new CrewWorkflow(store, new CodexConnection(), () => {});
      const { id } = workflow.delegate(
        sessionId,
        crypto.randomUUID(),
        "빈 검색어는 전체 목록을 보여주게 바꿔줘",
      );
      await vi.waitFor(() => expect(store.getJob(id).state).toBe("approval"), {
        timeout: 15_000,
      });
      expect(store.getJob(id).plan?.goal).toBe("빈 검색어는 전체 목록");
      expect(store.snapshot().activity.map(({ text }) => text)).toEqual(
        expect.arrayContaining([
          expect.stringContaining("비서 → 계획 · 사용자 요청 인계"),
          expect.stringContaining("계획 → 비서 · search.js"),
        ]),
      );
      workflow.answer(id, store.getJob(id).approvalId!, true);
      await vi.waitFor(() => expect(store.getJob(id).state).toBe("complete"), {
        timeout: 20_000,
      });

      expect(readFileSync(join(folder, "search.js"), "utf8")).toContain(
        "if (!term) return items;",
      );
      const activity = store.snapshot().activity.map(({ text }) => text);
      expect(activity).toEqual(
        expect.arrayContaining([
          expect.stringContaining("수정 및 재검증 1/3"),
          expect.stringContaining("리뷰 ·"),
          expect.stringContaining("스타일 ·"),
          expect.stringContaining("테스트 ·"),
        ]),
      );
      const changes = store.readChanges(sessionId);
      expect(changes).toHaveLength(2);
      const [change, failed] = changes;
      expect(change.checks.map(({ label }) => label)).toEqual([
        "리뷰",
        "스타일",
        "테스트",
      ]);
      expect(change.checks.every(({ passed }) => passed)).toBe(true);
      expect(change.afterHash).not.toBe(failed.afterHash);
      expect(failed.checks.some(({ passed }) => !passed)).toBe(true);
      expect(
        failed.checks.find(({ label }) => label === "테스트")?.note,
      ).toContain("기대 결과와 달라요");
      const providers = new Set(
        store.snapshot().modelRuns.map(({ provider }) => provider),
      );
      expect(providers).toEqual(new Set(["codex", "local"]));
      const report = store
        .snapshot()
        .messages.find(
          (message) => message.role === "assistant" && message.jobId === id,
        );
      expect(report?.text).toContain("search.js");
      expect(store.snapshot().artifacts[0]).toMatchObject({
        jobId: id,
        path: "search.js",
      });

      const second = workflow.delegate(
        sessionId,
        crypto.randomUUID(),
        "빈 검색어는 전체 목록을 보여주게 바꿔줘",
      );
      await vi.waitFor(
        () => expect(store.getJob(second.id).state).toBe("approval"),
        { timeout: 15_000 },
      );
      workflow.stop(second.id);
      expect(store.getJob(second.id).state).toBe("stopped");
      store.close();

      store = new CrewStore(database);
      store.openFolder(folder);
      const restored = store.snapshot();
      expect(restored.jobs.find(({ id: jobId }) => jobId === id)?.state).toBe(
        "complete",
      );
      expect(restored.jobs.find(({ id: jobId }) => jobId === second.id)?.state).toBe(
        "stopped",
      );
      expect(restored.changes[0].checks).toHaveLength(3);
      expect(store.listArtifacts(restored.current!.id)).toHaveLength(2);
      expect(store.listArtifacts(restored.current!.id)[0]).toMatchObject({
        jobId: id,
        path: "search.js",
      });

      const resumed = new CrewWorkflow(store, new CodexConnection(), () => {});
      phase2 = true;
      resumed.resume(second.id);
      await vi.waitFor(
        () => expect(store.getJob(second.id).state).toBe("approval"),
        { timeout: 15_000 },
      );
      resumed.answer(second.id, store.getJob(second.id).approvalId!, true);
      await vi.waitFor(() => expect(store.getJob(second.id).state).toBe("complete"), {
        timeout: 20_000,
      });
      const reports = store
        .getMessages(sessionId)
        .filter(
          (message) => message.jobId === second.id && message.role === "assistant",
        );
      expect(reports.map(({ text }) => text)).toEqual(
        expect.arrayContaining([expect.stringContaining("업무를 멈췄어요")]),
      );
      expect(reports.at(-1)?.text).toContain("search.js");
    } finally {
      store.close();
      if (previous.bin) process.env.AI_CREW_CODEX_BIN = previous.bin;
      else delete process.env.AI_CREW_CODEX_BIN;
      if (previous.output) process.env.CREW_TEST_CODEX_OUTPUT = previous.output;
      else delete process.env.CREW_TEST_CODEX_OUTPUT;
      rmSync(folder, { recursive: true, force: true });
    }
  },
  60_000,
);
