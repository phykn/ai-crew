"use strict";

const $ = (selector) => document.querySelector(selector);
const paths = {
  fire: "M13 2c1 6-4 7-2 11 2-1 3-3 3-6 4 3 6 6 5 10-1 4-5 6-9 5-5-1-7-5-6-9 1-2 2-4 5-7-1 5 0 6 1 6-1-4 4-6 3-10Z",
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
  motion:
    "m3 8 5-3m-6 9 5-2m3 6 4-9 5 2 2-3m-9 6 5 5m-5-8-4 2m8-9a1.5 1.5 0 1 0 .1 0",
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
];
const steps = [
  { label: "전략 검토", role: 3 },
  { label: "개발 중", role: 1 },
  { label: "코드 리뷰", role: 3 },
  { label: "테스트 중", role: 2 },
];
const exampleMemories = [
  {
    title: "검색 입력 처리",
    body: "검색어 양끝의 공백을 제거한 뒤 검색 조건을 적용한다.",
    by: "개발",
    source: "검색 개선",
  },
];
const projects = [];
function makeProject(name, handle = null) {
  const entry = {
    name,
    handle,
    sessions: [],
    memories: [],
    crew: defaultCrew.map((agent) => ({ ...agent })),
    lastSession: null,
  };
  projects.push(entry);
  return entry;
}
const exampleProject = makeProject("ai-crew");
exampleProject.memories = exampleMemories;
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
let quiet = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const reply = (session, text, jobId, stopped = false) =>
  session.messages.push({ text, jobId, stopped });
