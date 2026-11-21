import { randomUUID } from "node:crypto";
import { mkdtempSync, realpathSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { wikiTools } from "../../../../src/backend/server/chat/wiki-tools";
import { CrewStore } from "../../../../src/backend/store/store";

async function call(
  tools: ReturnType<typeof wikiTools>,
  name: string,
  input: Record<string, unknown>,
) {
  const entry = tools[name] as unknown as {
    execute: (
      input: unknown,
      options: { toolCallId: string; messages: [] },
    ) => Promise<unknown>;
  };
  return entry.execute(input, { toolCallId: "test", messages: [] });
}

test("에이전트가 남긴 위키는 업무 출처와 함께 쌓이고 다음 작업이 다시 찾는다", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-wiki-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const member = store.readMembers(projectId, "development")[0];
    const job = store.createJob(sessionId, randomUUID(), "실행 방법을 위키에 남겨줘");
    const tools = wikiTools(
      store,
      { projectId, sessionId, jobId: job.id },
      member,
      new AbortController().signal,
    );

    const saved = (await call(tools, "wiki_save", {
      id: null,
      version: 0,
      title: "실행 방법",
      body: "npm test 로 확인\n실패하면 npm run check 부터",
      links: [],
    })) as { id: string; version: number };
    expect(saved.version).toBe(1);
    expect(store.wikiUpdatesForJob(job.id)).toEqual([
      { id: saved.id, title: "실행 방법", version: 1 },
    ]);

    const found = (await call(tools, "wiki_search", { query: "npm" })) as {
      id: string;
      title: string;
    }[];
    expect(found.map(({ id }) => id)).toEqual([saved.id]);
    const read = (await call(tools, "wiki_read", { id: saved.id })) as {
      body: string;
    };
    expect(read.body).toContain("npm test");

    // 다른 작업이 같은 문서를 고쳤다면 옛 버전 번호로 덮어쓰지 않는다.
    const newer = (await call(tools, "wiki_save", {
      id: saved.id,
      version: 1,
      title: "실행 방법",
      body: "npm test 로 확인",
      links: [],
    })) as { version: number };
    expect(newer.version).toBe(2);
    const stale = (await call(tools, "wiki_save", {
      id: saved.id,
      version: 1,
      title: "실행 방법",
      body: "오래된 내용",
      links: [],
    })) as { error: string };
    expect(stale.error).toContain("최신 내용");
    expect(store.readWiki(projectId, saved.id)?.body).toBe("npm test 로 확인");

    // 위키에 없는 문서로 가는 연결은 저장 단계에서 거절한다.
    const missing = (await call(tools, "wiki_save", {
      id: null,
      version: 0,
      title: "연결",
      body: "본문",
      links: [randomUUID()],
    })) as { error: string };
    expect(missing.error).toContain("연결");
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});

test("지금 업무에 배정되지 않은 팀원은 위키를 쓰지 못한다", async () => {
  const folder = realpathSync(mkdtempSync(join(tmpdir(), "crew-wiki-denied-")));
  const store = new CrewStore(join(folder, ".crew.sqlite"));
  try {
    store.openFolder(folder);
    const projectId = store.snapshot().current!.id;
    const sessionId = store.snapshot().session!.id;
    const member = store.readMembers(projectId, "review")[0];
    store.fireMember(projectId, member.id);
    const tools = wikiTools(
      store,
      { projectId, sessionId },
      { ...member, hired: false },
      new AbortController().signal,
    );
    const denied = (await call(tools, "wiki_save", {
      id: null,
      version: 0,
      title: "문서",
      body: "본문",
      links: [],
    })) as { error: string };
    expect(denied.error).toContain("쓰기 권한");
    expect(store.wikiDigest(projectId)).toEqual([]);
  } finally {
    store.close();
    rmSync(folder, { recursive: true, force: true });
  }
});
