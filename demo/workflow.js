"use strict";

const examples = {
  개발: [
    [1, "플랜", 4, "요청 범위와 검증 가능한 완료 조건을 인계한다."],
    [2, "개발", 1, "기존 코드를 재사용하고 첫 미완료 작업의 변경을 확인한다."],
    [3, "리뷰", 3, "요구사항과 기존 동작을 변경 근거로 대조한다."],
    [
      3,
      "코딩 스타일 확인",
      5,
      "관련 프로젝트 지침으로 이름·중복·가독성을 확인한다.",
    ],
    [3, "테스트", 2, "작은 재현부터 실행해 결과와 미확인 범위를 남긴다."],
  ],
  조사: [
    [1, "질문과 범위 정리", 4, "확인할 질문과 관련 위키 경로를 정한다."],
    [2, "자료 조사", 1, "각 주장에 출처를 연결한다."],
    [3, "근거 검토", 3, "출처와 주장이 일치하는지 확인한다."],
  ],
};
function makeStages(template) {
  return examples[template].map(([order, label, role, criterion]) => ({
    order,
    label,
    role,
    criterion,
    access: template === "개발" && role === 1 ? "파일 수정" : "자료 조회",
  }));
}
function groupStages(stages) {
  const groups = new Map();
  for (const stage of stages) {
    if (!groups.has(stage.order)) groups.set(stage.order, []);
    groups.get(stage.order).push({ ...stage });
  }
  return [...groups.keys()].sort((a, b) => a - b).map((key) => groups.get(key));
}
function editWorkflow() {
  let draft = project.workflow.map((stage) => ({ ...stage }));
  function draw() {
    modal(
      "워크플로우 편집",
      '<p>나 → 비서 → 아래 단계 → 비서 보고<br>같은 순서의 단계는 함께 실행해요.</p><label>시작 예시 <select id="preset"><option value="">현재 설정</option><option>개발</option><option>조사</option></select></label><form id="flow-form">' +
        draft
          .map(
            (stage, i) => `<fieldset class="flow-stage" data-stage="${i}">
    <label>순서 <input type="number" min="1" max="99" required data-field="order" value="${stage.order}"></label>
    <label>단계 <input required data-field="label" value="${safe(stage.label)}"></label>
    <label>담당 <select data-field="role">${project.crew.map((a, k) => `<option value="${k}" ${k === stage.role ? "selected" : ""}>${safe(a.role)}</option>`).join("")}</select></label>
    <label>권한 <select data-field="access">${["자료 조회", "파일 수정", "외부 전달"].map((x) => `<option ${x === stage.access ? "selected" : ""}>${x}</option>`).join("")}</select></label>
    <label class="wide">완료 조건 <input required data-field="criterion" value="${safe(stage.criterion)}"></label>
    <button type="button" data-remove="${i}" class="text-action">단계 제거</button></fieldset>`,
          )
          .join("") +
        '<div class="dialog-actions"><button type="button" class="secondary" id="add-stage">단계 추가</button><button class="primary" type="submit">다음 업무부터 적용</button></div><p role="status" id="flow-status"></p></form>',
    );
    $("#preset").onchange = (e) => {
      if (e.target.value) {
        draft = makeStages(e.target.value);
        draw();
      }
    };
    $("#flow-form").oninput = (e) => {
      const field = e.target.dataset.field;
      if (!field) return;
      draft[Number(e.target.closest("fieldset").dataset.stage)][field] = [
        "order",
        "role",
      ].includes(field)
        ? Number(e.target.value)
        : e.target.value;
    };
    $("#add-stage").onclick = () => {
      draft.push({
        order: Math.max(0, ...draft.map((s) => s.order)) + 1,
        label: "",
        role: 4,
        criterion: "",
        access: "자료 조회",
      });
      draw();
      $('#flow-form fieldset:last-of-type [data-field="label"]').focus();
    };
    document.querySelectorAll("[data-remove]").forEach(
      (b) =>
        (b.onclick = () => {
          draft.splice(+b.dataset.remove, 1);
          draw();
        }),
    );
    $("#flow-form").onsubmit = (e) => {
      e.preventDefault();
      if (
        !draft.length ||
        draft.some((s) => !s.label.trim() || !s.criterion.trim())
      ) {
        $("#flow-status").textContent =
          "단계와 완료 조건을 한 개 이상 입력해 주세요.";
        return;
      }
      if (
        groupStages(draft).some(
          (group) => new Set(group.map((s) => s.role)).size !== group.length,
        )
      ) {
        $("#flow-status").textContent =
          "같은 담당자의 단계는 서로 다른 순서에 두세요.";
        return;
      }
      project.workflow = draft;
      project.version++;
      record(
        current,
        "비서",
        "워크플로우 v" + project.version + " 저장 · 다음 새 업무부터 적용",
      );
      $("#detail").close();
      render();
    };
  }
  draw();
}
function wikiGraph(entries) {
  if (!entries.length) return '<p class="empty">아직 연결할 문서가 없어요.</p>';
  const width = 360,
    height = Math.max(140, Math.ceil(entries.length / 2) * 80 + 40);
  const coords = entries.map((_, i) => [
    i % 2 ? 266 : 92,
    40 + Math.floor(i / 2) * 80 + (i % 2) * 25,
  ]);
  const edges = [];
  entries.forEach((entry, i) =>
    (entry.links || []).forEach((id) => {
      const j = entries.findIndex((x) => x.id === id);
      if (j < 0) return;
      const mx = (coords[i][0] + coords[j][0]) / 2,
        my = (coords[i][1] + coords[j][1]) / 2;
      const rotation =
        (Math.atan2(coords[j][1] - coords[i][1], coords[j][0] - coords[i][0]) *
          180) /
        Math.PI;
      edges.push(
        `<line x1="${coords[i][0]}" y1="${coords[i][1]}" x2="${coords[j][0]}" y2="${coords[j][1]}"/><path d="M-4 -3 L0 0 L-4 3" transform="translate(${mx} ${my}) rotate(${rotation})"/>`,
      );
    }),
  );
  return `<div class="wiki-graph" style="height:${height}px"><svg viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" aria-hidden="true">${edges.join("")}</svg>${entries.map((entry, i) => `<button class="wiki-node" data-memory="${i}" title="${safe(entry.title)}" style="left:${(coords[i][0] / width) * 100}%;top:${coords[i][1]}px">${safe(entry.title)}</button>`).join("")}</div>`;
}
