"use strict";

const $ = (selector) => document.querySelector(selector);
const paths = {
  fire: "M13 2c1 6-4 7-2 11 2-1 3-3 3-6 4 3 6 6 5 10-1 4-5 6-9 5-5-1-7-5-6-9 1-2 2-4 4-6 3-10Z",
  flow: "M3 9h5v5H3z M16 2h5v5h-5z M16 17h5v5h-5z M8 11.5h4V4.5h4m-4 7v8h4",
  menu: "M3 6h18M3 12h18M3 18h18",
  folder: "M3 7V5h6l2 2h10v12H3Z",
  down: "m6 9 6 6 6-6",
  users:
    "M16 21v-2a5 5 0 0 0-10 0v2M11 5a3.5 3.5 0 1 0 .1 0M18 8a3 3 0 0 1 0 6m1 2c2 1 3 3 3 5",
  chat: "M3 4h18v13H9l-5 4v-4H3Z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1",
  book: "M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 1v13",
  close: "m6 6 12 12m0-12L6 18",
  send: "m3 11 18-8-7 18-3-8-8-2Zm8 2 10-10",
  stop: "M5 5h14v14H5Z",
  pen: "m4 16 12-12 4 4L8 20l-5 1Z",
  code: "m7 7-5 5 5 5m10-10 5 5-5 5m-3-15-4 20",
  shield: "m12 2 8 4v6c0 4-4 8-8 10-4-2-8-6-8-10V6Zm-4 10 3 3 5-6",
  check: "m3 12 5 5L21 4",
};
const icon = (name) =>
  `<span data-icon="${name}"><svg aria-hidden="true" viewBox="0 0 24 24"><path d="${paths[name]}"/></svg></span>`;
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
const painted = new WeakMap();
function paint(element, markup) {
  if (painted.get(element) === markup) return;
  element.innerHTML = markup;
  painted.set(element, markup);
}

const draft = $("#draft");
const messages = $("#messages");
const tasks = $("#tasks");
const decision = $("#decision");
const sessionList = $("#session-list");
const sessionButton = $("#session-open");
const roster = $("#roster-body");
const mobileSwitch = $("#mobile-switch");
const popover = $("#composer-menu");
const detail = $("#detail");
const model = createDemo((session) => {
  if (session.project === project) render();
});
let project = model.example;
let current = project.lastSession;
let tab = "chat";
let logJob = null;
let editor = null;
let popoverSource = null;
let campBeat = 0;
let stopTarget = null;
let pressedStopTarget = null;

for (const span of document.querySelectorAll("[data-icon]")) {
  span.outerHTML = icon(span.dataset.icon);
}

function showTab(name, job = null) {
  const previousTab = tab;
  if (previousTab === "chat" && name !== "chat")
    current.readPosition = messages.scrollTop;
  tab = name;
  logJob = job;
  sessionList.hidden = true;
  sessionButton.setAttribute("aria-expanded", "false");
  if (popover.matches(":popover-open")) popover.hidePopover();
  toggleCamp(false);
  for (const button of document.querySelectorAll("[data-tab]")) {
    const active = name === button.dataset.tab;
    $("#" + button.dataset.tab).hidden = !active;
    button.setAttribute("aria-current", String(active));
  }
  render();
  if (name === "chat" && previousTab !== "chat") {
    messages.scrollTop = current.readPosition ?? messages.scrollHeight;
  }
  if (name === "flow" && !editor) {
    const owner = project;
    editor = window.mountCrewFlow($("#flow-root"), {
      graph: owner.workflow,
      draft: owner.workflowDraft,
      roles: owner.crew,
      projectName: owner.name,
      version: owner.version,
      validate: groupStages,
      save(graph, logicChanged) {
        owner.workflow = graph;
        if (logicChanged) {
          owner.version++;
          model.log(
            current,
            "비서",
            "워크플로우 v" + owner.version + " 저장 · 다음 새 업무부터 적용",
          );
        }
        return owner.version;
      },
    });
  }
}

