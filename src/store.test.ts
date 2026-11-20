import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { CrewStore } from "./store";

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
          name: "여울",
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
    expect(store.snapshot().modelRuns).toEqual([
      {
        id: 1, jobId: job.id, roleId: "development", provider: "local",
        model: "qwen-test", elapsedMs: 75, inputTokens: 31, outputTokens: 12,
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
    expect(fresh.current?.approvalMode).toBe("always");
    expect(fresh.members).toContainEqual(
      expect.objectContaining({ id: "assistant", provider: "codex" }),
    );
    store.openSession(id);
    expect(store.getMessages(id)).toHaveLength(2);
    expect(store.snapshot().jobs).toContainEqual(
      expect.objectContaining({ id: job.id }),
    );
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
