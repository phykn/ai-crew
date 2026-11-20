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
    store.setProvider(current!.id, "assistant", "codex");
    const job = store.createJob(id, response, "파일 수정");
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
      crew: { assistant: "codex" },
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
    const clear = randomUUID();
    store.clearSession(id, clear);
    const fresh = store.snapshot();
    store.clearSession(id, clear);
    expect(store.snapshot().session?.id).toBe(fresh.session?.id);
    expect(fresh.session?.id).not.toBe(id);
    expect(fresh.messages).toEqual([]);
    store.openSession(id);
    expect(store.getMessages(id)).toHaveLength(2);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