function switchSession(session) {
  if (project !== session.project && editor) {
    project.workflowDraft = editor.getDraft();
    editor.dispose();
    editor = null;
  }
  current.readPosition = messages.scrollTop;
  current = session;
  project = session.project;
  project.lastSession = session;
  draft.value = session.draft;
  showTab("chat");
  messages.scrollTop = session.readPosition ?? messages.scrollHeight;
}

function toggleCamp(shown) {
  document.body.classList.toggle("camp-visible", shown);
  mobileSwitch.setAttribute("aria-pressed", String(shown));
  mobileSwitch.ariaLabel = mobileSwitch.title = shown
    ? "작업 보기"
    : "캠프 보기";
}

function render() {
  drawSessionList();
  if (
    !roster.hidden &&
    !roster.contains(document.activeElement.closest("input"))
  )
    drawRoster();
  drawActors();
  if (tab === "chat") drawChat();
  if (tab === "log") drawLog();
  if (tab === "memory") drawMemory();
}

function drawChat() {
  const activeJobs = current.jobs.filter((job) =>
    activeStates.includes(job.state),
  );
  const waiting = activeJobs.filter((job) => job.state === "approval");
  const question =
    waiting.find((job) => job.id === current.approvalFocus) || waiting[0];
  const topJobs = activeJobs.filter((job) => job !== question);
  tasks.hidden = !topJobs.length;
  paint(
    tasks,
    topJobs
      .map(
        (job) => `<div class="task">
    <button class="task-title" data-job="${job.id}" title="${safe(job.title)}">${safe(job.title)}</button>
    ${
      job.state === "approval"
        ? `<button class="task-phase" data-question="${job.id}" aria-label="${safe(job.title)} 승인 질문으로 이동">승인 대기</button>`
        : `<span class="task-phase">${safe(jobStatus(job))}</span>`
    }
  </div>`,
      )
      .join(""),
  );

  decision.hidden = !question;
  paint(
    decision,
    question
      ? `<section aria-label="승인 요청">
    <button class="task-title decision-title" data-job="${question.id}" title="${safe(question.title)} 업무 상세">${safe(question.title)}</button>
    <div class="decision-layout">
      <div><p>${safe(question.question)}</p><small>${jobStage(question)
        .map((stage) => safe(project.crew[stage.role].name))
        .join(" · ")} / ${safe(project.name)}</small></div>
      <div class="decision-actions">
        <button class="primary" data-allow="${question.id}">허용</button>
        <button class="secondary" data-deny="${question.id}">거절</button>
      </div>
    </div>
  </section>`
      : "",
  );

  const followsLatest =
    messages.scrollHeight - messages.scrollTop - messages.clientHeight < 32;
  const lastStops = new Map(
    current.messages
      .filter((message) => message.action === "resume")
      .map((message) => [message.jobId, message]),
  );
  const markup = current.messages
    .map((message) => {
      const job = current.jobs.find((item) => item.id === message.jobId);
      const action =
        message.action === "log"
          ? `<button class="text-action" data-job-log="${job.id}">업무 기록 보기</button>`
          : job?.state === "stopped" && lastStops.get(job.id) === message
            ? `<button class="text-action" data-resume="${job.id}">이어가기</button>`
            : "";
      return `<div class="bubble${message.user ? " user" : ""}"><span class="sr">${message.user ? "나" : "비서"} </span>${safe(message.text)}${action}</div>`;
    })
    .join("");
  paint(
    messages,
    markup
      ? `<div class="transcript">${markup}</div>`
      : `<div class="empty-chat"><h1>무엇을 맡길까요?</h1>
      ${project === model.example ? '<button id="example-request">빈 검색어 처리 점검 ↗</button>' : ""}
    </div>`,
  );
  if (followsLatest) messages.scrollTop = messages.scrollHeight;
  drawComposer(activeJobs);
}

