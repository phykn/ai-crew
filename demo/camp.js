"use strict";

const $ = (selector) => document.querySelector(selector);
const paths = {
  fire: "M13 2c1 6-4 7-2 11 2-1 3-3 3-6 4 3 6 6 5 10-1 4-5 6-9 5-5-1-7-5-6-9 1-2 2-4 5-7-1 5 0 6 1 6-1-4 4-6 3-10Z",
  flow: "M3 9h5v5H3z M16 2h5v5h-5z M16 17h5v5h-5z M8 11.5h4V4.5h4m-4 7v8h4",
  menu: "M3 6h18M3 12h18M3 18h18",
  folder: "M3 7V5h6l2 2h10v12H3Z",
  layers: "m3 8 9-5 9 5-9 5-9-5m0 5 9 5 9-5",
  down: "m6 9 6 6 6-6",
  users:
    "M16 21v-2a5 5 0 0 0-10 0v2M11 5a3.5 3.5 0 1 0 .1 0M18 8a3 3 0 0 1 0 6m1 2c2 1 3 3 3 5",
  compass: "M12 2a10 10 0 1 0 .1 0m3 6-2 6-5 2 2-6Z",
  chat: "M3 4h18v13H9l-5 4v-4H3Z",
  list: "M8 6h13M8 12h13M8 18h13M3 6h1m-1 6h1m-1 6h1",
  book: "M12 5c-3-2-6-2-10-1v15c4-1 7-1 10 1 3-2 6-2 10-1V4c-4-1-7-1-10 1Zm0 1v13",
  close: "m6 6 12 12m0-12L6 18",
  pin: "m9 3 9 3-2 2-1 5 2 3-12-4 4-1 2-5Zm1 11-4 7",
  send: "m3 11 18-8-7 18-3-8-8-2Zm8 2 10-10",
  stop: "M5 5h14v14H5Z",
  pen: "m4 16 12-12 4 4L8 20l-5 1Z",
  code: "m7 7-5 5 5 5m10-10 5 5-5 5m-3-15-4 20",
  shield: "m12 2 8 4v6c0 4-4 8-8 10-4-2-8-6-8-10V6Zm-4 10 3 3 5-6",
  check: "m3 12 5 5L21 4",
  play: "m7 4 13 8-13 8Z",
};
const icon = (name) =>
  '<svg aria-hidden="true" viewBox="0 0 24 24"><path d="' +
  paths[name] +
  '"/></svg>';
const safe = (value) =>
  String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        char
      ],
  );
document
  .querySelectorAll("[data-icon]")
  .forEach((el) => (el.innerHTML = icon(el.dataset.icon)));

const defaultCrew = [
  {
    role: "비서",
    name: "여울",
    color: "#f1c47f",
    model: "Codex",
    skill: "업무 조율",
    icon: "pen",
    x: 30,
    y: 61,
  },
  {
    role: "개발",
    name: "모루",
    color: "#b4d59d",
    model: "Codex",
    skill: "코드 작성",
    icon: "code",
    x: 64,
    y: 77,
  },
  {
    role: "테스트",
    name: "솔잎",
    color: "#a9c7f0",
    model: "로컬 LLM",
    skill: "테스트 실행",
    icon: "shield",
    x: 78,
    y: 65,
  },
  {
    role: "리뷰",
    name: "새벽",
    color: "#d6a8d3",
    model: "Codex",
    skill: "변경 검토",
    icon: "book",
    x: 24,
    y: 83,
  },
  {
    role: "플랜",
    name: "가람",
    color: "#bce0da",
    model: "Codex",
    skill: "범위·완료 조건",
    icon: "pen",
    sprite: 2,
    x: 48,
    y: 51,
  },
  {
    role: "스타일",
    name: "단풍",
    color: "#f6aa8a",
    model: "Codex",
    skill: "코딩 스타일 확인",
    icon: "code",
    sprite: 0,
    x: 86,
    y: 84,
  },
];
const exampleMemories = [
  {
    id: "guide",
    title: "프로젝트 작업 지침",
    body: "현재 요청과 프로젝트 지침을 우선한다. 플랜에는 관련 문서만 읽고 확인한 근거를 연결한다.",
    by: "플랜",
    source: "프로젝트 위키",
    links: ["search", "checks"],
  },
  {
    id: "search",
    title: "검색 입력 처리",
    body: "앞뒤 공백을 제거하고 빈 검색어면 전체 목록을 반환한다.",
    by: "개발",
    source: "검색 개선",
    links: ["checks"],
  },
  {
    id: "checks",
    title: "변경 검증",
    body: "리뷰·스타일·테스트 결과를 같은 변경 버전에 연결하고 미확인 항목을 기록한다.",
    by: "테스트",
    source: "개발 워크플로우",
    links: [],
  },
];
const exampleRequest =
  "빈 검색어와 공백 입력에서 전체 목록이 보이는지 확인해줘.";
const projects = [];
function makeProject(name, handle = null) {
  const entry = {
    name,
    handle,
    sessions: [],
    memories: [],
    workflow: makeStages(),
    version: 1,
    approval: "수동",
    wikiView: "목록",
    memoryView: "wiki",
    agentMemory: null,
    personalMemory: {},
    crew: defaultCrew.map((agent) => ({ ...agent })),
    lastSession: null,
  };
  projects.push(entry);
  return entry;
}
const exampleProject = makeProject("ai-crew");
exampleProject.memories = exampleMemories;
exampleProject.personalMemory[1] = [
  "검색 조건을 바꾸기 전에 기존 공백 처리 규칙을 확인한다.",
];
let project = exampleProject;
const campsites = [
  [0, 0],
  [-2, 1],
  [1, 2],
  [2, -1],
];
const remarks = [
  "불 옆이 따뜻하네.",
  "잠깐 숨 좀 돌릴까요?",
  "장작이 잘 타네요.",
  "기록을 정리해 둘게요.",
];
let campBeat = 0;
let nextId = 1;
let current,
  tab = "chat",
  logJob = null;
