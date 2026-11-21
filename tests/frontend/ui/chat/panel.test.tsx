import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Snapshot } from "../../../../src/shared/actions";
import { ChatPanel } from "../../../../src/frontend/ui/chat/panel";
import { CrewStore } from "../../../../src/backend/store/store";

function renderChat(
  data: Snapshot,
  patch: Partial<ComponentProps<typeof ChatPanel>> = {},
) {
  return renderToStaticMarkup(
    <ChatPanel
      data={data}
      running={undefined}
      approval={data.jobs.find(({ state }) => state === "approval")}
      approvalEvent={data.fileApprovals[0]}
      pendingTools={[]}
      toolApproval={undefined}
      followup={undefined}
      firstQuestion={data.jobs.find((job) => job.clarification)}
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
      {...patch}
    />,
  );
}

test("renders markdown bubbles, the live banner and one decision card", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-view");
    const sessionId = store.snapshot().session!.id;
    const request = randomUUID();
    const response = store.beginResponse(sessionId, request, "고쳐줘")!;
    store.append(
      response,
      "## 결과\n\n**완료**했어요. `npm test`\n\n```ts\nconst a = 1;\n```\n\n- 하나\n- 둘",
    );
    store.finish(response, "complete");
    const job = store.createJob(sessionId, request, "고쳐줘");
    const plan = {
      path: "src/a.ts",
      goal: "파일 고치기",
      criterion: "테스트 통과",
      baseline: "old",
    };
    const planId = store.proposeWorkPlan(job, plan);
    store.reviewWorkPlan(job, planId, true, "좋아요");
    store.recordJob(
      store.getJob(job.id),
      "approval",
      "승인 대기",
      plan,
      planId,
      undefined,
      { mode: "manual" },
    );
    const data = store.snapshot();
    const html = renderChat(data, {
      followup: {
        id: randomUUID(),
        text: "고쳐줘 (보충)",
        candidateIds: [job.id],
      },
      composeText: "/",
      commandSuggestions: [
        ["/clear", "같은 프로젝트에서 빈 대화를 시작해요."],
      ],
    });
    // 말풍선은 마크다운으로, 복사 버튼과 언어 라벨을 갖춘 코드 블록으로 그린다.
    expect(html).toContain("<h2>결과</h2>");
    expect(html).toContain("<strong>완료</strong>");
    expect(html).toContain('class="md-code"');
    expect(html).toContain(">ts</span>");
    expect(html).toContain("bubble-copy");
    // 상단 배너는 진행 업무와 대기 알림을 함께 보여 준다.
    expect(html).toContain('class="chat-status"');
    expect(html).toContain("하나 승인 대기");
    expect(html).toContain("chat-status-wait");
    // 업무가 한 건이면 배너 한 줄로 끝내고 업무 목록은 그리지 않는다.
    expect(html).not.toContain('class="current-jobs"');
    // 결정 카드는 한 장만 그리고 나머지는 대기 건수로 알린다.
    expect(html.split('class="decision-body"')).toHaveLength(2);
    expect(html).toContain("권한 승인");
    expect(html).toContain("대기 +1건");
    expect(html).toContain("다음 ›");
    // 슬래시 명령 목록은 키보드로 고를 수 있게 첫 항목을 선택해 둔다.
    expect(html).toContain('role="group"');
    expect(html).toContain('aria-current="true"');
    // 아래에 붙어 있을 때는 '맨 아래로' 버튼을 그리지 않는다.
    expect(html).not.toContain("맨 아래로");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("keeps a single running job's stop button in the banner", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-single-job");
    const sessionId = store.snapshot().session!.id;
    store.createJob(sessionId, randomUUID(), "화면을 고쳐줘");
    const html = renderChat(store.snapshot());
    // 한 건짜리 업무는 배너 안에 멈춤 버튼만 붙어 세로 공간을 두 줄 쓰지 않는다.
    expect(html).toContain('class="chat-status"');
    expect(html).toContain("화면을 고쳐줘");
    expect(html).toContain('class="chat-status-actions"');
    expect(html.split(">멈춤<")).toHaveLength(2);
    expect(html).not.toContain('class="current-jobs"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("lists every job once more than one is running", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-two-jobs");
    const sessionId = store.snapshot().session!.id;
    store.createJob(sessionId, randomUUID(), "화면을 고쳐줘");
    const stopped = store.createJob(sessionId, randomUUID(), "문서를 고쳐줘");
    store.recordJob(store.getJob(stopped.id), "stopped", "사용자가 멈춤");
    const html = renderChat(store.snapshot());
    // 여러 건이면 업무마다 한 줄씩 목록으로 보여 주고 배너에는 버튼을 두지 않는다.
    expect(html).toContain('class="current-jobs"');
    expect(html.split('class="job"')).toHaveLength(3);
    expect(html).toContain(">멈춤<");
    expect(html).toContain(">이어가기<");
    expect(html).not.toContain('class="chat-status-actions"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shows waiting messages above the input as numbered chips", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-queue");
    const sessionId = store.snapshot().session!.id;
    const first = store.beginResponse(sessionId, randomUUID(), "먼저 물어본 일")!;
    store.append(first, "차례대로 답하는 중");
    store.beginResponse(sessionId, randomUUID(), "보탠 일 하나", "queued");
    store.beginResponse(sessionId, randomUUID(), "보탠 일 둘", "queued");
    const html = renderChat(store.snapshot());
    // 대기열은 입력창 위에 붙고, 칩마다 순서와 빼기 버튼을 갖는다.
    const strip = html.indexOf('class="queue-strip"');
    expect(strip).toBeGreaterThan(-1);
    expect(strip).toBeLessThan(html.indexOf("<textarea"));
    expect(html).toContain('class="queue-count"');
    expect(html).toContain("보탠 일 하나");
    expect(html).toContain("보탠 일 둘");
    expect(html).toContain('class="queue-order"');
    expect(html.split('class="queue-cancel"')).toHaveLength(3);
    expect(html).toContain("대기열 2번째 메시지 대기열에서 빼기");
    // 무엇이 대기열에 들어갔는지 스크린리더에도 알린다.
    expect(html).toContain('aria-live="polite"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the composer bar keeps folder and approval left, send right", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-bar");
    const html = renderChat(store.snapshot());
    // 단축키는 실제 동작과 같은 문장으로 입력창과 아래 안내에 적는다.
    expect(html).toContain(
      "(Enter 전송 · Ctrl+Enter 대기열 · Shift+Enter 줄바꿈)",
    );
    expect(html).toContain('class="compose-hint"');
    // 입력 영역은 카드 하나, 컨트롤은 왼쪽·오른쪽 두 묶음이다.
    expect(html).toContain('class="compose-card"');
    const left = html.indexOf('class="compose-left"');
    const right = html.indexOf('class="compose-actions"');
    expect(left).toBeGreaterThan(-1);
    expect(right).toBeGreaterThan(left);
    // 폴더 팻말과 승인 모드는 왼쪽, 보내기는 오른쪽에 있다.
    expect(html.indexOf('class="folder project-toggle"')).toBeGreaterThan(left);
    expect(html.indexOf('class="approval-pill"')).toBeGreaterThan(left);
    expect(html.indexOf('class="icon-button send"')).toBeGreaterThan(right);
    // 승인 모드는 긴 select 대신 아이콘과 짧은 라벨이 붙은 알약이다.
    expect(html).toContain('class="approval-text"');
    expect(html).toContain('aria-label="승인 모드"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("shows attached pictures above the composer and inside the sent bubble", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-chat-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/chat-images");
    const sessionId = store.snapshot().session!.id;
    const png = {
      name: "screen.png",
      mediaType: "image/png" as const,
      data: Buffer.from([0x89, 0x50, 0x4e, 0x47]).toString("base64"),
    };
    // 그림만 보낸 메시지도 말풍선에 남는다.
    store.beginResponse(sessionId, randomUUID(), "", "running", [png]);
    const html = renderChat(store.snapshot(), {
      attachments: [
        {
          id: "preview-1",
          name: "붙이기전.png",
          mediaType: "image/png",
          data: png.data,
          byteSize: 2048,
          preview: "data:image/png;base64," + png.data,
        },
      ],
      composeText: "",
    });
    // 붙이는 버튼은 왼쪽 컨트롤 바에 있다.
    expect(html).toContain('class="icon-button attach"');
    expect(html).toContain("그림 붙이기");
    // 보내기 전 그림은 입력창 위에 썸네일과 빼기 버튼으로 보인다.
    expect(html).toContain('aria-label="붙인 그림"');
    expect(html).toContain('src="data:image/png;base64,' + png.data + '"');
    expect(html).toContain('aria-label="붙이기전.png 빼기"');
    expect(html).toContain("2KB");
    // 보낸 그림은 말풍선 안에서 파일 이름으로 보인다(바이트는 메인에서 따로 받는다).
    expect(html).toContain('class="bubble-images"');
    expect(html).toContain("screen.png");
    // 그림이 붙어 있으면 글 없이도 보내기가 열린다. 글이 없고 그림도 없을 때만 잠긴다.
    expect(html).not.toMatch(/class="icon-button send"[^>]*disabled/);
    const empty = renderChat(store.snapshot(), { composeText: "" });
    expect(empty).toMatch(/class="icon-button send"[^>]*disabled/);
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