function drawComposer(
  activeJobs = current.jobs.filter((job) => activeStates.includes(job.state)),
) {
  const runnable = activeJobs.filter((job) => job.state !== "approval");
  stopTarget = runnable.includes(current.selected)
    ? current.selected
    : runnable.length === 1
      ? runnable[0]
      : null;
  const text = draft.value.trim();
  const linked = current.steer;
  const unavailable = linked && !steerableStates.includes(linked.state);
  const linkLabel = linked
    ? (unavailable ? "업무가 끝났어요 · " : "추가 지시 · ") + linked.title
    : stopTarget && (activeJobs.length > 1 || stopTarget.state === "stopping")
      ? (stopTarget.state === "stopping" ? "중단 중 · " : "멈춤 대상 · ") +
        stopTarget.title
      : "";
  const target = $("#target");
  target.hidden = !linkLabel;
  paint(
    target,
    linkLabel
      ? `<span>${safe(linkLabel)}</span>${linked ? '<button id="unlink" aria-label="추가 지시 대상 해제">×</button>' : ""}`
      : "",
  );
  $("#commands").hidden =
    !text.startsWith("/") || text === "/clear" || !"/clear".startsWith(text);
  $("#stop").hidden = !stopTarget;
  $("#stop").disabled = stopTarget?.state === "stopping";
  $("#stop").ariaLabel = $("#stop").title = stopTarget
    ? stopTarget.title + " 멈춤"
    : "멈춤";
  $("#send").hidden = !!stopTarget && !text;
  $("#send").disabled =
    !text || !!(unavailable && text !== "/clear" && !isNewWork(text));
  $("#project-name").textContent = project.name;
  $("#workspace-open").title = "프로젝트 폴더 선택 · " + project.name;
  $("#approval-name").textContent = "승인 " + project.approval;
}

function isNewWork(text) {
  return /새 업무|새 작업|별도 업무|별도 작업/.test(text);
}

function send() {
  if ($("#send").disabled) return;
  const text = draft.value.trim();
  current.draft = draft.value = "";
  if (text === "/clear") {
    switchSession(model.newSession(project));
  } else {
    model.submit(current, text, isNewWork(text));
    render();
    messages.scrollTop = messages.scrollHeight;
  }
  draft.focus();
}

function drawSessionList() {
  const waiting = project.sessions
    .filter((session) => session !== current)
    .flatMap((session) => session.jobs)
    .filter((job) => job.state === "approval").length;
  const indicator = $("#session-waiting");
  indicator.hidden = !waiting;
  indicator.textContent = waiting || "";
  sessionButton.ariaLabel = waiting
    ? "세션 목록 · 답변 대기 " + waiting + "건"
    : "세션 목록";
  if (sessionList.hidden) return;
  const options = project.sessions
    .map((session, index) => {
      const pending = session.jobs.filter(
        (job) => job.state === "approval",
      ).length;
      const activity = pending
        ? "답변 대기 " + pending + "건"
        : session.events[0]?.time || "";
      return `<li><button class="menu-option" data-session="${index}"${session === current ? ' aria-current="true"' : ""}>
      <strong>${safe(session.name)}</strong>${activity ? `<small>${safe(activity)}</small>` : ""}
    </button></li>`;
    })
    .reverse();
  paint(
    sessionList,
    '<li><button id="new-session" class="menu-option">＋ 새 대화</button></li>' +
      options.join(""),
  );
}