const reply = (session, text, jobId, stopped = false) =>
  session.messages.push({ text, jobId, stopped });
function newSession(owner = project) {
  const session = {
    project: owner,
    name: "새 대화",
    messages: [],
    jobs: [],
    events: [],
    selected: null,
    draft: "",
  };
  owner.sessions.push(session);
  return session;
}
function record(session, role, text, job, details) {
  session.events.unshift({
    role,
    text,
    jobId: job?.id,
    details,
    time: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  });
}
const activeStates = ["run", "stopping", "approval", "queued"];

function activeJob(session) {
  const running = session.jobs.filter((job) =>
    ["run", "stopping", "queued"].includes(job.state),
  );
  return (
    running.find((job) => job.id === session.selected) ||
    (running.length === 1 ? running[0] : undefined)
  );
}
function stageLabel(job) {
  return job.groups[job.step].map((s) => s.label).join(" · ");
}
function startJob(session, title, step = 0) {
  const job = {
    id: nextId++,
    title,
    state: "run",
    step,
    groups: groupStages(session.project.workflow),
    version: session.project.version,
  };
  session.jobs.push(job);
  session.selected = job.id;
  record(session, "비서", title + " · 워크플로우 v" + job.version, job);
  for (const earlier of job.groups.slice(0, step).flat())
    record(
      session,
      session.project.crew[earlier.role].role,
      earlier.label + " 인계 · " + earlier.criterion,
      job,
    );
  enterStage(session, job);
  return job;
}
function enterStage(session, job) {
  const group = job.groups[job.step];
  const mode = session.project.approval;
  const scope = [...new Set(group.map((s) => s.access))].join(" · ");
  if (
    mode === "수동" ||
    (mode === "자동" && group.some((s) => s.access === "외부 전달"))
  ) {
    job.state = "approval";
    const question = {
      text: scope + " 권한을 허용할까요?",
      detail:
        group
          .map(
            (stage) =>
              session.project.crew[stage.role].name +
              " · " +
              session.project.crew[stage.role].role,
          )
          .join(" / ") +
        " — " +
        session.project.name,
      approvalId: job.id,
    };
    session.messages.push(question);
    job.question = question;
    record(session, "비서", mode + " · 권한 승인 대기 · " + scope, job);
    return;
  }
  record(
    session,
    "비서",
    mode === "자동"
      ? "자동 · 비서가 프로젝트 내 작업으로 판단해 승인 · " + scope
      : "항상 · 모든 요청 권한 승인 · " + scope,
    job,
  );
  schedule(session, job);
}
function decide(job, allow) {
  if (job?.state !== "approval") return;
  job.question.answer = allow ? "허용" : "거절";
  if (!allow) job.state = "denied";
  record(
    current,
    "사용자",
    stageLabel(job) +
      " · " +
      job.groups[job.step].map((s) => s.access).join(" / ") +
      " · " +
      job.question.answer,
    job,
  );
  if (allow) schedule(current, job);
  else
    reply(current, "권한이 거절되어 「" + job.title + "」을 멈췄어요.", job.id);
  current.approvalFocus = null;
  render();
  $("#draft").focus();
}
function schedule(session, job) {
  clearTimeout(job.timer);
  const group = job.groups[job.step];
  const busy = session.jobs.some(
    (other) =>
      other !== job &&
      ["run", "stopping"].includes(other.state) &&
      other.groups[other.step].some((stage) =>
        group.some((next) => next.role === stage.role),
      ),
  );
  if (busy) {
    if (job.state !== "queued")
      record(session, "비서", "앞 업무의 같은 담당자 종료 대기", job);
    job.state = "queued";
    return;
  }
  job.state = "run";
  for (const stage of group)
    record(
      session,
      session.project.crew[stage.role].role,
      stage.label + " 시작",
      job,
      stage.criterion,
    );
  job.timer = setTimeout(() => {
    if (job.state !== "run") return;
    for (const stage of group)
      record(
        session,
        session.project.crew[stage.role].role,
        stage.label + " 확인 완료",
        job,
        "모의 완료 조건 · " + stage.criterion,
      );
    if (job.step + 1 < job.groups.length) {
      job.step++;
      enterStage(session, job);
    } else {
      job.state = "done";
      const evidence = group.map((s) => s.label).join(", ");
      record(session, "비서", "결과 취합 · " + evidence, job);
      reply(
        session,
        "「" + job.title + "」의 " + evidence + " 확인을 마쳤어요.",
        job.id,
      );
      session.project.memories.push({
        id: "job-" + job.id,
        title: job.title + " 결과",
        body: evidence + " 확인 완료 (모의 실행).",
        by: "비서",
        source: job.title,
        links: [],
      });
    }
    startQueuedJobs(session);
    if (session === current) render();
    else if (session.project === project) {
      drawContext();
      drawActors();
    }
  }, 9000);
}
function startQueuedJobs(session) {
  for (const job of session.jobs) {
    if (job.state === "queued") schedule(session, job);
  }
}

