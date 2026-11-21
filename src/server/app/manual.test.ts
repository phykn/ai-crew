import { mkdtempSync, realpathSync, rmSync, writeFileSync, mkdirSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { expect, test } from "vitest";
import { roles } from "../../shared/actions";
import { bundledAppManual, loadAppManual, resolveAppManual } from "./manual";
import { crewInstructions } from "../../shared/crew-definition";
import { wikiReference } from "../../shared/wiki-reference";
import { CrewStore } from "../../store/store";

test("앱 매뉴얼을 읽어 비서 지침에 넣는다", () => {
  const manual = loadAppManual([process.cwd()]);
  expect(manual).toBeTruthy();
  expect(manual).toContain("# AI Crew app manual");
  expect(manual).toContain("style watcher");
  expect(manual).toContain("diagnostics.run");
  expect(manual).toContain("createCrewHttpServer");

  const member = {
    id: "assistant",
    roleId: "assistant" as const,
    name: "하나",
    provider: "local" as const,
    hired: true,
  };
  expect(crewInstructions(member, [], [], undefined, { appManual: manual })).toContain(
    "This app's manual",
  );
  // 매뉴얼은 비서에게만 간다. 다른 역할은 앱 사용법을 답하지 않는다.
  expect(
    crewInstructions({ ...member, roleId: "docs", id: "docs" }, [], [], undefined, {
      appManual: manual,
    }),
  ).not.toContain("This app's manual");
});

test("매뉴얼이 없으면 지침에 억지로 넣지 않는다", () => {
  const empty = realpathSync(mkdtempSync(join(tmpdir(), "crew-manual-")));
  try {
    expect(loadAppManual([empty])).toBeNull();
    expect(
      loadAppManual([empty], () => {
        throw new Error("파일이 없어요");
      }),
    ).toBeNull();
    // 패키징한 앱에는 저장소 파일이 없으므로 빌드에 넣은 본문으로 대신한다.
    expect(resolveAppManual([empty])).toBe(bundledAppManual);
    expect(bundledAppManual).toContain("# AI Crew app manual");
  } finally {
    rmSync(empty, { recursive: true, force: true });
  }
});

test("매뉴얼은 역할 표와 새 크루 동작을 실제 코드와 맞춰 적는다", () => {
  const manual = loadAppManual([process.cwd()])!;
  for (const role of roles) {
    expect(manual).toContain("`" + role.id + "`");
    expect(manual).toContain(role.title);
  }
  for (const id of ["crew.hire", "crew.fire", "diagnostics.run", "noteFileChange"])
    expect(manual).toContain(id);
  // 매뉴얼에 적은 대로 매뉴얼 파일을 고치면 다음 대화에 반영되는지: 매번 다시 읽는다.
  const root = realpathSync(mkdtempSync(join(tmpdir(), "crew-manual-live-")));
  try {
    mkdirSync(join(root, "agents"));
    const file = join(root, "agents", "APP_MANUAL.md");
    writeFileSync(file, "# 첫 판");
    expect(loadAppManual([root])).toBe("# 첫 판");
    writeFileSync(file, "# 고친 판");
    expect(loadAppManual([root])).toBe("# 고친 판");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test("매뉴얼은 저장된 기억·위키와 함께 비서 프롬프트에 들어간다", () => {
  const root = realpathSync(mkdtempSync(join(tmpdir(), "crew-manual-prompt-")));
  const store = new CrewStore(join(root, ".crew.sqlite"));
  try {
    store.openFolder(root);
    const projectId = store.snapshot().current!.id;
    const assistant = store.readMembers(projectId, "assistant")[0];
    const instructions = crewInstructions(
      assistant,
      [],
      store.listMemories(projectId, assistant.id),
      wikiReference(store.wikiDigest(projectId), ""),
      { appManual: loadAppManual([process.cwd()]) },
    );
    expect(instructions).toContain("only channel between the user and the crew");
    expect(instructions).toContain("This app's manual");
  } finally {
    store.close();
    rmSync(root, { recursive: true, force: true });
  }
});