function drawLog() {
  const view = $("#log");
  const events = current.events.filter(
    (event) => !logJob || event.jobId === logJob.id,
  );
  const opened = new Set(
    [...view.querySelectorAll("details[open]")].map((row) => row.dataset.event),
  );
  const focused = document.activeElement.closest("[data-event]")?.dataset.event;
  const anchor =
    view.scrollTop > 0
      ? [...view.querySelectorAll(".log-row")].find(
          (row) =>
            row.getBoundingClientRect().bottom >
            view.getBoundingClientRect().top,
        )
      : null;
  const top = anchor?.getBoundingClientRect().top;
  paint(
    view,
    (logJob
      ? `<button id="all-log" class="text-action">← 전체 기록</button><h2>${safe(logJob.title)}</h2>`
      : "") +
      (events
        .map(
          (event) => `<article class="log-row" data-event-row="${event.id}">
      <time>${safe(event.time)}</time><div><strong>${safe(event.role)}</strong><p>${safe(event.text)}</p>
      ${event.details ? `<details data-event="${event.id}"${opened.has(String(event.id)) ? " open" : ""}><summary>완료 조건</summary><p>${safe(event.details)}</p></details>` : ""}</div>
    </article>`,
        )
        .join("") || '<p class="subtle">업무가 시작되면 여기에 기록돼요.</p>'),
  );
  const row =
    anchor &&
    view.querySelector('[data-event-row="' + anchor.dataset.eventRow + '"]');
  if (row) view.scrollTop += row.getBoundingClientRect().top - top;
  if (focused)
    view
      .querySelector('[data-event="' + focused + '"] summary')
      ?.focus({ preventScroll: true });
}

function drawMemory() {
  const view = $("#memory");
  const wiki = project.memoryView === "wiki";
  const article =
    wiki && project.memories.find((entry) => entry.id === project.wikiArticle);
  const tabBar = `<header class="memory-tools"><div class="memory-tabs" aria-label="메모리 범위">
    <button data-memory-view="wiki" aria-pressed="${wiki}">프로젝트 위키</button>
    <button data-memory-view="agents" aria-pressed="${!wiki}">에이전트 기억</button></div>
    ${
      wiki && !article
        ? `<div class="wiki-views" aria-label="위키 보기">
      <button data-view="list" aria-pressed="${project.wikiView === "list"}">목록</button>
      <button data-view="graph" aria-pressed="${project.wikiView === "graph"}">노드</button></div>`
        : ""
    }
  </header>`;
  let content;
  if (!wiki) {
    content = project.crew
      .map((agent, index) => {
        const notes = project.personalMemory[index] || [];
        if (agent.temporary && !agent.hired && !notes.length) return "";
        const expanded = project.agentMemory === index;
        return `<button class="memory-row" data-note="${index}" aria-expanded="${expanded}">${safe(agent.role)} · ${safe(agent.name)}<small>${notes.length}개</small></button>
        ${expanded ? notes.map((note, i) => `<div class="memory-note"><p>${safe(note)}</p><button class="text-action" data-delete-note="${i}">삭제</button></div>`).join("") || '<p class="subtle">아직 남긴 기억이 없어요.</p>' : ""}`;
      })
      .join("");
  } else if (article) {
    const links = article.links
      .map((id) => project.memories.find((entry) => entry.id === id))
      .filter(Boolean);
    content = `<article class="wiki-article">
      <button class="text-action" id="wiki-back">← 위키 목록</button>
      <h2>${safe(article.title)}</h2>
      <small>${safe(article.by)} · ${safe(article.source)}</small>
      <p>${safe(article.body)}</p>
      ${links.map((entry) => `<button class="text-action" data-linked="${safe(entry.id)}">→ ${safe(entry.title)}</button>`).join("")}
      <footer><button class="text-action" id="delete-wiki">문서 삭제</button></footer>
    </article>`;
  } else if (project.wikiView === "graph") {
    content = wikiGraph(project.memories);
  } else {
    content =
      project.memories
        .map(
          (entry, index) =>
            `<button class="memory-row" data-memory="${index}">${safe(entry.title)}</button>`,
        )
        .join("") || '<p class="subtle">아직 문서가 없어요.</p>';
  }
  paint(view, tabBar + content);
}

function openDialog(title, content) {
  $("#detail-title").textContent = title;
  paint($("#detail-body"), content);
  if (!detail.open) detail.showModal();
}