function stopJob(session, job) {
  if (!["run", "approval", "queued"].includes(job.state)) return;
  if (job.state === "approval") job.question.answer = "중단";
  clearTimeout(job.timer);
  job.state = "stopping";
  record(session, "비서", "중단 요청 접수", job);
  render();
  job.timer = setTimeout(() => {
    job.state = "stopped";
    record(session, "비서", "실행 정지 확인", job);
    reply(
      session,
      "「" + job.title + "」을 멈췄어요. 지금까지의 단계는 남겨뒀어요.",
      job.id,
      true,
    );
    startQueuedJobs(session);
    if (session === current) render();
    else if (session.project === project) {
      drawContext();
      drawActors();
    }
  }, 700);
}
function resume(job) {
  if (job.state !== "stopped") return;
  job.state = "run";
  current.selected = job.id;
  record(current, "비서", "마지막 단계에서 이어가기", job);
  enterStage(current, job);
  render();
}
function modal(title, html) {
  $("#detail-title").textContent = title;
  $("#detail-body").innerHTML = html;
  if (!$("#detail").open) $("#detail").showModal();
}
$("#close").onclick = () => $("#detail").close();
$("#detail").onclick = (e) => {
  if (e.target === $("#detail")) $("#detail").close();
};
function agentDetail(index) {
  const agent = project.crew[index];
  modal(
    agent.role + " · " + agent.name,
    "<p>" +
      safe(agent.skill) +
      ' 담당</p><label class="field">모델<select id="model"><option>Codex</option><option>로컬 LLM</option></select></label><div class="field">스킬<span class="model">' +
      safe(agent.skill) +
      "</span></div>",
  );
  const memory = document.createElement("button");
  memory.className = "text-action";
  memory.textContent = "에이전트 기억 보기";
  memory.onclick = () => {
    $("#detail").close();
    project.memoryView = "agents";
    project.agentMemory = index;
    openTab("memory");
  };
  $("#detail-body").append(memory);
  $("#model").value = agent.model;
  $("#model").onchange = (e) => {
    agent.model = e.target.value;
    record(
      current,
      "비서",
      agent.role + " 모델을 " + agent.model + "으로 변경",
    );
    render();
  };
}
function renameAgent(index) {
  const agent = project.crew[index];
  const button = document.querySelector('[data-name="' + index + '"]');
  const input = document.createElement("input");
  input.value = agent.name;
  input.maxLength = 12;
  input.setAttribute("aria-label", agent.role + " 별명");
  button.replaceWith(input);
  input.focus();
  input.select();
  let cancelled = false;
  input.onkeydown = (e) => {
    if (e.isComposing) return;
    if (e.key === "Escape") {
      cancelled = true;
      input.blur();
    }
    if (e.key === "Enter") input.blur();
  };
  input.onblur = () => {
    if (!cancelled && input.value.trim()) agent.name = input.value.trim();
    drawRoster();
    drawActors();
  };
}
function drawRoster() {
  if (
    $("#roster-body input") === document.activeElement &&
    document.activeElement?.tagName === "INPUT"
  )
    return;
  $("#crew-count").textContent = project.crew.length;
  $("#roster-body").innerHTML = project.crew
    .map(
      (agent, i) =>
        '<div class="crew-row" style="--agent:' +
        agent.color +
        '"><span class="portrait" style="background-image:url(assets/crew-' +
        (agent.sprite ?? i) +
        '.webp)"></span><small>' +
        agent.role +
        '</small><button class="crew-name" data-name="' +
        i +
        '" title="별명 변경">' +
        safe(agent.name) +
        '</button><button class="crew-info" data-detail="' +
        i +
        '" aria-label="' +
        agent.role +
        " 상세 · " +
        agent.model +
        " · " +
        agent.skill +
        '" title="' +
        agent.skill +
        '"><span>' +
        agent.model +
        "</span>" +
        icon(agent.icon) +
        "</button></div>",
    )
    .join("");
  document
    .querySelectorAll("[data-name]")
    .forEach((el) => (el.onclick = () => renameAgent(+el.dataset.name)));
  document
    .querySelectorAll("[data-detail]")
    .forEach((el) => (el.onclick = () => agentDetail(+el.dataset.detail)));
}
function drawActors() {
  const land = $("#land");
  project.crew.forEach((agent, i) => {
    const assigned = project.sessions.flatMap((session) =>
      session.jobs
        .filter(
          (job) =>
            ["run", "approval"].includes(job.state) &&
            job.groups[job.step].some((stage) => stage.role === i),
        )
        .map((job) => ({ session, job })),
    );
    const assignment =
      assigned.find(({ job }) => job.id === current.selected) ||
      assigned.find(({ job }) => job.state === "run") ||
      assigned[0];
    const job = assignment?.job;
    let actor = land.querySelector('[data-actor="' + i + '"]');
    if (!actor) {
      actor = document.createElement("button");
      actor.dataset.actor = i;
      actor.innerHTML =
        '<span class="actor-label"></span><img alt="" src="assets/crew-' +
        (agent.sprite ?? i) +
        '.webp">';
      land.append(actor);
    }
    actor.className =
      "actor" + (job?.state === "run" ? " work" : job ? " waiting" : "");
    actor.style.setProperty("--agent", agent.color);
    const offset =
      job || !campBeat ? [0, 0] : campsites[(campBeat + i) % campsites.length];
    actor.style.left = agent.x + (job ? 2 : offset[0]) + "%";
    actor.style.top = agent.y + offset[1] + "%";
    actor.querySelector("span").innerHTML =
      "<strong>" +
      safe(agent.name) +
      "</strong>" +
      (job
        ? job.state === "approval"
          ? "승인 대기"
          : safe(job.groups[job.step].find((s) => s.role === i).label)
        : campBeat > 0 &&
            campBeat % 3 === 1 &&
            i === campBeat % project.crew.length
          ? remarks[i % remarks.length]
          : "");
    actor.onclick = () => {
      if (!job) return agentDetail(i);
      if (current !== assignment.session) switchSession(assignment.session);
      if (job.state === "approval") {
        current.approvalFocus = job.id;
        openTab("chat");
        $("#decision [data-allow]").focus();
      } else {
        jobDetail(job);
      }
    };
  });
}
function jobDetail(job) {
  modal(
    job.title,
    "<p>워크플로우 v" +
      job.version +
      " · " +
      (job.step + 1) +
      "/" +
      job.groups.length +
      '단계</p><ul class="stage-facts">' +
      job.groups
        .flatMap((group, i) =>
          group.map(
            (s) =>
              "<li>" +
              safe(s.label) +
              " · " +
              safe(project.crew[s.role].name) +
              "<small>" +
              (i < job.step ? "완료" : i === job.step ? "현재" : "예정") +
              " · " +
              safe(s.criterion) +
              "</small></li>",
          ),
        )
        .join("") +
      "</ul>" +
      '<div class="dialog-actions"><button id="job-log" class="secondary">업무 로그</button><button id="job-steer" class="secondary">추가 지시</button><button id="job-stop" class="secondary">멈춤</button></div>',
  );
  $("#job-log").onclick = () => {
    $("#detail").close();
    openJobLog(job.id);
  };
  $("#job-steer").disabled = !["approval", "run", "queued"].includes(job.state);
  $("#job-steer").onclick = () => {
    $("#detail").close();
    current.selected = job.id;
    current.steerJob = job.id;
    openTab("chat");
    $("#draft").focus();
  };
  $("#job-stop").disabled = !["approval", "run", "queued"].includes(job.state);
  $("#job-stop").onclick = () => {
    $("#detail").close();
    stopJob(current, job);
  };
}
function drawTasks() {
  const target = $("#tasks");
  target.innerHTML = current.jobs
    .filter((job) => activeStates.includes(job.state))
    .map(
      (job) =>
        '<article class="task"><button class="task-title" data-job="' +
        job.id +
        '">' +
        safe(job.title) +
        '</button><span class="task-phase">' +
        safe(
          job.state === "stopping"
            ? "중단 중"
            : job.state === "queued"
              ? "앞 업무 대기"
              : stageLabel(job),
        ) +
        "</span>" +
        (job.state === "approval"
          ? '<button class="chip pending" data-question="' +
            job.id +
            '" aria-label="' +
            safe(job.title) +
            ' 승인 질문으로 이동">승인 대기</button>'
          : "") +
        "</article>",
    )
    .join("");
  target.querySelectorAll("[data-job]").forEach(
    (button) =>
      (button.onclick = () => {
        const job = current.jobs.find(
          (job) => job.id === Number(button.dataset.job),
        );
        current.selected = job.id;
        drawActors();
        drawComposer();
        jobDetail(job);
      }),
  );
  target.querySelectorAll("[data-question]").forEach(
    (button) =>
      (button.onclick = () => {
        current.approvalFocus = Number(button.dataset.question);
        drawDecision();
        $("#decision [data-allow]").focus();
      }),
  );
}

