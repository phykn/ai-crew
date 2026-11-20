import { _electron as electron, expect } from "@playwright/test";
import {
  mkdtemp,
  mkdir,
  readFile,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { DatabaseSync } from "node:sqlite";
import { join, resolve } from "node:path";

const executable = resolve(
  process.argv[2] ||
    "out/ai-crew-darwin-arm64/ai-crew.app/Contents/MacOS/ai-crew",
);
const directory = await mkdtemp(join(tmpdir(), "ai-crew-desktop-"));
const workspace = join(directory, "샘플 프로젝트");
await mkdir(workspace);
const projectFile = join(workspace, "notes.txt");
await writeFile(projectFile, "Before\n");
const env = { ...process.env, AI_CREW_DATA_DIR: directory };

let application;
let fixtureMcp;
try {
  application = await electron.launch({ executablePath: executable, env });
  await application.evaluate(({ dialog }, folder) => {
    dialog.showOpenDialog = async () => ({
      canceled: false,
      filePaths: [folder],
    });
  }, workspace);
  let page = await application.firstWindow();
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.getByRole("button", { name: "폴더 열기" }).click();
  const prompt = () => page.getByRole("textbox", { name: "비서에게 메시지" });
  const send = async (text) => {
    await prompt().fill(text);
    await prompt().press("Enter");
  };
  const answer = () => page.locator(".bubble.assistant").last();
  await expect(page.getByRole("button", { name: "프로젝트 폴더" })).toHaveText(
    "샘플 프로젝트",
  );
  await send("내가 정한 오늘의 확인 코드는 crew-571이야. 알겠다고만 답해줘.");
  await expect(answer()).toContainText(/알겠|확인|네|crew-571/, {
    timeout: 35000,
  });
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await prompt().fill("저장할 초안");
  await application.close();
  application = await electron.launch({ executablePath: executable, env });
  page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  await expect(prompt()).toHaveValue("저장할 초안");
  await expect(page.locator(".bubble.user").first()).toContainText("crew-571");
  await send("오늘의 확인 코드를 다시 써줘.");
  await expect(answer()).toContainText("crew-571", { timeout: 35000 });
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await send("project_info 도구를 실행해서 이 프로젝트의 실제 이름을 알려줘.");
  await expect(answer()).toContainText("샘플 프로젝트", { timeout: 35000 });
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await page.getByRole("button", { name: "로그" }).click();
  await expect(
    page.getByText("비서 · 현재 프로젝트 조회").first(),
  ).toBeVisible();
  await page.getByText("모델 실행", { exact: true }).click();
  await expect(page.locator(".model-usage")).toContainText(/비서[\s\S]*3회/);
  await expect(page.locator(".model-usage")).toContainText("확인된 토큰");
  await page.getByRole("button", { name: "대화", exact: true }).click();
  await send("한 줄에 한 개씩 아주 많은 색 이름과 설명을 써줘.");
  await page.getByRole("button", { name: "응답 멈춤" }).click();
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  const commandList = page.getByRole("group", { name: "채팅 명령" });
  await expect(commandList).toHaveCount(0);
  await send("/clear가 뭐야? 현재 대화에서 짧게 답해줘.");
  await expect(page.locator(".bubble.user").last()).toContainText(
    "/clear가 뭐야?",
  );
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await prompt().fill("/");
  await expect(commandList.getByRole("button", { name: /\/clear/ })).toBeVisible();
  await prompt().press("Escape");
  await expect(commandList).toHaveCount(0);
  await prompt().fill("/cl");
  await expect(commandList).toBeVisible();
  await prompt().press("Enter");
  await expect(prompt()).toHaveValue("/clear");
  await expect(page.locator(".bubble.user").first()).toContainText("crew-571");
  await prompt().press("Enter");
  await expect(page.locator(".bubble")).toHaveCount(0);
  await page.getByRole("button", { name: "세션 목록" }).click();
  await page.getByRole("button", { name: /오늘의 확인 코드는/ }).click();
  await expect(page.locator(".bubble.user").first()).toContainText("crew-571");
  await page.locator(".roster > summary").click();
  const roster = page.locator(".crew-list");
  await roster.getByRole("button", { name: "＋ 팀원" }).click();
  await roster
    .getByRole("combobox", { name: "새 팀원 역할" })
    .selectOption("plan");
  await roster.getByRole("textbox", { name: "새 팀원 별명" }).fill("새 플랜");
  await roster.getByRole("button", { name: "고용", exact: true }).click();
  await roster.getByRole("button", { name: "새 플랜", exact: true }).click();
  await roster.getByRole("textbox", { name: "플랜 별명" }).fill("새 플랜 담당");
  await roster.getByRole("textbox", { name: "플랜 별명" }).press("Enter");
  await expect(
    roster.getByRole("button", { name: "새 플랜 담당", exact: true }),
  ).toBeVisible();
  const writePermission = roster.getByRole("button", {
    name: "모루 파일 쓰기 권한",
  });
  await writePermission.click();
  await expect(writePermission).toHaveAttribute("aria-pressed", "false");
  await writePermission.click();
  await expect(writePermission).toHaveAttribute("aria-pressed", "true");
  await roster.getByRole("button", { name: "플랜 고용", exact: true }).click();
  await roster.getByRole("button", { name: "개발 고용", exact: true }).click();
  await page.locator(".roster > summary").click();
  await send(
    "프로젝트의 notes.txt 파일을 실제로 수정해줘. 기존 내용 Before를 After로 바꾸고 줄바꿈 한 개를 유지해줘. 수정하기 전에 스타일 담당자에게 마지막 줄바꿈 규칙을 확인해줘.",
  );
  const question = page.getByRole("region", { name: "권한 승인" });
  await expect(question).toContainText("notes.txt", { timeout: 45000 });
  await expect(
    page.getByRole("region", { name: "권한 승인", exact: true }),
  ).toHaveCount(1);
  await expect(page.locator(".current-jobs .job")).toContainText("승인 대기");
  await question.getByRole("button", { name: "승인 업무 로그 열기" }).click();
  await expect(
    page.getByRole("region", { name: "권한 승인", exact: true }),
  ).toHaveCount(0);
  await expect(
    page.getByText("승인 수동 · notes.txt · 결정 기록 없음", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "업무로 돌아가기" }).click();
  await expect(question).toContainText("notes.txt");
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(440, 620),
  );
  await expect(page.locator(".compose-tools .folder")).toBeVisible();
  await expect(page.getByRole("combobox", { name: "승인 모드" })).toBeVisible();
  const sessionsButton = page.getByRole("button", {
    name: "세션 목록",
    exact: true,
  });
  await sessionsButton.click();
  await page.keyboard.press("Escape");
  await expect(sessionsButton).toHaveAttribute("aria-expanded", "false");
  await sessionsButton.click();
  await page
    .getByRole("button", { name: /새 대화/ })
    .first()
    .click();
  await expect(question).toHaveCount(0);
  await sessionsButton.click();
  await page.getByRole("button", { name: /오늘의 확인 코드는/ }).click();
  await expect(question).toContainText("notes.txt");
  await application.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows()[0].setSize(1320, 850),
  );
  expect(await readFile(projectFile, "utf8")).toBe("Before\n");
  await question.getByRole("button", { name: "허용" }).click();
  const completed = page.getByText(/notes.txt 파일을 변경했어요/);
  const clarification = page.getByRole("region", { name: "비서의 확인 질문" });
  await expect(completed.or(clarification).first()).toBeVisible({
    timeout: 90000,
  });
  if (await clarification.isVisible()) {
    expect(await readFile(projectFile, "utf8")).toBe("Before\n");
    await clarification.getByRole("button", { name: "답변" }).click();
    await send(
      "네. notes.txt 전체 내용은 After와 바로 뒤의 줄바꿈 한 개입니다.",
    );
    await expect(question).toContainText("notes.txt", { timeout: 45000 });
    await question.getByRole("button", { name: "허용" }).click();
  }
  await expect(completed).toBeVisible({ timeout: 90000 });
  expect(await readFile(projectFile, "utf8")).toBe("After\n");
  await page.locator(".roster > summary").click();
  await expect(
    roster.getByRole("button", { name: "개발 미고용", exact: true }),
  ).toBeVisible();
  await expect(
    roster.getByRole("button", { name: "개발 알바", exact: true }),
  ).toHaveCount(0);
  await page.locator(".roster > summary").click();
  await page.getByRole("button", { name: "추가 지시" }).click();
  await expect(page.locator(".revision-target")).toBeVisible();
  await send(
    "notes.txt 전체 내용을 Final과 줄바꿈 한 개로 바꿔줘. 같은 폴더에 summary.txt도 새로 만들고 전체 내용은 Summary와 줄바꿈 한 개로 해줘. 두 파일 모두 실제 변경이 필요해.",
  );
  await expect(question).toContainText("notes.txt", { timeout: 45000 });
  await expect(question).toContainText("summary.txt");
  expect(await readFile(projectFile, "utf8")).toBe("After\n");
  await question.getByRole("button", { name: "허용" }).click();
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    /(?:notes\.txt, summary\.txt|summary\.txt, notes\.txt) 파일을 변경했어요/,
    {
      timeout: 90000,
    },
  );
  expect(await readFile(projectFile, "utf8")).toBe("Final\n");
  expect(await readFile(join(workspace, "summary.txt"), "utf8")).toBe(
    "Summary\n",
  );
  await page
    .getByRole("button", { name: "업무 로그", exact: true })
    .last()
    .click();
  const changeLog = page.locator(".change-log:not(.model-usage)").first();
  await expect(page.getByText(/새 플랜 담당 배정/).first()).toBeVisible();
  await expect(page.getByText(/인사팀 · 개발 후보 준비/).first()).toBeVisible();
  await expect(
    page.getByText(/비서 · 개발 알바 업무 종료/).first(),
  ).toBeVisible();
  await expect(
    page.getByText(/개발 → 스타일 · notes\.txt/).first(),
  ).toBeVisible();
  await expect(page.getByText(/스타일 → 개발 ·/).first()).toBeVisible();
  await changeLog.locator("summary").click();
  await expect(changeLog.getByText(/테스트 · 통과/)).toBeVisible();
  await page.getByRole("button", { name: "대화" }).click();
  await page.getByRole("button", { name: "추가 지시" }).click();
  await send(
    "summary.txt의 이름을 archived.txt로 바꿔서 실제로 이동해줘. 내용은 그대로 유지하고, 이동한 뒤 이전 경로에는 파일이 없어야 해.",
  );
  await expect(question).toContainText("summary.txt → archived.txt", {
    timeout: 45000,
  });
  await expect(readFile(join(workspace, "summary.txt"), "utf8")).resolves.toBe(
    "Summary\n",
  );
  await expect(
    readFile(join(workspace, "archived.txt"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await question.getByRole("button", { name: "허용" }).click();
  await expect(page.locator(".bubble.assistant").last()).toContainText(
    "summary.txt → archived.txt 파일을 변경했어요.",
    { timeout: 90000 },
  );
  await expect(
    readFile(join(workspace, "summary.txt"), "utf8"),
  ).rejects.toMatchObject({ code: "ENOENT" });
  await expect(readFile(join(workspace, "archived.txt"), "utf8")).resolves.toBe(
    "Summary\n",
  );
  const archived = join(workspace, "archived.txt");
  const fileBeforeRecovery = await stat(archived);
  await application.close();
  const recoveryDatabase = new DatabaseSync(join(directory, "crew.sqlite"));
  try {
    const change = recoveryDatabase
      .prepare(
        "SELECT id, job_id, plan_id FROM work_changes WHERE moved_from = 'summary.txt' AND path = 'archived.txt'",
      )
      .get();
    expect(change?.plan_id).toBeTruthy();
    const verification = recoveryDatabase
      .prepare(
        "SELECT version FROM verification_checkpoints WHERE job_id = ? AND role = 'test' AND path = 'archived.txt'",
      )
      .get(change.job_id);
    expect(verification?.version).toBeTruthy();
    expect(
      recoveryDatabase
        .prepare(
          "DELETE FROM verification_checkpoints WHERE job_id = ? AND version = ? AND role = 'style'",
        )
        .run(change.job_id, verification.version).changes,
    ).toBe(1);
    recoveryDatabase
      .prepare("DELETE FROM work_checks WHERE change_id = ?")
      .run(change.id);
    recoveryDatabase
      .prepare("UPDATE work_changes SET saved_at = NULL WHERE id = ?")
      .run(change.id);
    recoveryDatabase
      .prepare(
        "UPDATE jobs SET state = 'developing', execution_plan_id = ? WHERE id = ?",
      )
      .run(change.plan_id, change.job_id);
  } finally {
    recoveryDatabase.close();
  }
  application = await electron.launch({ executablePath: executable, env });
  page = await application.firstWindow();
  page.on("pageerror", (error) => errors.push(error.message));
  const resume = page.getByRole("button", { name: "이어가기", exact: true });
  await expect(resume).toBeVisible();
  await resume.click();
  await expect(
    page.getByText("summary.txt → archived.txt 파일을 변경했어요.", {
      exact: false,
    }),
  ).toHaveCount(2, { timeout: 45000 });
  const fileAfterRecovery = await stat(archived);
  expect(fileAfterRecovery.ino).toBe(fileBeforeRecovery.ino);
  expect(fileAfterRecovery.mtimeMs).toBe(fileBeforeRecovery.mtimeMs);
  expect(await readFile(archived, "utf8")).toBe("Summary\n");
  await page.getByRole("button", { name: "로그", exact: true }).click();
  await expect(
    page.getByText("리뷰 · 같은 파일 버전의 완료 기록 사용", { exact: false }),
  ).toBeVisible();
  await expect(
    page.getByText("테스트 · archived.txt · 같은 파일 버전의 완료 기록 사용", {
      exact: false,
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "대화", exact: true }).click();
  await send("그거 다시 해줘");
  const followup = page.getByRole("region", { name: "추가 지시 업무 선택" });
  await expect(followup).toContainText("그거 다시 해줘");
  await followup.getByRole("button").first().click();
  await expect(
    page.getByRole("region", { name: "비서의 확인 질문" }),
  ).toContainText("이 업무에서 어떻게 바꿀까요?");
  expect((await stat(archived)).mtimeMs).toBe(fileBeforeRecovery.mtimeMs);
  let mcpCalls = 0;
  fixtureMcp = createServer(async (request, response) => {
    if (request.method !== "POST") {
      response.writeHead(405).end();
      return;
    }
    const items = [];
    for await (const chunk of request) items.push(chunk);
    const { id, method, params } = JSON.parse(Buffer.concat(items).toString());
    if (id === undefined) {
      response.writeHead(202).end();
      return;
    }
    const results = {
      initialize: {
        protocolVersion: params?.protocolVersion,
        capabilities: { tools: {} },
        serverInfo: { name: "fixture", version: "1" },
      },
      "tools/list": {
        tools: [
          {
            name: "read_fixture",
            description: "Return the current fixture value",
            inputSchema: { type: "object" },
            annotations: { readOnlyHint: true },
          },
        ],
      },
      "tools/call": { content: [{ type: "text", text: "MCP-CREW-729" }] },
    };
    if (method === "tools/call") mcpCalls++;
    response
      .writeHead(200, { "content-type": "application/json" })
      .end(JSON.stringify({ jsonrpc: "2.0", id, result: results[method] }));
  });
  await new Promise((resolve) => fixtureMcp.listen(0, "127.0.0.1", resolve));
  await page.locator(".roster > summary").click();
  await page.getByRole("button", { name: "여울 스킬 및 MCP 설정" }).click();
  const mcpSettings = page.getByRole("region", { name: "여울 설정" });
  await mcpSettings.getByText("정의 MD", { exact: true }).click();
  await expect(mcpSettings.getByText("# 비서", { exact: false })).toBeVisible();
  await mcpSettings
    .getByRole("region", { name: "스킬", exact: true })
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await mcpSettings.getByLabel("이름", { exact: true }).fill("응답 규칙");
  await mcpSettings
    .getByLabel("스킬 MD")
    .fill("# 응답 규칙\n도구가 돌려준 값은 있는 그대로 전달한다.");
  await mcpSettings
    .locator("form")
    .getByRole("button", { name: "추가", exact: true })
    .click();
  await expect(
    mcpSettings.getByText("응답 규칙", { exact: true }),
  ).toBeVisible();
  await mcpSettings
    .getByRole("button", { name: "연결 추가", exact: true })
    .click();
  await mcpSettings.getByLabel("이름", { exact: true }).fill("확인용 서버");
  await mcpSettings
    .getByLabel("서버 주소")
    .fill("http://127.0.0.1:" + fixtureMcp.address().port + "/mcp");
  await mcpSettings.getByRole("button", { name: "연결", exact: true }).click();
  await mcpSettings.getByText("확인용 서버 · 연결됨", { exact: true }).click();
  await mcpSettings.getByText("read_fixture · 읽기", { exact: true }).click();
  const mcpGrant = mcpSettings.getByRole("checkbox", { name: "읽기 허용" });
  await mcpGrant.click();
  await expect(mcpGrant).toBeChecked();
  await page.locator(".roster > summary").click();
  await send(
    "mcp_1_read_fixture 도구를 실행해서 실제로 반환한 확인 코드를 알려줘.",
  );
  await expect(answer()).toContainText("MCP-CREW-729", { timeout: 45000 });
  expect(mcpCalls).toBeGreaterThan(0);
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await page.locator(".roster > summary").click();
  await mcpGrant.click();
  await expect(mcpGrant).not.toBeChecked();
  await mcpSettings.getByText("응답 규칙", { exact: true }).click();
  await mcpSettings
    .getByRole("button", { name: "스킬 해제", exact: true })
    .click();
  await expect(mcpSettings.getByText("응답 규칙", { exact: true })).toHaveCount(
    0,
  );
  await page.locator(".roster > summary").click();
  if (process.env.AI_CREW_TEST_CODEX === "1") {
    await page.locator(".roster > summary").click();
    await page
      .getByRole("combobox", { name: "비서 모델" })
      .selectOption("codex");
    await page.locator(".roster > summary").click();
    await send("/clear");
    await send(
      "이 대화의 확인 코드는 CODEX-571이야. 도구를 쓰지 말고 확인 코드만 답해줘.",
    );
    await expect(answer()).toContainText("CODEX-571", { timeout: 45000 });
    await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(
      0,
    );
    await application.close();
    application = await electron.launch({ executablePath: executable, env });
    page = await application.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await send("앞서 정한 확인 코드를 답해줘.");
    await expect(answer()).toContainText("CODEX-571", { timeout: 45000 });
    await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(
      0,
    );
    await application.close();
    const database = new DatabaseSync(join(directory, "crew.sqlite"));
    try {
      expect(
        database
          .prepare(
            "UPDATE sessions SET codex_thread = ? WHERE codex_thread IS NOT NULL",
          )
          .run(randomUUID()).changes,
      ).toBe(1);
    } finally {
      database.close();
    }
    application = await electron.launch({ executablePath: executable, env });
    page = await application.firstWindow();
    page.on("pageerror", (error) => errors.push(error.message));
    await send("저장된 대화의 확인 코드만 다시 써줘.");
    await expect(answer()).toContainText("CODEX-571", { timeout: 45000 });
    await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(
      0,
    );
    await page.getByRole("button", { name: "로그" }).click();
    await expect(
      page.getByText("비서 · 저장한 대화에서 Codex 맥락 복구"),
    ).toBeVisible();
    console.log(
      "PASS packaged Electron: Codex native resume and saved-context fallback",
    );
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS packaged Electron: Qwen workflow, approved edits and move, and restart recovery without rewriting",
  );
} finally {
  await application?.close().catch(() => {});
  if (fixtureMcp) {
    fixtureMcp.closeAllConnections();
    await new Promise((resolve) => fixtureMcp.close(resolve));
  }
  await rm(directory, { recursive: true, force: true });
}