function newSession(owner = project) {
  const session = {
    project: owner,
    name: "세션 " + String(owner.sessions.length + 1).padStart(2, "0"),
    messages: [],
    jobs: [],
    events: [],
    selected: null,
    draft: "",
  };
  owner.sessions.push(session);
  return session;
}
function record(session, role, text, job) {
  session.events.unshift({
    role,
    text,
    jobId: job?.id,
    time: new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    }),
  });
}
function activeJob(session) {
  return session.jobs.find(
    (job) =>
      job.id === session.selected && ["run", "stopping"].includes(job.state),
  );
}
function startJob(session, title, step = 0) {
  const job = { id: nextId++, title, state: "run", step };
  session.jobs.push(job);
  session.selected = job.id;
  record(session, "비서", title + " 업무를 배정했어요.", job);
  schedule(session, job);
  return job;
}
function schedule(session, job) {
  clearTimeout(job.timer);
  job.timer = setTimeout(() => {
    if (job.state !== "run") return;
    if (job.step === steps.length - 1) {
      job.state = "done";
      record(session, "테스트", "검증 완료 · 모의 테스트 통과", job);
      reply(
        session,
        "「" +
          job.title +
          "」의 리뷰와 테스트가 끝났어요. 로그에서 단계별 기록을 볼 수 있어요.",
        job.id,
      );
      if (!session.project.memories.some((item) => item.source === job.title))
        session.project.memories.push({
          title: job.title + " 검증 기록",
          body: "코드 리뷰와 테스트 단계를 거쳐 완료했다.",
          by: "테스트",
          source: job.title,
        });
    } else {
      job.step++;
      record(
        session,
        session.project.crew[steps[job.step].role].role,
        steps[job.step].label,
        job,
      );
      schedule(session, job);
    }
    if (session === current) render();
  }, 22000);
}
function stopJob(session, job) {
  if (job.state !== "run") return;
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
    if (session === current) render();
  }, 700);
}
function resume(job) {
  if (job.state !== "stopped") return;
  job.state = "run";
  current.selected = job.id;
  record(current, "비서", "마지막 단계에서 이어가기", job);
  schedule(current, job);
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
        i +
        '.webp)"></span><small>' +
        agent.role +
        '</small><button class="crew-name" data-name="' +
        i +
        '" title="별명 변경">' +
        safe(agent.name) +
        '</button><button class="model" data-detail="' +
        i +
        '" aria-label="' +
        agent.role +
        ' 모델 선택">' +
        agent.model +
        '</button><button class="row-detail" data-detail="' +
        i +
        '" aria-label="' +
        agent.role +
        ' 스킬">' +
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
    const job = current.jobs.find(
      (j) => j.state === "run" && steps[j.step].role === i,
    );
    let actor = land.querySelector('[data-actor="' + i + '"]');
    if (!actor) {
      actor = document.createElement("button");
      actor.dataset.actor = i;
      actor.innerHTML =
        '<span class="actor-label"></span><img alt="" src="assets/crew-' +
        i +
        '.webp">';
      land.append(actor);
    }
    actor.className = "actor" + (job ? " work" : "");
    actor.style.setProperty("--agent", agent.color);
    const offset =
      quiet || job || !campBeat
        ? [0, 0]
        : campsites[(campBeat + i) % campsites.length];
    actor.style.left = agent.x + (job ? 2 : offset[0]) + "%";
    actor.style.top = agent.y + offset[1] + "%";
    actor.querySelector("span").innerHTML =
      "<strong>" +
      safe(agent.name) +
      "</strong>" +
      (job
        ? safe(steps[job.step].label)
        : !quiet &&
            campBeat > 0 &&
            campBeat % 3 === 1 &&
            i === campBeat % project.crew.length
          ? remarks[i]
          : "");
    actor.onclick = () => (job ? jobDetail(job) : agentDetail(i));
  });
}
function jobDetail(job) {
  modal(
    job.title,
    "<p>" +
      safe(steps[job.step].label) +
      " · " +
      safe(project.crew[steps[job.step].role].name) +
      '</p><div class="dialog-actions"><button id="job-log" class="secondary">업무 로그</button><button id="job-steer" class="secondary">추가 지시</button><button id="job-stop" class="secondary">멈춤</button></div>',
  );
  $("#job-log").onclick = () => {
    $("#detail").close();
    logJob = job.id;
    openTab("log");
  };
  $("#job-steer").onclick = () => {
    $("#detail").close();
    current.selected = job.id;
    openTab("chat");
    $("#draft").focus();
  };
  $("#job-stop").disabled = job.state !== "run";
  $("#job-stop").onclick = () => {
    $("#detail").close();
    stopJob(current, job);
  };
}
function drawTasks() {
  $("#tasks").innerHTML = current.jobs
    .filter((j) => ["run", "stopping"].includes(j.state))
    .map((job) => {
      const phase =
        job.state === "stopping" ? "중단 중" : steps[job.step].label;
      return (
        '<article class="task"><div class="task-head">' +
        icon("pin") +
        '진행 중인 업무</div><button class="task-main" data-job="' +
        job.id +
        '"><span>' +
        safe(job.title) +
        '</span><span class="chip"><i class="dot"></i>' +
        phase +
        '</span></button><div class="route" aria-hidden="true">' +
        steps
          .map(
            (_, i) =>
              '<i class="' +
              (i === job.step ? "now" : i < job.step ? "passed" : "") +
              '"></i>',
          )
          .join("") +
        "</div></article>"
      );
    })
    .join("");
  document.querySelectorAll("[data-job]").forEach(
    (el) =>
      (el.onclick = () => {
        const job = current.jobs.find((j) => j.id === +el.dataset.job);
        current.selected = job.id;
        drawComposer();
        jobDetail(job);
      }),
  );
}
function drawMessages() {
  const space = $("#messages");
  const atBottom =
    space.scrollHeight - space.scrollTop - space.clientHeight < 36;
  space.innerHTML = current.messages
    .map((m) => {
      const job = current.jobs.find((j) => j.id === m.jobId);
      const latestStop =
        m.stopped &&
        !current.messages
          .slice(current.messages.indexOf(m) + 1)
          .some((later) => later.stopped && later.jobId === m.jobId);
      const action =
        latestStop && job?.state === "stopped"
          ? '<button data-resume="' +
            job.id +
            '">마지막 단계에서 이어가기</button>'
          : "";
      return (
        '<div class="bubble' +
        (m.user ? " user" : "") +
        '" aria-label="' +
        (m.user ? "나" : "비서") +
        '">' +
        safe(m.text) +
        action +
        "</div>"
      );
    })
    .join("");
  space
    .querySelectorAll("[data-resume]")
    .forEach(
      (el) =>
        (el.onclick = () =>
          resume(current.jobs.find((j) => j.id === +el.dataset.resume))),
    );
  if (atBottom) space.scrollTop = space.scrollHeight;
}
function drawComposer() {
  const job = activeJob(current);
  const hasDraft = !!$("#draft").value.trim();
  $("#commands").hidden =
    !/^\/c?l?e?a?r?$/.test($("#draft").value.trim()) ||
    $("#draft").value.trim() === "/clear";
  $("#target").textContent = job
    ? job.title +
      " · " +
      (job.state === "stopping" ? "중단 중" : steps[job.step].label)
    : "";
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
  const job = current.jobs.find((j) => j.id === logJob);
  const events = current.events.filter((e) => !job || e.jobId === job.id);
  $("#log").innerHTML =
    "<h2>" +
    (job ? safe(job.title) : "업무 기록") +
    "</h2>" +
    (job ? '<button class="text-action" id="all-log">전체 기록</button>' : "") +
    (events.length
      ? events
          .map(
            (e) =>
              '<div class="logrow"><time>' +
              safe(e.time) +
              "</time><div><strong>" +
              safe(e.role) +
              "</strong><p>" +
              safe(e.text) +
              "</p></div></div>",
          )
          .join("")
      : '<p class="empty">아직 기록된 활동이 없어요.</p>');
  if (job)
    $("#all-log").onclick = () => {
      logJob = null;
      drawLog();
    };
}
function drawMemory() {
  $("#memory").innerHTML =
    "<h2>프로젝트 위키</h2>" +
    project.memories
      .map(
        (item, i) =>
          '<button class="memory-card" data-memory="' +
          i +
          '"><strong>' +
          safe(item.title) +
          "</strong><small>" +
          safe(item.by) +
          " · " +
          safe(item.source) +
          "</small></button>",
      )
      .join("") +
    "<h3>에이전트별 메모리</h3>" +
    project.crew
      .map(
        (agent, i) =>
          '<button class="session-row" data-note="' +
          i +
          '">' +
          safe(agent.role) +
          " · " +
          safe(agent.name) +
          "</button>",
      )
      .join("");
  document.querySelectorAll("[data-memory]").forEach(
    (el) =>
      (el.onclick = () => {
        const entry = project.memories[+el.dataset.memory];
        modal(
          entry.title,
          "<p>" +
            safe(entry.body) +
            "</p><small>작성 · " +
            safe(entry.by) +
            "　출처 · " +
            safe(entry.source) +
            "</small>",
        );
      }),
  );
  document.querySelectorAll("[data-note]").forEach(
    (el) =>
      (el.onclick = () => {
        const agent = project.crew[+el.dataset.note];
        modal(
          agent.name + "의 기억",
          "<p>" +
            safe(
              project === exampleProject && agent.role === "개발"
                ? "검색 조건을 바꾸기 전에 기존 공백 처리 규칙을 확인한다."
                : "아직 남긴 기억이 없어요.",
            ) +
            "</p>",
        );
      }),
  );
}
function render() {
  $("#project-name").textContent = project.name;
  $("#session-name").textContent = current.name;
  drawRoster();
  drawActors();
  drawTasks();
  drawMessages();
  drawComposer();
  drawLog();
  drawMemory();
}
function openTab(name) {
  tab = name;
  for (const el of document.querySelectorAll("[data-tab]"))
    el.setAttribute("aria-current", String(el.dataset.tab === tab));
  ["chat", "log", "memory"].forEach(
    (key) => ($("#" + key).hidden = key !== tab),
  );
  document.body.classList.remove("camp-visible");
  $("#mobile-switch").textContent = "캠프 보기";
  render();
}
function switchSession(session) {
  current.draft = $("#draft").value;
  current.project.lastSession = current;
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
  current.messages.push({ text, user: true });
  const job = activeJob(current);
  if (text.includes("/clear"))
    reply(
      current,
      "/clear만 보내면 같은 크루 설정으로 빈 세션을 시작해요. 기존 업무는 원래 세션에서 이어져요.",
    );
  else if (job && job.state === "run") {
    record(current, "비서", "추가 지시 · " + text, job);
    reply(current, "「" + job.title + "」에 추가 지시를 전달했어요.");
    job.step = 1;
    schedule(current, job);
  } else {
    const title = text.length > 26 ? text.slice(0, 25) + "…" : text;
    startJob(current, title);
    reply(current, "요청을 접수했어요. 크루가 전략 검토부터 시작할게요.");
  }
  render();
  $("#messages").scrollTop = $("#messages").scrollHeight;
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
  $("#detail").close();
  if (entry !== project) switchSession(entry.lastSession || newSession(entry));
}