function drawDecision() {
  const box = $("#decision");
  const waiting = current.jobs.filter((job) => job.state === "approval");
  const job =
    waiting.find((job) => job.id === current.approvalFocus) || waiting[0];
  const focused = box.contains(document.activeElement)
    ? document.activeElement
    : null;
  const focusedAction = focused?.hasAttribute("data-allow")
    ? "[data-allow]"
    : "[data-deny]";
  box.hidden = !job;
  if (!job) {
    box.replaceChildren();
    return;
  }
  box.innerHTML =
    '<section aria-label="승인 요청"><small>' +
    safe(job.title) +
    "</small><p>" +
    safe(job.question.text) +
    '</p><p class="decision-scope">' +
    safe(job.question.detail) +
    '</p><div class="decision-actions">' +
    '<button class="primary" data-allow="' +
    job.id +
    '">허용</button>' +
    '<button class="secondary" data-deny="' +
    job.id +
    '">거절</button></div></section>';
  box.querySelector("[data-allow]").onclick = () => decide(job, true);
  box.querySelector("[data-deny]").onclick = () => decide(job, false);
  if (
    focused?.dataset.allow === String(job.id) ||
    focused?.dataset.deny === String(job.id)
  )
    box.querySelector(focusedAction).focus();
}

function openJobLog(id) {
  logJob = id;
  openTab("log");
}

function drawMessages() {
  const space = $("#messages");
  if (!current.messages.length) {
    space.innerHTML =
      '<div class="chat-start"><h2>무엇을 맡길까요?</h2>' +
      (project === exampleProject
        ? '<button class="secondary" id="example-request">빈 검색어 처리 점검</button>'
        : "") +
      "</div>";
    const example = $("#example-request");
    if (example)
      example.onclick = () => {
        $("#draft").value = exampleRequest;
        current.draft = $("#draft").value;
        drawComposer();
        $("#draft").focus();
      };
    return;
  }
  const atBottom =
    space.scrollHeight - space.scrollTop - space.clientHeight < 36;
  const latestStopByJob = new Map(
    current.messages
      .filter((message) => message.stopped)
      .map((message) => [message.jobId, message]),
  );
  space.innerHTML = current.messages
    .filter((message) => !message.approvalId || message.answer)
    .map((message) => {
      const job = current.jobs.find((item) => item.id === message.jobId);
      const resume =
        job?.state === "stopped" && latestStopByJob.get(job.id) === message;
      const result =
        job &&
        !message.user &&
        !message.stopped &&
        ["done", "denied"].includes(job.state);
      return (
        '<div class="bubble' +
        (message.user ? " user" : "") +
        '" aria-label="' +
        (message.user ? "나" : "비서") +
        '">' +
        safe(message.text) +
        (message.answer
          ? '<small class="answered">' + safe(message.answer) + "</small>"
          : "") +
        (resume
          ? '<button data-resume="' + job.id + '">이어가기</button>'
          : "") +
        (result
          ? '<button data-job-result="' +
            job.id +
            '">이 업무 기록 보기</button>'
          : "") +
        "</div>"
      );
    })
    .join("");
  space
    .querySelectorAll("[data-resume]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          resume(
            current.jobs.find(
              (job) => job.id === Number(button.dataset.resume),
            ),
          )),
    );
  space
    .querySelectorAll("[data-job-result]")
    .forEach(
      (button) =>
        (button.onclick = () => openJobLog(Number(button.dataset.jobResult))),
    );
  if (atBottom) space.scrollTop = space.scrollHeight;
}

