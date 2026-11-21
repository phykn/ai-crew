import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { ChatPanel } from "../../../../src/frontend/ui/chat/panel";
import { DiagnosticsBanner } from "../../../../src/frontend/ui/panels/diagnostics-banner";
import type { DiagnosticsReport } from "../../../../src/backend/server/diagnostics/run";
import { CrewStore } from "../../../../src/backend/store/store";

function renderChat(data: ReturnType<CrewStore["snapshot"]>) {
  return renderToStaticMarkup(
    <ChatPanel
      data={data}
      running={data.messages.find(({ state }) => state === "running")}
      approval={undefined}
      approvalEvent={undefined}
      pendingTools={[]}
      toolApproval={undefined}
      followup={undefined}
      firstQuestion={undefined}
      revision={null}
      setRevision={() => {}}
      revisionJob={undefined}
      sending={false}
      composeText=""
      attachments={[]}
      setAttachments={() => {}}
      commandSuggestions={[]}
      error=""
      showCamp={false}
      setShowCamp={() => {}}
      messages={createRef<HTMLDivElement>()}
      following={{ current: true }}
      composer={createRef<HTMLTextAreaElement>()}
      saveDraft={() => {}}
      setCommandsDismissed={() => {}}
      send={async () => {}}
      navigate={async () => {}}
      run={async () => true}
      openLog={() => {}}
      setToolFocus={() => {}}
      setFocusedApprovalId={() => {}}
    />,
  );
}

test("an empty conversation offers short tasks instead of a chat greeting", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-tasks-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/quick-tasks");
    const html = renderChat(store.snapshot());
    expect(html).toContain("무엇을 맡길까요?");
    expect(html).toContain('class="quick-tasks"');
    for (const label of ["구조 파악", "버그 점검", "테스트 확인", "변경 리뷰"]) {
      expect(html).toContain(label);
    }
    // 칩은 입력창에 채울 요청 문장을 함께 들고 있는다.
    expect(html).toContain("이 프로젝트 구조를 파악해서");
    expect(html).toContain('class="icon"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("a waiting answer shows a crew sprite and a state badge, not a chat line", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-pending-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/pending");
    const sessionId = store.snapshot().session!.id;
    store.beginResponse(sessionId, randomUUID(), "배경을 바꿔줘");
    const html = renderChat(store.snapshot());
    expect(html).toContain('class="bubble-pending"');
    // 기다리는 동안 크루의 픽셀아트 초상이 보인다.
    expect(html).toMatch(/bubble-pending[\s\S]*?<img src="[^"]*portrait-0\.webp"/);
    expect(html).toContain("진행 중");
    expect(html).not.toContain("답변을 준비하고 있어요");
    expect(html).not.toContain("앞선 답변 뒤에 이어서");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the diagnostics banner marks each check green or red", () => {
  const report: DiagnosticsReport = {
    ok: false,
    checkedAt: "2026-11-21T00:00:00.000Z",
    checks: [
      { id: "git", label: "Git 저장소", ok: true, detail: "main @ f42a810" },
      { id: "codex", label: "Codex CLI", ok: true, detail: "/usr/bin/codex" },
      {
        id: "local-model",
        label: "로컬 모델",
        ok: false,
        detail: "연결 실패",
      },
      { id: "mcp", label: "MCP 서버", ok: true, detail: "연결한 서버 없음" },
    ],
  };
  const html = renderToStaticMarkup(
    <DiagnosticsBanner
      report={report}
      running={false}
      rerun={() => {}}
      close={() => {}}
    />,
  );
  expect(html).toContain('class="diagnostics"');
  expect(html).toContain("확인 필요 1건");
  expect(html).toContain('class="diagnostics-checks"');
  expect(html).toContain(">Git<");
  expect(html).toContain(">Codex<");
  expect(html).toContain(">모델<");
  expect(html).toContain(">MCP<");
  expect(html).toContain('class="ok"');
  expect(html).toContain('class="bad"');
  expect(html).toContain("실패: 연결 실패");
  expect(html).toContain("진단 다시 실행");
});
