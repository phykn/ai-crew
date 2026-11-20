import { _electron as electron, expect } from "@playwright/test";
import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
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
  await page.getByRole("button", { name: "대화", exact: true }).click();
  await send("한 줄에 한 개씩 아주 많은 색 이름과 설명을 써줘.");
  await page.getByRole("button", { name: "응답 멈춤" }).click();
  await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(0);
  await send("/clear");
  await expect(page.locator(".bubble")).toHaveCount(0);
  await page.getByRole("button", { name: "세션 목록" }).click();
  await page.getByRole("button", { name: /오늘의 확인 코드는/ }).click();
  await expect(page.locator(".bubble.user").first()).toContainText("crew-571");
  await send(
    "프로젝트의 notes.txt 파일을 실제로 수정해줘. 기존 내용 Before를 After로 바꾸고 줄바꿈 한 개를 유지해줘.",
  );
  const question = page.getByRole("region", { name: "권한 승인" });
  await expect(question).toContainText("notes.txt", { timeout: 45000 });
  expect(await readFile(projectFile, "utf8")).toBe("Before\n");
  await question.getByRole("button", { name: "허용" }).click();
  await expect(page.getByText(/notes.txt 파일을 변경했어요/)).toBeVisible({
    timeout: 45000,
  });
  expect(await readFile(projectFile, "utf8")).toBe("After\n");
  if (process.env.AI_CREW_TEST_CODEX === "1") {
    await page.locator(".roster summary").click();
    await page
      .getByRole("combobox", { name: "비서 모델" })
      .selectOption("codex");
    await page.locator(".roster summary").click();
    await send("/clear");
    await send("도구를 쓰지 말고 CODEX-571만 답해줘.");
    await expect(answer()).toContainText("CODEX-571", { timeout: 45000 });
    await expect(page.getByRole("button", { name: "응답 멈춤" })).toHaveCount(
      0,
    );
    console.log("PASS packaged Electron: Codex App Server turn");
  }
  expect(errors).toEqual([]);
  console.log(
    "PASS packaged Electron: folder, Qwen chat and tool, restart, context, stop, /clear, delegated planning and approved file write",
  );
} finally {
  await application?.close().catch(() => {});
  await rm(directory, { recursive: true, force: true });
}