function drawComposer() {
  const job = activeJob(current);
  const hasDraft = !!$("#draft").value.trim();
  $("#commands").hidden =
    !/^\/c?l?e?a?r?$/.test($("#draft").value.trim()) ||
    $("#draft").value.trim() === "/clear";
  const directed = current.jobs.find(
    (item) =>
      item.id === current.steerJob &&
      ["run", "approval", "queued"].includes(item.state),
  );
  const target = $("#target");
  target.replaceChildren();
  if (directed) {
    target.append("추가 지시 · " + directed.title + " ");
    const clear = document.createElement("button");
    clear.type = "button";
    clear.ariaLabel = "추가 지시 대상 해제";
    clear.textContent = "×";
    clear.onclick = () => {
      current.steerJob = null;
      drawComposer();
      $("#draft").focus();
    };
    target.append(clear);
  } else if (job) {
    target.textContent =
      (job.state === "stopping" ? "중단 중 · " : "멈춤 대상 · ") + job.title;
  }
  const send =
    '<button class="iconbtn send" type="submit" title="보내기" aria-label="보내기" ' +
    (hasDraft ? "" : "disabled") +
    ">" +
    icon("send") +
    "</button>";
  const stop = job
    ? '<button class="iconbtn stop" id="stop" type="button" title="' +
      safe(job.title) +
      ' 멈춤" aria-label="' +
      safe(job.title) +
      ' 멈춤" ' +
      (job.state === "stopping" ? "disabled" : "") +
      ">" +
      icon("stop") +
      "</button>"
    : "";
  $("#actions").innerHTML = (hasDraft || !job ? send : "") + stop;
  if (job)
    $("#stop").onclick = (e) => {
      if (e.detail < 2) stopJob(current, job);
    };
}
function drawLog() {
  const panel = $("#log");
  const job = current.jobs.find((item) => item.id === logJob);
  const events = current.events.filter(
    (event) => !job || event.jobId === job.id,
  );
  const fromFilter = job
    ? '<button class="text-action" id="all-log">← 전체 기록</button>'
    : "";
  panel.innerHTML =
    fromFilter +
    "<h2>" +
    (job ? safe(job.title) : "업무 기록") +
    "</h2>" +
    (events.length
      ? events
          .map((event) => {
            const evidence = event.details
              ? '<details class="log-evidence"><summary>완료 조건</summary><p>' +
                safe(event.details) +
                "</p></details>"
              : "";
            return (
              '<div class="logrow"><time>' +
              safe(event.time) +
              "</time><div><strong>" +
              safe(event.role) +
              "</strong><p>" +
              safe(event.text) +
              "</p>" +
              evidence +
              "</div></div>"
            );
          })
          .join("")
      : '<p class="empty">업무가 시작되면 여기에 기록돼요.</p>');
  if (job)
    $("#all-log").onclick = () => {
      logJob = null;
      drawLog();
    };
}
function drawMemory() {
  const panel = $("#memory");
  const navigation =
    '<div class="memory-navigation" aria-label="메모리 범위">' +
    [
      ["wiki", "프로젝트 위키"],
      ["agents", "에이전트 기억"],
    ]
      .map(
        ([value, label]) =>
          '<button data-memory-view="' +
          value +
          '" aria-pressed="' +
          (project.memoryView === value) +
          '">' +
          label +
          "</button>",
      )
      .join("") +
    "</div>";
  panel.innerHTML = navigation;
  panel.querySelectorAll("[data-memory-view]").forEach(
    (button) =>
      (button.onclick = () => {
        project.memoryView = button.dataset.memoryView;
        panel.scrollTop = 0;
        drawMemory();
        panel
          .querySelector('[data-memory-view="' + project.memoryView + '"]')
          .focus();
      }),
  );
  if (project.memoryView === "agents") {
    panel.insertAdjacentHTML(
      "beforeend",
      project.crew
        .map((agent, index) => {
          const notes = project.personalMemory[index] || [];
          const expanded = project.agentMemory === index;
          return (
            '<section class="agent-memory"><button class="memory-card" data-note="' +
            index +
            '" aria-expanded="' +
            expanded +
            '"><strong>' +
            safe(agent.role) +
            " · " +
            safe(agent.name) +
            "</strong><small>" +
            notes.length +
            "개</small></button>" +
            (expanded
              ? '<div class="memory-note">' +
                (notes.length
                  ? notes.map((note) => "<p>" + safe(note) + "</p>").join("")
                  : '<p class="empty">아직 남긴 기억이 없어요.</p>') +
                "</div>"
              : "") +
            "</section>"
          );
        })
        .join(""),
    );
    panel.querySelectorAll("[data-note]").forEach(
      (button) =>
        (button.onclick = () => {
          const index = Number(button.dataset.note);
          project.agentMemory = project.agentMemory === index ? null : index;
          drawMemory();
          panel.querySelector('[data-note="' + index + '"]').focus();
        }),
    );
    return;
  }

  const article = project.memories.find(
    (item) => item.id === project.wikiArticle,
  );
  if (article) {
    panel.insertAdjacentHTML(
      "beforeend",
      '<article class="wiki-article"><button class="text-action" id="wiki-back">← 위키 돌아가기</button><h2>' +
        safe(article.title) +
        "</h2><small>" +
        safe(article.by) +
        " · " +
        safe(article.source) +
        "</small><p>" +
        safe(article.body) +
        "</p>" +
        (article.links || [])
          .map((id) => project.memories.find((item) => item.id === id))
          .filter(Boolean)
          .map(
            (item) =>
              '<button class="text-action" data-linked="' +
              safe(item.id) +
              '">→ ' +
              safe(item.title) +
              "</button>",
          )
          .join("") +
        "</article>",
    );
    $("#wiki-back").onclick = () => {
      project.wikiArticle = null;
      drawMemory();
      const noteIndex = project.memories.indexOf(article);
      panel.querySelector('[data-memory="' + noteIndex + '"]')?.focus();
    };
    panel
      .querySelectorAll("[data-linked]")
      .forEach(
        (button) =>
          (button.onclick = () => openWikiArticle(button.dataset.linked)),
      );
    return;
  }

  panel.insertAdjacentHTML(
    "beforeend",
    '<div class="wiki-heading"><div aria-label="위키 보기">' +
      ["목록", "노드"]
        .map(
          (view) =>
            '<button data-view="' +
            view +
            '" aria-pressed="' +
            (project.wikiView === view) +
            '">' +
            view +
            "</button>",
        )
        .join("") +
      "</div></div>" +
      (project.wikiView === "노드"
        ? wikiGraph(project.memories)
        : project.memories
            .map(
              (item, index) =>
                '<button class="memory-card" data-memory="' +
                index +
                '"><strong>' +
                safe(item.title) +
                "</strong><small>" +
                safe(item.by) +
                " · " +
                safe(item.source) +
                "</small></button>",
            )
            .join("") || '<p class="empty">아직 문서가 없어요.</p>'),
  );
  document.querySelectorAll("[data-view]").forEach(
    (b) =>
      (b.onclick = () => {
        project.wikiView = b.dataset.view;
        drawMemory();
      }),
  );
  panel
    .querySelectorAll("[data-memory]")
    .forEach(
      (button) =>
        (button.onclick = () =>
          openWikiArticle(project.memories[Number(button.dataset.memory)].id)),
    );
}

