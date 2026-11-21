import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createRef } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CampPanel } from "./camp-panel";
import { ChatPanel } from "./chat-panel";
import { isWalkable } from "./camp-behavior";
import { CrewStore } from "../store/store";

function renderCamp(data: ReturnType<CrewStore["snapshot"]>) {
  return renderToStaticMarkup(
    <CampPanel
      data={data}
      running={undefined}
      legend={false}
      error=""
      setError={() => {}}
      patchView={() => {}}
      run={async () => true}
      editingMember={null}
      setEditingMember={() => {}}
      addingMember={false}
      setAddingMember={() => {}}
      settingsMember={null}
      setSettingsMember={() => {}}
      focusSkill={null}
      setFocusSkill={() => {}}
      skillPreview={null}
      setSkillPreview={() => {}}
      setLogJob={() => {}}
      setView={() => {}}
      setToolFocus={() => {}}
      setMemoryOwner={() => {}}
      setMemorySection={() => {}}
      setShowCamp={() => {}}
    />,
  );
}

test("the camp draws the crew on walkable ground with seats, signs and bubbles", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-camp-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/camp");
    const data = store.snapshot();
    const html = renderCamp(data);

    // 배경 위에 오브젝트 레이어와 캐릭터 레이어가 함께 있다.
    expect(html).toContain('class="camp-stage"');
    expect(html).toContain("camp-object campfire");
    expect(html).toContain("camp-object workbench");
    expect(html).toContain("camp-object lantern");
    // 통나무 의자 6개가 각각 만질 수 있는 오브젝트로 올라간다.
    expect(html.match(/camp-object seat/g)?.length).toBe(6);
    // 캐릭터마다 이름표와 말풍선 자리가 있고, 고용된 크루는 앉아 있거나 서 있다.
    expect(html).toContain('class="character-bubble"');
    expect(html).toContain("is-sitting");
    expect(html).toContain('data-facing="right"');

    // 그려진 캐릭터 좌표는 모두 걸을 수 있는 땅이다.
    const spots = [
      ...html.matchAll(
        /class="character[^"]*"[^>]*style="[^"]*left:([\d.]+)%;top:([\d.]+)%/g,
      ),
    ];
    expect(spots.length).toBeGreaterThanOrEqual(9);
    for (const [, x, y] of spots) {
      expect(isWalkable({ x: Number(x), y: Number(y) })).toBe(true);
    }
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

test("the project folder sits by the composer, not in the toolbar", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-picker-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/picker");
    const data = store.snapshot();
    const html = renderToStaticMarkup(
      <ChatPanelForPicker data={data} />,
    );
    const tools = html.indexOf('class="compose-tools"');
    const picker = html.indexOf('aria-label="프로젝트 폴더"');
    expect(tools).toBeGreaterThan(-1);
    expect(picker).toBeGreaterThan(tools);
    expect(html).toContain('class="folder project-toggle"');
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});

function ChatPanelForPicker({
  data,
}: {
  data: ReturnType<CrewStore["snapshot"]>;
}) {
  return (
    <ChatPanel
      data={data}
      running={undefined}
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
    />
  );
}
