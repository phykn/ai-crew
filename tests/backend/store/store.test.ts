import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CrewStore } from "../../../src/backend/store/store";

test("keeps projects, conversation, draft and selected model through restart", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-store-"));
  const path = join(directory, "crew.sqlite");
  let store = new CrewStore(path);
  try {
    store.openFolder("/work/test-project");
    const { current, session } = store.snapshot();
    expect(current?.name).toBe("test-project");
    expect(session).not.toBeNull();
    const id = session!.id;
    const request = randomUUID();
    const response = store.beginResponse(id, request, "보존할 질문")!;
    expect(store.beginResponse(id, request, "보존할 질문")).toBeNull();
    store.append(response, "여기까지 답변");
    store.saveDraft(id, "전송하지 않은 초안");
    store.updateMember(current!.id, "assistant", { provider: "codex" });
    const member = {
      id: randomUUID(),
      roleId: "review",
      name: "보조 리뷰",
      provider: "local",
    } as const;
    store.addMember(current!.id, member);
    store.addMember(current!.id, member);
    store.updateMember(current!.id, member.id, { name: "보조 리뷰 팀원" });
    store.updateMember(current!.id, member.id, { hired: false });
    store.updateMember(current!.id, member.id, { hired: false });
    const job = store.createJob(id, response, "파일 수정");
    store.saveMemory(id, "개발 담당 확인 코드", "development", {
      id: "development", name: "태오", jobId: job.id,
    });
    store.saveMemory(id, "공통 확인 코드", null);
    store.recordModelRun(id, job.id, { roleId: "development", provider: "local" }, 75.48, {
      model: "qwen-test", inputTokens: 31, outputTokens: 12,
    });
    store.saveAgentContext(
      job.id,
      "development",
      "codex-thread",
      '{"content":"answer"}',
    );
    store.close();

    store = new CrewStore(path);
    expect(store.snapshot()).toMatchObject({
      current: { id: current!.id },
      session: { id, title: "보존할 질문", draft: "전송하지 않은 초안" },
      members: expect.arrayContaining([
        {
          id: "assistant",
          roleId: "assistant",
          provider: "codex",
          name: "하나",
          hired: true,
        },
      ]),
      messages: [
        { text: "보존할 질문", state: "complete" },
        { text: "여기까지 답변", state: "stopped" },
      ],
    });
    expect(store.getAgentContext(job.id, "development")).toEqual({
      threadId: "codex-thread",
      result: '{"content":"answer"}',
    });
    expect(store.getAgentContext(job.id, "review")).toBeUndefined();
    expect(store.listMemories(current!.id, "assistant").map(({ body }) => body)).toEqual(["공통 확인 코드"]);
    const [shared, own] = store.listMemories(current!.id, "development");
    expect(own).toMatchObject({ ownerId: "development", authorName: "태오", sourceJobId: job.id, body: "개발 담당 확인 코드" });
    expect(shared.body).toBe("공통 확인 코드");
    expect(store.snapshot().modelRuns).toEqual([
      {
        id: 1, jobId: job.id, roleId: "development", provider: "local",
        model: "qwen-test", elapsedMs: 75, inputTokens: 31, outputTokens: 12,
        costUsd: null,
      },
    ]);
    expect(store.readMembers(current!.id, "review")).toContainEqual({
      ...member,
      name: "보조 리뷰 팀원",
      hired: false,
    });
    expect(
      store.snapshot().activity.filter(({ text }) => text.endsWith("미고용")),
    ).toHaveLength(1);
    store.openFolder("/work/another-project");
    expect(store.snapshot().modelRuns).toEqual([]);
    expect(store.snapshot().memories).toEqual([]);
    store.removeMemory(store.snapshot().current!.id, own.id);
    expect(store.listMemories(current!.id, "development")).toHaveLength(2);
    expect(() =>
      store.updateMember(store.snapshot().current!.id, member.id, {
        hired: true,
      }),
    ).toThrow();
    expect(() =>
      store.addMember(store.snapshot().current!.id, member),
    ).toThrow();
    store.openSession(id);
    store.setApprovalMode(current!.id, "always");
    const clear = randomUUID();
    store.clearSession(id, clear);
    const fresh = store.snapshot();
    store.clearSession(id, clear);
    expect(store.snapshot().session?.id).toBe(fresh.session?.id);
    expect(fresh.session?.id).not.toBe(id);
    expect(fresh.messages).toEqual([]);
    expect(fresh.jobs).toEqual([]);
    expect(fresh.modelRuns).toEqual([]);
    expect(fresh.memories).toHaveLength(2);
    expect(fresh.current?.approvalMode).toBe("always");
    expect(fresh.members).toContainEqual(
      expect.objectContaining({ id: "assistant", provider: "codex" }),
    );
    store.openSession(id);
    expect(store.getMessages(id)).toHaveLength(2);
    store.removeMemory(current!.id, own.id);
    expect(store.listMemories(current!.id, "development")).toEqual([shared]);
    expect(store.snapshot().jobs).toContainEqual(
      expect.objectContaining({ id: job.id }),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("versions project wiki pages, rejects stale edits, and keeps links by ID", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-wiki-"));
  const path = join(directory, "crew.sqlite");
  let store = new CrewStore(path);
  try {
    store.openFolder("/work/wiki-test");
    const { current, session } = store.snapshot();
    const methods = { id: randomUUID(), title: "테스트 방법", body: "첫 테스트 규칙", links: [], version: 0 };
    const overview = { id: randomUUID(), title: "개요", body: "테스트 방법 참조", links: [methods.id], version: 0 };
    store.saveWiki(session!.id, methods, { name: "테스트 담당" });
    store.saveWiki(session!.id, overview);
    store.saveWiki(session!.id, { ...methods, title: "테스트 실행", body: "첫 테스트 규칙\n실행 명령 npm test", version: 1 }, { name: "개발 담당" });
    expect(() => store.saveWiki(session!.id, { ...methods, body: "오래된 내용", version: 1 })).toThrow("최신 내용");
    store.close();
    store = new CrewStore(path);
    const pages = store.snapshot().wiki;
    expect(pages.find(({ id }) => id === overview.id)?.links).toEqual([methods.id]);
    expect(pages.find(({ id }) => id === methods.id)).toMatchObject({
      title: "테스트 실행", version: 2,
      revisions: [
        { body: "첫 테스트 규칙\n실행 명령 npm test", authorName: "개발 담당" },
        { body: "첫 테스트 규칙", authorName: "테스트 담당" },
      ],
    });
    store.openFolder("/work/unrelated");
    const other = store.snapshot();
    expect(other.wiki).toEqual([]);
    expect(() => store.saveWiki(other.session!.id, { ...overview, id: randomUUID() })).toThrow("현재 프로젝트");
    store.removeWiki(current!.id, methods.id, 2);
    expect(store.listWiki(current!.id).map(({ id, links }) => ({ id, links }))).toEqual([{ id: overview.id, links: [] }]);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