function openJob(job) {
  current.selected = job;
  drawComposer();
  openDialog(
    job.title,
    `<p class="subtle">워크플로우 v${job.version} · ${safe(jobStatus(job))}</p>
    <ol class="detail-stages">${job.groups
      .flatMap((group, step) =>
        group.map(
          (stage) => `<li>
      ${safe(stage.label)} <span class="subtle">· ${safe(project.crew[stage.role].name)} · ${step < job.step ? "완료" : step === job.step ? "현재" : "예정"}</span>
      <small>${safe(stage.criterion)}</small></li>`,
        ),
      )
      .join("")}</ol>
    <div class="detail-actions">
      <button class="secondary" data-job-log="${job.id}">업무 로그</button>
      ${steerableStates.includes(job.state) ? `<button class="secondary" data-steer="${job.id}">추가 지시</button><button class="secondary" data-stop="${job.id}">멈춤</button>` : ""}
    </div>`,
  );
}

function openAgent(index) {
  const agent = project.crew[index];
  openDialog(
    agent.role + " · " + agent.name,
    `
    <label class="field">모델<select id="model" data-agent="${index}">
      ${["Codex", "로컬 LLM"].map((name) => `<option${name === agent.model ? " selected" : ""}>${name}</option>`).join("")}
    </select></label>
    <div class="field"><span>스킬</span><span>${safe(agent.skill)}</span></div>
    <details class="field"><summary>역할 지침</summary><p>${safe(agent.skill)}를 맡고 확인한 근거를 인계합니다.</p></details>
    <div class="detail-actions"><button class="secondary" data-agent-memory="${index}">기억 보기</button></div>`,
  );
}

function drawRoster() {
  const content = project.crew
    .map((agent, index) => {
      if (agent.temporary && !agent.hired && !agent.leaving) return "";
      const action = agent.leaving
        ? "퇴장 예정"
        : agent.hired
          ? "해고"
          : "재고용";
      return `<div class="crew-row" style="--agent:${agent.color}">
      <span>${safe(agent.role)}</span>
      <button class="crew-name" data-name="${index}" title="별명 변경">${safe(agent.name)}</button>
      <button class="crew-settings" data-agent="${index}" aria-label="${safe(agent.role)} 상세 · ${safe(agent.model)}" title="${safe(agent.skill)}">${safe(agent.model)} ${icon(agent.icon)}</button>
      <button class="icon-button" data-employ="${index}" title="${action}" aria-label="${safe(agent.role)} ${action}" ${agent.leaving ? "disabled" : ""}>${icon(agent.hired ? "close" : agent.leaving ? "down" : "check")}</button>
    </div>`;
    })
    .join("");
  paint(
    roster,
    content +
      (project.crew.some(
        (agent) => agent.temporary && (agent.hired || agent.leaving),
      )
        ? ""
        : '<button id="hire-temp" class="text-action">＋ 알바 고용</button>'),
  );
}

function renameAgent(button, index) {
  const agent = project.crew[index];
  const input = document.createElement("input");
  input.maxLength = 12;
  input.ariaLabel = agent.role + " 별명";
  input.value = agent.name;
  button.replaceWith(input);
  let cancelled = false;
  input.onkeydown = (event) => {
    if (event.isComposing) return;
    if (event.key === "Escape" || event.key === "Enter") {
      event.preventDefault();
      cancelled = event.key === "Escape";
      input.blur();
      roster.querySelector('[data-name="' + index + '"]')?.focus();
    }
  };
  input.onblur = () => {
    if (!cancelled && input.value.trim()) agent.name = input.value.trim();
    input.replaceWith(button);
    drawRoster();
    drawActors();
  };
  input.focus();
  input.select();
}