function openWikiArticle(id) {
  project.wikiArticle = id;
  drawMemory();
  $("#memory").scrollTop = 0;
  $("#wiki-back").focus();
}

function drawContext() {
  $("#project-name").textContent = project.name;
  $("#workspace-open").title = "프로젝트 폴더 선택 · " + project.name;
  const waiting = project.sessions
    .filter((s) => s !== current)
    .reduce(
      (n, s) => n + s.jobs.filter((j) => j.state === "approval").length,
      0,
    );
  $("#session-waiting").textContent = waiting ? "대기 " + waiting : "";
  $("#session-waiting").hidden = !waiting;
  $("#session-open").setAttribute(
    "aria-label",
    waiting ? "세션 목록 · 답변 대기 " + waiting + "건" : "세션 목록",
  );
  $("#approval-name").textContent = "승인 " + project.approval;
}
function render() {
  drawContext();
  drawRoster();
  drawActors();
  drawTasks();
  drawMessages();
  drawDecision();
  drawComposer();
  drawLog();
  drawMemory();
}
function openTab(name) {
  closeSessionList();
  if (composerMenu.matches(":popover-open")) composerMenu.hidePopover();
  tab = name;
  for (const el of document.querySelectorAll("[data-tab]"))
    el.setAttribute("aria-current", String(el.dataset.tab === tab));
  ["chat", "log", "memory", "flow"].forEach(
    (key) => ($("#" + key).hidden = key !== tab),
  );
  document.body.classList.remove("camp-visible");
  $("#mobile-switch").textContent = "캠프 보기";
  render();
  if (name === "flow") showWorkflow(project);
}
function switchSession(session) {
  current.draft = $("#draft").value;
  current.project.lastSession = current;
  if (project !== session.project) releaseWorkflow();
  project = session.project;
  current = session;
  $("#draft").value = session.draft;
  logJob = null;
  openTab("chat");
  $("#messages").scrollTop = $("#messages").scrollHeight;
}
function submit() {
  const text = $("#draft").value.trim();
  if (!text) return;
  $("#draft").value = "";
  current.draft = "";
  if (text === "/clear") {
    switchSession(newSession());
    return;
  }
  if (!current.messages.some((message) => message.user))
    current.name =
      text === exampleRequest
        ? "빈 검색어 처리 점검"
        : text.replace(/\s+/g, " ").trim().slice(0, 70);
  current.messages.push({ text, user: true });
  respondToRequest(text);
  render();
  $("#messages").scrollTop = $("#messages").scrollHeight;
}

