"use strict";

const exampleRequest =
  "빈 검색어와 공백 입력에서 전체 목록이 보이는지 확인해줘.";
const exampleTitle = "빈 검색어 처리 점검";
const crewTemplates = [
  ["비서", "여울", "#efc58d", "Codex", "업무 조율", "pen", 0, 28, 62],
  ["개발", "모루", "#b4d59d", "Codex", "코드 작성", "code", 1, 64, 78],
  ["테스트", "솔잎", "#a9c7f0", "로컬 LLM", "테스트 실행", "shield", 2, 79, 65],
  ["리뷰", "새벽", "#ddaed8", "Codex", "변경 검토", "book", 3, 23, 83],
  ["플랜", "가람", "#bce0da", "Codex", "범위와 완료 조건", "pen", 2, 48, 52],
  ["스타일", "단풍", "#f6aa8a", "Codex", "코딩 스타일 확인", "code", 0, 86, 84],
];
const approvalModes = {
  수동: "권한 요청마다 직접 허용하거나 거절합니다.",
  자동: "비서가 판단합니다. 목업에서는 외부 전달이 필요할 때 사용자에게 묻습니다.",
  항상: "이 프로젝트의 모든 앱 권한 요청을 승인합니다.",
};
const activeStates = ["approval", "queued", "run", "stopping"];
const steerableStates = ["approval", "queued", "run"];

function jobStage(job) {
  return job.groups[job.step];
}

function jobStatus(job) {
  switch (job.state) {
    case "approval":
      return "승인 대기";
    case "queued":
      return job.waitingForRole ? "담당자 대기" : "앞 업무 대기";
    case "stopping":
      return "중단 중";
    default:
      return jobStage(job)
        .map((stage) => stage.label)
        .join(" · ");
  }
}

function makeAgent(template, temporary = false) {
  const [role, name, color, model, skill, icon, sprite, x, y] = template;
  return {
    role,
    name,
    color,
    model,
    skill,
    icon,
    sprite,
    x,
    y,
    temporary,
    hired: true,
  };
}