const campWalk = [
  [0, 0],
  [-2, 1],
  [1, 2],
  [2, -1],
];
const remarks = [
  "불 옆이 따뜻하네.",
  "잠깐 쉬어 갈까요?",
  "장작이 잘 타네요.",
  "기록을 정리해 둘게요.",
];
function drawActors() {
  const land = $("#land");
  const jobs = model.jobsIn(project);
  for (const actor of land.querySelectorAll("[data-actor]")) {
    if (!project.crew[Number(actor.dataset.actor)]) actor.remove();
  }
  project.crew.forEach((agent, index) => {
    const available = agent.hired || agent.leaving;
    const assignments = jobs.filter(
      (job) =>
        ["approval", "run", "stopping"].includes(job.state) &&
        jobStage(job).some((stage) => stage.role === index),
    );
    const job =
      assignments.find((item) => item.state === "run") ||
      assignments.find((item) => item === current.selected) ||
      assignments[0];
    let actor = land.querySelector('[data-actor="' + index + '"]');
    if (!actor) {
      actor = document.createElement("button");
      actor.className = "actor";
      actor.dataset.actor = index;
      actor.innerHTML = `<span class="actor-label"></span><img alt="" src="assets/crew-${agent.sprite}.webp">`;
      land.append(actor);
      if (agent.temporary) {
        actor.style.left = "108%";
        actor.getBoundingClientRect();
      }
    }
    actor.inert = !available;
    actor.classList.toggle(
      "work",
      job?.state === "run" || (job?.state === "stopping" && job.holdsRoles),
    );
    actor.style.setProperty("--agent", agent.color);
    const [dx, dy] = job
      ? [2, 0]
      : campWalk[(campBeat + index) % campWalk.length];
    actor.style.left =
      (available ? agent.x + dx : agent.x < 50 ? -15 : 115) + "%";
    actor.style.top = agent.y + dy + "%";
    const stage = job && jobStage(job).find((item) => item.role === index);
    const status = job
      ? job.state === "run"
        ? stage.label
        : jobStatus(job)
      : campBeat > 0 &&
          campBeat % 3 === 1 &&
          index === campBeat % project.crew.length
        ? remarks[index % remarks.length]
        : "";
    paint(
      actor.querySelector(".actor-label"),
      `<strong>${safe(agent.name)}</strong>${status ? " · " + safe(status) : ""}`,
    );
    actor.onclick = () => {
      if (!job) return openAgent(index);
      if (current !== job.session) switchSession(job.session);
      if (job.state === "approval") return showApproval(job);
      openJob(job);
    };
  });
}

function showApproval(job) {
  current.approvalFocus = job.id;
  showTab("chat");
  decision.querySelector("[data-allow]")?.focus();
}

function openMenu(button, label, content) {
  if (popoverSource === button && popover.matches(":popover-open")) {
    popover.hidePopover();
    button.focus();
    return;
  }
  popoverSource?.setAttribute("aria-expanded", "false");
  popoverSource = button;
  popover.ariaLabel = label;
  paint(popover, content);
  popover.showPopover({ source: button });
  button.setAttribute("aria-expanded", "true");
  positionMenu();
  popover.querySelector("button")?.focus();
}

function positionMenu() {
  if (!popover.matches(":popover-open")) return;
  const rect = popoverSource.getBoundingClientRect();
  popover.style.setProperty(
    "--menu-left",
    Math.max(8, Math.min(rect.left, innerWidth - popover.offsetWidth - 8)) +
      "px",
  );
  popover.style.setProperty(
    "--menu-bottom",
    Math.max(8, innerHeight - rect.top + 6) + "px",
  );
}

function openFolders() {
  openMenu(
    $("#workspace-open"),
    "프로젝트 폴더",
    `
    <button id="choose-folder" class="menu-option">폴더 열기…</button>
    <input id="directory" type="file" webkitdirectory hidden>
    <p id="folder-status" class="menu-hint" role="status"></p>
    ${model.projects.map((entry, i) => `<button class="menu-option" data-project="${i}"${entry === project ? ' aria-current="true"' : ""}>${safe(entry.name)}</button>`).join("")}`,
  );
}

function selectProject(entry) {
  popover.hidePopover();
  if (entry !== project) switchSession(entry.lastSession);
  $("#workspace-open").focus();
}

async function pickFolder() {
  const input = $("#directory");
  if (!window.showDirectoryPicker) return input.click();
  try {
    const handle = await window.showDirectoryPicker({ mode: "read" });
    for (const entry of model.projects) {
      if (entry.handle && (await handle.isSameEntry(entry.handle)))
        return selectProject(entry);
    }
    selectProject(model.createProject(handle.name, handle));
  } catch (error) {
    if (error.name === "AbortError") return;
    if (popover.matches(":popover-open")) {
      $("#folder-status").textContent =
        "브라우저에서 읽을 수 있는 폴더를 골라 주세요.";
      input.click();
    }
  }
}