function respondToRequest(text) {
  const jobs = current.jobs.filter((job) => activeStates.includes(job.state));
  if (text.includes("/clear")) {
    reply(
      current,
      "/clear만 보내면 같은 크루 설정으로 빈 세션을 시작해요. 기존 업무는 원래 세션에서 이어져요.",
    );
    return;
  }
  if (
    /(상태|진행|어디까지|무슨 일|뭐 하고)/.test(text) &&
    /(알려|보여|하고 있|됐|어때|이야|\?$)/.test(text)
  ) {
    const statusJobs = /프로젝트/.test(text)
      ? project.sessions
          .flatMap((session) => session.jobs)
          .filter((job) => activeStates.includes(job.state))
      : jobs;
    reply(
      current,
      statusJobs.length
        ? statusJobs
            .map(
              (job) =>
                job.title +
                " · " +
                stageLabel(job) +
                (job.state === "approval"
                  ? " 승인 대기"
                  : job.state === "stopping"
                    ? " 중단 중"
                    : job.state === "queued"
                      ? " 앞 업무 대기"
                      : " 진행 중"),
            )
            .join("\n")
        : (/프로젝트/.test(text) ? "이 프로젝트에" : "이 대화에서") +
            " 진행 중인 업무가 없어요.",
    );
    return;
  }
  const asking = /요약|보여|알려|뭐가|무엇/.test(text);
  if (asking && /기억|메모리/.test(text) && !/위키/.test(text)) {
    const agentIndex = project.crew.findIndex(
      (agent) =>
        text.includes(agent.name) || text.includes(agent.role + " 담당"),
    );
    if (agentIndex === -1) {
      reply(
        current,
        "어느 담당자의 기억을 볼까요? 범례에서 담당자의 기억을 바로 열 수 있어요.",
      );
    } else {
      const notes = project.personalMemory[agentIndex] || [];
      reply(
        current,
        notes.length
          ? notes.join("\n")
          : project.crew[agentIndex].name + "이 남긴 기억이 없어요.",
      );
    }
    return;
  }
  if (/위키|메모리|메모/.test(text) && /요약|보여|알려|뭐가|무엇/.test(text)) {
    const wiki = project.memories;
    reply(
      current,
      wiki.length
        ? wiki
            .slice(0, 3)
            .map((item) => item.title + " · " + item.body)
            .join("\n")
        : "이 프로젝트에 등록된 위키 문서가 없어요.",
    );
    return;
  }
  const directed = jobs.find(
    (job) => job.state !== "stopping" && job.id === current.steerJob,
  );
  const fresh = /새 업무|새 작업|별도 업무|별도 작업/.test(text);
  if (directed && !fresh) {
    record(current, "비서", "추가 지시 · " + text, directed);
    reply(current, "「" + directed.title + "」에 추가 지시를 전달했어요.");
    current.steerJob = null;
    return;
  }
  if (!fresh && /^(그거|거기에|아까|이어서|추가로)/.test(text)) {
    reply(
      current,
      "어느 업무에 대한 지시인지 알려주세요. 업무명을 열어 ‘추가 지시’를 눌러도 돼요.",
    );
    return;
  }
  current.steerJob = null;
  const title =
    text === exampleRequest
      ? "빈 검색어 처리 점검"
      : text.replace(/\s+/g, " ").trim().slice(0, 70);
  startJob(current, title);
}
$("#composer").onsubmit = (e) => {
  e.preventDefault();
  submit();
};
$("#draft").oninput = () => {
  current.draft = $("#draft").value;
  drawComposer();
};
$("#draft").onkeydown = (e) => {
  if (e.key === "Escape") {
    $("#commands").hidden = true;
    return;
  }
  if (e.key === "Enter" && !e.shiftKey && !e.isComposing && e.keyCode !== 229) {
    e.preventDefault();
    if (e.repeat) return;
    if (!$("#commands").hidden) $("#fill-clear").click();
    else submit();
  }
};
$("#fill-clear").onclick = () => {
  $("#draft").value = "/clear";
  current.draft = "/clear";
  drawComposer();
  $("#draft").focus();
};
$("#roster-head").onclick = (e) => {
  const button = e.currentTarget;
  $("#roster-body").hidden = !$("#roster-body").hidden;
  button.setAttribute("aria-expanded", String(!$("#roster-body").hidden));
};
document.querySelectorAll("[data-tab]").forEach(
  (el) =>
    (el.onclick = () => {
      logJob = null;
      openTab(el.dataset.tab);
    }),
);
function selectProject(entry) {
  $("#composer-menu").hidePopover();
  if (entry !== project) switchSession(entry.lastSession || newSession(entry));
}

