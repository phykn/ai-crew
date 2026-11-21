import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";
import { expect, test } from "vitest";
import { CrewStore } from "../../../../src/backend/store/store";
import { WorkflowPanel } from "../../../../src/frontend/ui/panels/workflow";

function renderFlow(data: ReturnType<CrewStore["snapshot"]>) {
  return renderToStaticMarkup(
    <WorkflowPanel
      data={data}
      draft={null}
      setDraft={() => {}}
      run={async () => true}
      error=""
      openJob={() => {}}
    />,
  );
}

test("워크플로우는 캔버스에서 끌어 잇고, 출발·도착을 고르는 폼을 두지 않는다", () => {
  const directory = mkdtempSync(join(tmpdir(), "crew-flow-"));
  const store = new CrewStore(join(directory, "crew.sqlite"));
  try {
    store.openFolder("/work/flow");
    const html = renderFlow(store.snapshot());

    // 캔버스와 마우스 조작 안내가 먼저 보인다.
    expect(html).toContain('class="flow-canvas"');
    expect(html).toContain("react-flow__renderer");
    expect(html).toContain("workflow-legend");
    expect(html).toContain("노드를 끌어 옮기기");
    expect(html).toContain("끌어 잇기");
    // 연결은 핸들끼리 끌어서만 한다. 출발·도착을 고르는 드롭다운 폼은 두지 않는다.
    expect(html).not.toContain("출발 단계");
    expect(html).not.toContain("도착 단계");
    expect(html).not.toContain("stage-form");
    // 단계 속성은 노드를 고른 뒤에만 열린다.
    expect(html).not.toContain("stage-inspector");
    expect(html).toContain("＋ 단계");
    expect(html).toContain("workflow-save");
  } finally {
    store.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
