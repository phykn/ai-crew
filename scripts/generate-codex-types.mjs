import { execFileSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";

const scratch = mkdtempSync(join(tmpdir(), "crew-codex-types-"));
const output = resolve("src/backend/server/codex/protocol");
const pending = [
  "InitializeParams.ts",
  ...[
    "ThreadStartParams",
    "ThreadResumeParams",
    "ThreadTurnsListParams",
    "TurnStartParams",
    "TurnInterruptParams",
    "CommandExecParams",
    "CommandExecTerminateParams",
  ].map((name) => "v2/" + name + ".ts"),
];
const seen = new Set();
try {
  execFileSync(process.env.AI_CREW_CODEX_BIN || "codex", [
    "app-server",
    "generate-ts",
    "--out",
    scratch,
  ]);
  for (let i = 0; i < pending.length; i++) {
    const name = pending[i];
    if (seen.has(name)) continue;
    seen.add(name);
    const source = readFileSync(join(scratch, name), "utf8");
    for (const match of source.matchAll(/from "(\.[^"]+)"/g))
      pending.push(join(dirname(name), match[1] + ".ts"));
    mkdirSync(dirname(join(output, name)), { recursive: true });
    writeFileSync(join(output, name), source);
  }
} finally {
  rmSync(scratch, { recursive: true, force: true });
}