function sessionSummary(session) {
  const pending = session.jobs.filter((j) => j.state === "approval").length;
  const running = session.jobs.filter((j) => j.state === "run").length;
  const queued = session.jobs.filter((j) => j.state === "queued").length;
  return [
    session === current ? "현재" : "",
    pending ? "내 답변 대기 " + pending + "건" : "",
    running ? "진행 " + running + "건" : "",
    queued ? "앞 업무 대기 " + queued + "건" : "",
    session.events[0]?.time || "",
    session.draft ? "작성 중" : "",
    !session.messages.length ? "첫 요청 대기" : "",
  ]
    .filter(Boolean)
    .join(" · ");
}
const composerMenu = $("#composer-menu");
let composerMenuSource;
function openComposerMenu(button, label, content) {
  if (composerMenuSource === button && composerMenu.matches(":popover-open")) {
    composerMenu.hidePopover();
    return false;
  }
  composerMenuSource?.setAttribute("aria-expanded", "false");
  composerMenuSource = button;
  composerMenu.setAttribute("aria-label", label);
  composerMenu.innerHTML = content;
  composerMenu.showPopover({ source: button });
  button.setAttribute("aria-expanded", "true");
  positionComposerMenu();
  composerMenu.querySelector("button")?.focus();
  return true;
}
function positionComposerMenu() {
  if (!composerMenu.matches(":popover-open")) return;
  const rect = composerMenuSource.getBoundingClientRect();
  composerMenu.style.setProperty(
    "--menu-left",
    Math.max(
      8,
      Math.min(rect.left, window.innerWidth - composerMenu.offsetWidth - 8),
    ) + "px",
  );
  composerMenu.style.setProperty(
    "--menu-bottom",
    Math.max(8, window.innerHeight - rect.top + 6) + "px",
  );
}
window.addEventListener("resize", positionComposerMenu);
composerMenu.addEventListener("toggle", () => {
  if (!composerMenu.matches(":popover-open"))
    composerMenuSource?.setAttribute("aria-expanded", "false");
});
function openProjects() {
  const opened = openComposerMenu(
    $("#workspace-open"),
    "프로젝트 폴더",
    '<button id="choose-folder" class="secondary">폴더 열기…</button><input id="directory" type="file" webkitdirectory hidden><p id="folder-status" role="status"></p>' +
      projects
        .map(
          (entry, i) =>
            '<button class="session-row" data-project="' +
            i +
            '"><strong>' +
            safe(entry.name) +
            "</strong><small>" +
            (entry === project ? "현재 폴더 · " : "") +
            "대화 " +
            entry.sessions.length +
            "개</small></button>",
        )
        .join(""),
  );
  if (!opened) return;
  document
    .querySelectorAll("[data-project]")
    .forEach(
      (b) => (b.onclick = () => selectProject(projects[+b.dataset.project])),
    );
  const input = $("#directory");
  input.onchange = () => {
    const name = input.files[0]?.webkitRelativePath.split("/")[0];
    if (name) selectProject(makeProject(name));
    else
      $("#folder-status").textContent =
        "이 브라우저에서는 파일이 있는 폴더를 선택해 주세요.";
  };
  $("#choose-folder").onclick = async () => {
    if (!window.showDirectoryPicker) {
      $("#folder-status").textContent =
        "파일이 있는 폴더를 선택해 주세요. 목업은 폴더 이름만 사용합니다.";
      input.click();
      return;
    }
    try {
      const handle = await window.showDirectoryPicker({ mode: "read" });
      for (const entry of projects) {
        if (entry.handle && (await handle.isSameEntry(entry.handle))) {
          selectProject(entry);
          return;
        }
      }
      selectProject(makeProject(handle.name, handle));
    } catch (error) {
      if (error.name === "AbortError") return;
      $("#folder-status").textContent =
        "브라우저가 폴더 접근을 제한했어요. 파일이 있는 폴더를 다시 선택해 주세요.";
      $("#choose-folder").onclick = () => input.click();
    }
  };
}
const sessionToggle = $("#session-open");
const sessionList = $("#session-list");

function closeSessionList() {
  sessionList.hidden = true;
  sessionToggle.setAttribute("aria-expanded", "false");
}

sessionToggle.onclick = () => {
  if (!sessionList.hidden) {
    closeSessionList();
    return;
  }

  sessionList.innerHTML =
    '<li><button class="session-option" id="new-session">＋ 새 대화</button></li>' +
    project.sessions
      .map(
        (session, index) =>
          '<li><button class="session-option" data-session="' +
          index +
          '"' +
          (session === current ? ' aria-current="true"' : "") +
          "><strong>" +
          safe(session.name) +
          "</strong><small>" +
          safe(sessionSummary(session)) +
          "</small></button></li>",
      )
      .reverse()
      .join("");

  $("#new-session").onclick = () => {
    closeSessionList();
    switchSession(newSession());
    $("#draft").focus();
  };
  sessionList.querySelectorAll("[data-session]").forEach((button) => {
    button.onclick = () => {
      closeSessionList();
      switchSession(project.sessions[Number(button.dataset.session)]);
      sessionToggle.focus();
    };
  });
  sessionList.hidden = false;
  sessionToggle.setAttribute("aria-expanded", "true");
};

document.addEventListener("click", (event) => {
  if (
    !sessionToggle.contains(event.target) &&
    !sessionList.contains(event.target)
  )
    closeSessionList();
});
document.addEventListener("keydown", (event) => {
  if (event.key === "Escape" && !sessionList.hidden) {
    closeSessionList();
    sessionToggle.focus();
  }
});
$("#workspace-open").onclick = openProjects;
$("#approval-open").onclick = () => {
  const descriptions = {
    수동: "권한 요청마다 대화에서 직접 허용하거나 거절합니다.",
    자동: "비서가 업무 목적과 범위에 따라 판단합니다. 목업에서는 프로젝트 안의 조회·수정은 허용하고 외부 전달은 사용자에게 묻습니다.",
    항상: "이 프로젝트에서 요청하는 모든 앱 권한을 자동 승인합니다.",
  };
  const opened = openComposerMenu(
    $("#approval-open"),
    "승인 모드 · " + project.name,
    Object.entries(descriptions)
      .map(
        ([mode, help]) =>
          '<button class="session-row" data-mode="' +
          mode +
          '"><strong>' +
          mode +
          (project.approval === mode ? " · 현재" : "") +
          "</strong><small>" +
          help +
          "</small></button>",
      )
      .join("") + "<small>다음 권한 요청부터 적용됩니다.</small>",
  );
  if (!opened) return;
  document.querySelectorAll("[data-mode]").forEach(
    (b) =>
      (b.onclick = () => {
        project.approval = b.dataset.mode;
        record(current, "사용자", "프로젝트 승인 모드 · " + project.approval);
        composerMenu.hidePopover();
        $("#approval-open").focus();
        render();
      }),
  );
};
$("#mobile-switch").onclick = () => {
  const shown = document.body.classList.toggle("camp-visible");
  $("#mobile-switch").textContent = shown ? "작업 보기" : "캠프 보기";
};
current = newSession();
openTab("chat");

window.setInterval(() => {
  if (document.hidden || $("#detail").open) return;
  campBeat++;
  drawActors();
}, 5000);