function createDemo(onChange) {
  const projects = [];
  let nextId = 1;
  let nextEventId = 1;

  function createProject(name, handle = null) {
    const project = {
      name,
      handle,
      crew: crewTemplates.map((template) => makeAgent(template)),
      sessions: [],
      memories: [],
      personalMemory: {},
      workflow: makeStages(),
      version: 1,
      approval: "수동",
      memoryView: "wiki",
      wikiView: "list",
    };
    projects.push(project);
    newSession(project);
    return project;
  }

  function newSession(project) {
    const session = {
      project,
      name: "새 대화",
      messages: [],
      jobs: [],
      events: [],
      draft: "",
    };
    project.sessions.push(session);
    project.lastSession = session;
    return session;
  }

  function log(session, role, text, job, details) {
    const time = new Date().toLocaleTimeString("ko-KR", {
      hour: "2-digit",
      minute: "2-digit",
      hour12: false,
    });
    session.events.unshift({
      id: nextEventId++,
      role,
      text,
      details,
      time,
      jobId: job?.id,
    });
  }

  function reply(session, text, job, action) {
    session.messages.push({ text, jobId: job?.id, action });
  }

  function jobsIn(project) {
    return project.sessions.flatMap((session) => session.jobs);
  }

  function enterStage(job) {
    const { session } = job;
    const scope = [...new Set(jobStage(job).map((stage) => stage.access))];
    const mode = session.project.approval;
    if (mode === "수동" || (mode === "자동" && scope.includes("외부 전달"))) {
      job.state = "approval";
      job.question = scope.join(" · ") + " 권한을 허용할까요?";
      log(session, "비서", mode + " 승인 대기 · " + scope.join(" · "), job);
      return;
    }
    log(session, "비서", mode + " 승인 · " + scope.join(" · "), job);
    schedule(job);
  }

  function schedule(job) {
    const { session } = job;
    const group = jobStage(job);
    const { project } = session;
    const missing = group.some(
      ({ role }) => !project.crew[role]?.hired || project.crew[role].leaving,
    );
    const busy = jobsIn(project).some(
      (other) =>
        other !== job &&
        (other.state === "run" ||
          (other.state === "stopping" && other.holdsRoles)) &&
        jobStage(other).some(({ role }) =>
          group.some((stage) => stage.role === role),
        ),
    );
    if (missing || busy) {
      if (job.state !== "queued")
        log(
          session,
          "비서",
          missing ? "담당자 고용 대기" : "같은 담당자의 앞 업무 대기",
          job,
        );
      job.state = "queued";
      job.waitingForRole = missing;
      return;
    }
    job.state = "run";
    for (const stage of group) {
      const agent = project.crew[stage.role];
      log(session, agent.role, stage.label + " 시작", job, stage.criterion);
    }
    job.timer = setTimeout(() => finishStage(job), 4800);
  }

  function finishStage(job) {
    const { session } = job;
    const { project } = session;
    for (const stage of jobStage(job)) {
      log(
        session,
        project.crew[stage.role].role,
        stage.label + " 확인 완료",
        job,
        stage.criterion,
      );
    }
    job.state = "done";
    finishDepartures(project);
    if (job.step + 1 < job.groups.length) {
      const from = jobStage(job)
        .map((stage) => stage.label)
        .join(" · ");
      job.step++;
      log(
        session,
        "비서",
        from +
          " 결과 인계 → " +
          jobStage(job)
            .map((stage) => stage.label)
            .join(" · "),
        job,
      );
      enterStage(job);
    } else {
      const checked = jobStage(job)
        .map((stage) => stage.label)
        .join("·");
      log(session, "비서", "결과 취합 · " + checked, job);
      reply(
        session,
        "「" + job.title + "」의 " + checked + " 확인을 마쳤어요.",
        job,
        "log",
      );
      project.memories.push({
        id: "job-" + job.id,
        title: job.title + " 결과",
        body: checked + " 확인 완료 (모의 실행).",
        by: "비서",
        source: job.title,
        links: [],
      });
    }
    startQueued(project);
    onChange(session);
  }

  function startQueued(project) {
    for (const job of jobsIn(project)) {
      if (job.state === "queued") schedule(job);
    }
  }

  function answer(job, allow) {
    if (job.state !== "approval") return;
    const { session } = job;
    log(
      session,
      "사용자",
      jobStage(job)
        .map((stage) => stage.access)
        .join(" · ") + (allow ? " 허용" : " 거절"),
      job,
    );
    session.approvalFocus = null;
    if (allow) {
      schedule(job);
    } else {
      job.state = "denied";
      reply(
        session,
        "권한이 거절되어 「" + job.title + "」을 멈췄어요.",
        job,
        "log",
      );
    }
    onChange(session);
  }

  function stop(job) {
    if (!steerableStates.includes(job.state)) return;
    const { session } = job;
    const wasRunning = job.state === "run";
    clearTimeout(job.timer);
    job.state = "stopping";
    job.holdsRoles = wasRunning;
    log(session, "비서", "중단 요청", job);
    onChange(session);
    job.timer = setTimeout(() => {
      job.state = "stopped";
      log(session, "비서", "실행 정지 확인", job);
      reply(
        session,
        "「" + job.title + "」을 멈췄어요. 지금까지의 단계는 남겨뒀어요.",
        job,
        "resume",
      );
      finishDepartures(session.project);
      startQueued(session.project);
      onChange(session);
    }, 650);
  }

  function resume(job) {
    if (job.state !== "stopped") return;
    job.session.selected = job;
    log(job.session, "비서", "마지막 단계에서 이어가기", job);
    enterStage(job);
    onChange(job.session);
  }

  function startJob(session, title) {
    const job = {
      id: nextId++,
      session,
      title,
      state: "queued",
      step: 0,
      groups: groupStages(session.project.workflow),
      version: session.project.version,
    };
    session.jobs.push(job);
    session.selected = job;
    log(session, "비서", title + " · 워크플로우 v" + job.version, job);
    enterStage(job);
  }

  function setEmployment(session, index) {
    const { project } = session;
    const agent = project.crew[index];
    if (agent.leaving) return;
    agent.hired = !agent.hired;
    agent.leaving =
      !agent.hired &&
      jobsIn(project).some(
        (job) =>
          (job.state === "run" ||
            (job.state === "stopping" && job.holdsRoles)) &&
          jobStage(job).some((stage) => stage.role === index),
      );
    log(
      session,
      "비서",
      agent.role +
        (agent.hired ? " 고용" : agent.leaving ? " 퇴장 예정" : " 해고"),
    );
    startQueued(project);
    onChange(session);
  }

  function finishDepartures(project) {
    for (const [index, agent] of project.crew.entries()) {
      if (
        agent.leaving &&
        !jobsIn(project).some(
          (job) =>
            (job.state === "run" ||
              (job.state === "stopping" && job.holdsRoles)) &&
            jobStage(job).some((stage) => stage.role === index),
        )
      )
        agent.leaving = false;
    }
  }

  function hireTemp(session) {
    const { project } = session;
    const agent = project.crew[crewTemplates.length];
    if (agent) {
      setEmployment(session, crewTemplates.length);
      return;
    }
    project.crew.push(
      makeAgent(
        ["알바", "잔돌", "#e6bc94", "Codex", "임시 검토", "book", 3, 43, 86],
        true,
      ),
    );
    log(session, "비서", "알바 고용");
    onChange(session);
  }

  function submit(session, text, newWork) {
    const { project } = session;
    const title =
      text === exampleRequest
        ? exampleTitle
        : text.replace(/\s+/g, " ").slice(0, 70);
    if (!session.messages.length) session.name = title;
    session.messages.push({ text, user: true });
    const directed = session.steer;
    const asking = /요약|보여|알려|뭐가|무엇/.test(text);
    if (directed && !newWork) {
      log(session, "비서", "추가 지시 · " + text, directed);
      reply(session, "「" + directed.title + "」에 추가 지시를 전달했어요.");
    } else if (text.includes("/clear")) {
      reply(session, "/clear만 보내면 같은 설정으로 새 대화를 시작해요.");
    } else if (
      /^(안녕[!?. 요하세요]*|고마워[!?. 요]*|감사합니다[!.]*)$/.test(text)
    ) {
      reply(session, "필요한 일을 말씀해 주세요.");
    } else if (
      /상태|진행|어디까지|무슨 일|뭐 하고/.test(text) &&
      /알려|보여|하고 있|됐|어때|이야|\?$/.test(text)
    ) {
      const jobs = (
        /프로젝트/.test(text) ? jobsIn(project) : session.jobs
      ).filter((job) => activeStates.includes(job.state));
      reply(
        session,
        jobs.map((job) => job.title + " · " + jobStatus(job)).join("\n") ||
          "진행 중인 업무가 없어요.",
      );
    } else if (asking && /위키/.test(text)) {
      reply(
        session,
        project.memories
          .slice(0, 3)
          .map((entry) => entry.title + " · " + entry.body)
          .join("\n") || "프로젝트 위키가 비어 있어요.",
      );
    } else if (asking && /기억|메모리/.test(text)) {
      const index = project.crew.findIndex(
        (agent) =>
          text.includes(agent.name) || text.includes(agent.role + " 담당"),
      );
      reply(
        session,
        index < 0
          ? "어느 담당자의 기억을 볼까요?"
          : (project.personalMemory[index] || []).join("\n") ||
              "남긴 기억이 없어요.",
      );
    } else if (!newWork && /^(그거|거기에|아까|이어서|추가로)/.test(text)) {
      reply(
        session,
        "어느 업무에 반영할까요? 업무명을 눌러 추가 지시를 보낼 수 있어요.",
      );
    } else if (!project.crew[0].hired && !project.crew[0].leaving) {
      reply(session, "크루에서 비서를 다시 고용하면 업무를 맡길 수 있어요.");
    } else {
      startJob(session, title);
    }
    session.steer = null;
  }

  const example = createProject("ai-crew");
  example.memories.push(
    {
      id: "guide",
      title: "프로젝트 작업 지침",
      body: "현재 요청과 프로젝트 지침을 우선한다. 플랜에는 관련 문서만 읽고 근거를 연결한다.",
      by: "플랜",
      source: "프로젝트 규칙",
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
      body: "리뷰·스타일·테스트를 같은 변경 버전에 연결하고 미확인 항목을 기록한다.",
      by: "테스트",
      source: "개발 워크플로우",
      links: [],
    },
  );
  example.personalMemory[1] = [
    "검색 조건을 바꾸기 전에 공백 처리 규칙을 확인한다.",
  ];

  return {
    projects,
    example,
    createProject,
    newSession,
    submit,
    answer,
    stop,
    resume,
    setEmployment,
    hireTemp,
    log,
    jobsIn,
  };
}
