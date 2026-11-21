# AI Crew

An Electron desktop app. Model and tool calls and SQLite live in the main process, and the screen is a React renderer built by Vite. Work follows Groove: start from the first unfinished task.

## Modules

- `src/main.ts` · `src/preload.ts` · `src/renderer.tsx` — entry points. `main.ts` joins the store, models, MCP and workflow; `renderer.tsx` holds the window state.
- `src/shared/` — the contracts the main process and the screen read together: action schemas and crew roles (`actions.ts`), role definitions (`crew-definition.ts`), the prompt budget for the project wiki (`wiki-reference.ts`), skill state, the chat queue and chat commands.
- `src/store/` — SQLite. `store.ts` is the class the app constructs; `base.ts` opens the connection and `migrations.ts` owns the schema, one file per subject holds its reads and writes (`jobs.ts`, `crew.ts`, `members.ts`, `memory.ts`, `workflow.ts`, `workspace.ts`, `changes.ts`, `run.ts`, `style.ts`, `audit.ts`), `snapshot.ts` builds the screen state, `skills.ts` holds the default skills and `camp.ts` the camp state.
- `src/workflow/` — the job engine. `workflow.ts` runs one job; `base.ts` → `tools.ts` → `checks.ts` → `verification.ts` → `planning.ts` → `development.ts` stack the stages, `recovery.ts` resumes a stopped job, `graph.ts` holds the default flow and its validation, `prompts.ts` the reply schemas and stage prompts, `support.ts` the retry and ending rules, `engine-fence.ts` the stop and directory fences, `git-workspace.ts` the worktrees, `style-watch.ts` the file watcher and `workspace-files.ts` the reads and writes inside a project.
- `src/server/` — the main-process runtime. `app/` holds the action runner, the app MCP server, the assistant's app tools and the manual loader; `chat/` the local model turn, conversation continuity, the HTTP/SSE server, model cost and errors and the wiki tools; `codex/` the Codex connection, its per-thread MCP config and the generated protocol types; `diagnostics/` the environment check and the secret sanitizer; `mcp/` the external MCP client and tool approval.
- `src/ui/` — the renderer. `camp/` draws the camp with PixiJS and GSAP, `chat/` the conversation with its composer keys, search, decision cards and status, `panels/` the workflow, wiki, worklog and memory panels with crew settings, toolbar, notifications and the diagnostics banner, and `common/` markdown, clipboard, text diff and the presentational parts every panel shares.
- `agents/` — the documents agents read: the app manual the assistant answers usage questions from, and the app MCP, job execution and screen behavior specs.
- `scripts/` — one-off tools: Codex type generation and the packaged-app smoke check.
- `demo/` — the browser mockup.

## Rules

- Product flow follows `agents/interaction.md`, and implementation order follows `docs/groove/PLAN.md`. `docs/` is a temporary note that leaves the repository; documents agents read live in `agents/`.
- The screen and the app MCP call the same behavior in the main process.
- When a value, function, settings key or file name changes, change its callers, tests, documents and settings in the same job.
- Agent instructions are English. Text the user sees or hears — labels, logs, errors — stays in the user's language, Korean.
