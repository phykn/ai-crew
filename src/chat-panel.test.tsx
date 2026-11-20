import { randomUUID } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRef, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import type { Snapshot } from "./actions";
import { ChatPanel } from "./chat-panel";
import { CrewStore } from "./store";

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
    expect(html).toContain("여울 · 승인 대기");
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