function openProjects() {
  modal(
    "프로젝트 폴더",
    projects
      .map(
        (entry, index) =>
          '<button class="session-row" data-project="' +
          index +
          '"><strong>' +
          safe(entry.name) +
          (entry === project ? " · 현재" : "") +
          "</strong><small>" +
          (entry === exampleProject ? "예시 프로젝트 · " : "") +
          "세션 " +
          entry.sessions.length +
          "개</small></button>",
      )
      .join("") +
      '<button id="choose-folder" class="primary">프로젝트 폴더 열기…</button><input id="directory" type="file" webkitdirectory hidden><p id="folder-status" role="status"></p>',
  );
  document.querySelectorAll("[data-project]").forEach((button) => {
    button.onclick = () =>
      selectProject(projects[Number(button.dataset.project)]);
  });
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
$("#project-open").onclick = openProjects;
$("#session-open").onclick = () => {
  modal(
    "세션",
    project.sessions
      .map(
        (session, i) =>
          '<button class="session-row" data-session="' +
          i +
          '"><strong>' +
          safe(session.name) +
          (session === current ? " · 현재" : "") +
          "</strong><small>메시지 " +
          session.messages.length +
          "개</small></button>",
      )
      .join("") + '<button id="new-session" class="primary">새 세션</button>',
  );
  document.querySelectorAll("[data-session]").forEach(
    (el) =>
      (el.onclick = () => {
        $("#detail").close();
        switchSession(project.sessions[+el.dataset.session]);
      }),
  );
  $("#new-session").onclick = () => {
    $("#detail").close();
    switchSession(newSession());
  };
};
function showMotion() {
  document.body.classList.toggle("quiet", quiet);
  $("#motion").setAttribute("aria-pressed", String(quiet));
  $("#motion").innerHTML =
    icon("motion") + (quiet ? "모션 줄임" : "모션 줄이기");
}
$("#motion").onclick = () => {
  quiet = !quiet;
  showMotion();
  drawActors();
};
$("#mobile-switch").onclick = () => {
  const shown = document.body.classList.toggle("camp-visible");
  $("#mobile-switch").textContent = shown ? "대화 보기" : "캠프 보기";
};
current = newSession();
startJob(current, "검색 개선", 1);
current.messages.push({
  text: "검색창에 공백만 입력해도 전체 목록이 보이게 해줘.",
  user: true,
});
reply(
  current,
  "검색 조건을 수정하고 있어요. 변경 후에는 빈 입력과 공백 입력을 각각 테스트할게요.",
);
record(current, "개발", "검색 조건 수정 시작", current.jobs[0]);
showMotion();
openTab("chat");

window.setInterval(() => {
  if (quiet || document.hidden || $("#detail").open) return;
  campBeat++;
  drawActors();
}, 5000);