function openModes() {
  openMenu(
    $("#approval-open"),
    "승인 모드 · " + project.name,
    Object.entries(approvalModes)
      .map(
        ([mode, help]) =>
          `<button class="menu-option" data-mode="${mode}"${project.approval === mode ? ' aria-current="true"' : ""}><strong>${mode}</strong><small>${help}</small></button>`,
      )
      .join("") + '<p class="menu-hint">다음 권한 요청부터 적용됩니다.</p>',
  );
}

document.querySelector(".toolbar").onclick = (event) => {
  const button = event.target.closest("button");
  if (!button) return;
  if (button.dataset.tab) return showTab(button.dataset.tab);
  sessionList.hidden = !sessionList.hidden;
  sessionButton.setAttribute("aria-expanded", String(!sessionList.hidden));
  if (!sessionList.hidden) drawSessionList();
};
mobileSwitch.onclick = () =>
  toggleCamp(!document.body.classList.contains("camp-visible"));
$("#roster-head").onclick = (event) => {
  roster.hidden = !roster.hidden;
  event.currentTarget.setAttribute("aria-expanded", String(!roster.hidden));
  if (!roster.hidden) drawRoster();
};
$("#workspace-open").onclick = openFolders;
$("#approval-open").onclick = openModes;
$("#close").onclick = () => detail.close();
draft.oninput = () => {
  current.draft = draft.value;
  drawComposer();
};
draft.onkeydown = (event) => {
  if (event.isComposing || event.keyCode === 229) return;
  if (event.key === "Escape" && !$("#commands").hidden)
    $("#commands").hidden = true;
  if (event.key !== "Enter" || event.shiftKey) return;
  event.preventDefault();
  if (event.repeat) return;
  if (!$("#commands").hidden) {
    $("#fill-clear").click();
  } else send();
};
$("#composer").onsubmit = (event) => {
  event.preventDefault();
  send();
};
$("#stop").onpointerdown = () => {
  pressedStopTarget = stopTarget;
};
$("#stop").onclick = (event) => {
  const clicked = event.detail === 0 ? stopTarget : pressedStopTarget;
  if (event.detail < 2 && clicked && clicked === stopTarget)
    model.stop(clicked);
  pressedStopTarget = null;
};
$("#fill-clear").onclick = () => {
  draft.value = "/clear";
  draft.oninput();
  draft.focus();
};
window.addEventListener("resize", positionMenu);
popover.addEventListener("toggle", () => {
  if (!popover.matches(":popover-open"))
    popoverSource?.setAttribute("aria-expanded", "false");
});

document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sessionList.hidden && !detail.open) {
    sessionList.hidden = true;
    sessionButton.setAttribute("aria-expanded", "false");
    sessionButton.focus();
  }
});

document.addEventListener("change", (event) => {
  const field = event.target;
  if (field.id === "model") {
    const agent = project.crew[Number(field.dataset.agent)];
    agent.model = field.value;
    model.log(current, "사용자", agent.role + " 모델 · " + agent.model);
    drawRoster();
  } else if (field.id === "directory") {
    const name = field.files[0]?.webkitRelativePath.split("/")[0];
    field.value = "";
    if (name) selectProject(model.createProject(name));
  }
});

