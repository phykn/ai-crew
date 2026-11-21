# AI Crew

An Electron desktop app. Model and tool calls and SQLite live in the main process, and the screen is a React renderer built by Vite. Work follows Groove: start from the first unfinished task.

## Modules

Source is split by the layer it runs in: `src/backend/` for the main process, `src/frontend/` for the
renderer, `src/shared/` for what both read, and `tests/` for the suite. `src/preload.ts` stays at the
top of `src/` because it is the bridge between the two.

- `src/backend/main.ts` · `src/preload.ts` · `src/frontend/renderer.tsx` — entry points. `main.ts` joins the store, models, MCP and workflow; `preload.ts` bridges IPC; `renderer.tsx` holds the window state.
- `src/backend/server/` — the main-process runtime. `app/` holds the action runner, the app MCP server, the assistant's app tools and the manual loader; `chat/` the local model turn, conversation continuity, the HTTP/SSE server, model cost and errors and the wiki tools; `codex/` the Codex connection, its per-thread MCP config and the generated protocol types; `diagnostics/` the environment check and the secret sanitizer; `mcp/` the external MCP client and tool approval.
- `src/backend/store/` — SQLite. `store.ts` is the class the app constructs; `base.ts` opens the connection and `migrations.ts` owns the schema, one file per subject holds its reads and writes (`jobs.ts`, `crew.ts`, `members.ts`, `memory.ts`, `workflow.ts`, `workspace.ts`, `changes.ts`, `run.ts`, `style.ts`, `audit.ts`), `snapshot.ts` builds the screen state, `skills.ts` holds the default skills and `camp.ts` the camp state.
- `src/backend/workflow/` — the job engine. `workflow.ts` runs one job; `base.ts` → `tools.ts` → `checks.ts` → `verification.ts` → `planning.ts` → `development.ts` stack the stages, `recovery.ts` resumes a stopped job, `graph.ts` holds the default flow and its validation, `prompts.ts` the reply schemas and stage prompts, `support.ts` the retry and ending rules, `engine-fence.ts` the stop and directory fences, `git-workspace.ts` the worktrees, `style-watch.ts` the file watcher and `workspace-files.ts` the reads and writes inside a project.
- `src/frontend/renderer.tsx` · `src/frontend/workspace.css` — the renderer entry and the one stylesheet, fonts and all.
- `src/frontend/ui/` — the renderer's views. `camp/` draws the camp with PixiJS and GSAP from `camp/art/` (one painted clearing, nine crew sprite strips, the log benches and the fire frames, all on the clearing's pixel grid), `chat/` the conversation with its composer keys, search, decision cards and status, `panels/` the workflow, wiki, worklog and memory panels with crew settings, toolbar, notifications and the diagnostics banner, and `common/` markdown, clipboard, text diff and the presentational parts every panel shares.
- `src/shared/` — the contracts the main process and the screen read together: action schemas and crew roles (`actions.ts`), role definitions (`crew-definition.ts`), the prompt budget for the project wiki (`wiki-reference.ts`), skill state, the chat queue and chat commands.
- `tests/` — every `*.test.ts` and `*.test.tsx`, in the same shape as the source it checks (`tests/backend/…`, `tests/frontend/…`, `tests/shared/…`). No test sits beside the code.
- `agents/` — the documents agents read: the app manual the assistant answers usage questions from, the app MCP, job execution and screen behavior specs, and `agents/skills/` — one Markdown file per default skill, seeded into every new project and read through a raw import in `src/backend/store/skills.ts`.
- `scripts/` — one-off tools: Codex type generation and the packaged-app smoke check.
- `demo/` — the browser mockup.

## Rules

- Product flow follows `agents/interaction.md`, and implementation order follows `docs/plan/PLAN.md`. `docs/` is a temporary note that leaves the repository; documents agents read live in `agents/`.
- The screen and the app MCP call the same behavior in the main process.
- A file belongs to one layer: `src/backend/` may not import `src/frontend/`, and a new test goes to `tests/` under the path that mirrors the file it checks.
- When a value, function, settings key or file name changes, change its callers, tests, documents and settings in the same job.
- Agent instructions are English. Text the user sees or hears — labels, logs, errors — stays in the user's language, Korean.