document.addEventListener("click", (event) => {
  if (
    !event.target.closest("#session-open, #session-list") &&
    !sessionList.hidden
  ) {
    sessionList.hidden = true;
    sessionButton.setAttribute("aria-expanded", "false");
  }
  const button = event.target.closest("button");
  if (!button) return;
  const data = button.dataset;
  const jobKey =
    data.job ??
    data.question ??
    data.allow ??
    data.deny ??
    data.jobLog ??
    data.resume ??
    data.steer ??
    data.stop;
  const job = jobKey && current.jobs.find((item) => item.id === Number(jobKey));

  if (job) {
    if (data.job) return openJob(job);
    if (data.question) return showApproval(job);
    if (data.allow || data.deny) {
      model.answer(job, Boolean(data.allow));
      draft.focus();
    } else if (data.jobLog) {
      if (detail.open) detail.close();
      showTab("log", job);
    } else if (data.resume) model.resume(job);
    else if (data.steer) {
      detail.close();
      current.steer = current.selected = job;
      showTab("chat");
      draft.focus();
    } else if (data.stop) {
      detail.close();
      model.stop(job);
    }
    return;
  }

  if (data.session !== undefined) {
    switchSession(project.sessions[Number(data.session)]);
    sessionButton.focus();
  } else if (data.project !== undefined)
    selectProject(model.projects[Number(data.project)]);
  else if (data.mode) {
    project.approval = data.mode;
    model.log(current, "사용자", "프로젝트 승인 · " + data.mode);
    popover.hidePopover();
    $("#approval-open").focus();
    drawComposer();
  } else if (data.name !== undefined) renameAgent(button, Number(data.name));
  else if (data.agent !== undefined) openAgent(Number(data.agent));
  else if (data.employ !== undefined) {
    model.setEmployment(current, Number(data.employ));
    (
      roster.querySelector('[data-employ="' + data.employ + '"]') ||
      $("#hire-temp") ||
      $("#roster-head")
    ).focus();
  } else if (data.agentMemory !== undefined) {
    detail.close();
    project.memoryView = "agents";
    project.agentMemory = Number(data.agentMemory);
    showTab("memory");
    $("#memory [data-note='" + data.agentMemory + "']")?.focus();
  } else if (data.memoryView || data.view || data.note !== undefined) {
    if (data.memoryView) project.memoryView = data.memoryView;
    if (data.view) project.wikiView = data.view;
    if (data.note !== undefined) {
      const index = Number(data.note);
      project.agentMemory = project.agentMemory === index ? null : index;
    }
    const attribute = button
      .getAttributeNames()
      .find((name) => name.startsWith("data-"));
    drawMemory();
    $("#memory")
      .querySelector(
        "[" + attribute + '="' + button.getAttribute(attribute) + '"]',
      )
      ?.focus();
  } else if (data.memory !== undefined || data.linked) {
    project.wikiArticle =
      data.linked ?? project.memories[Number(data.memory)].id;
    drawMemory();
    $("#memory").scrollTop = 0;
    $("#wiki-back").focus();
  } else if (data.deleteNote !== undefined) {
    if (window.confirm("이 기억을 삭제할까요?")) {
      project.personalMemory[project.agentMemory].splice(
        Number(data.deleteNote),
        1,
      );
      drawMemory();
      $("#memory [data-note='" + project.agentMemory + "']").focus();
    }
  } else if (button.id === "delete-wiki") {
    if (window.confirm("이 위키 문서를 삭제할까요?")) {
      project.memories = project.memories.filter(
        (entry) => entry.id !== project.wikiArticle,
      );
      project.wikiArticle = null;
      drawMemory();
      $("#memory [data-memory-view=wiki]").focus();
    }
  } else if (button.id === "wiki-back") {
    const index = project.memories.findIndex(
      (entry) => entry.id === project.wikiArticle,
    );
    project.wikiArticle = null;
    drawMemory();
    $("#memory [data-memory='" + index + "']")?.focus();
  } else if (button.id === "all-log") showTab("log");
  else if (button.id === "hire-temp") model.hireTemp(current);
  else if (button.id === "choose-folder") pickFolder();
  else if (button.id === "new-session") {
    switchSession(model.newSession(project));
    draft.focus();
  } else if (button.id === "unlink") {
    current.steer = null;
    drawComposer();
    draft.focus();
  } else if (button.id === "example-request") {
    draft.value = exampleRequest;
    draft.oninput();
    draft.focus();
  }
});

showTab("chat");
window.setInterval(() => {
  if (document.hidden || detail.open) return;
  campBeat++;
  drawActors();
}, 5000);
