# AI Crew app manual

This manual is the evidence the in-app assistant answers from when it is asked "how do I use this app?" or "what is this button?". Screen names and features match the real code (`src/`) and nothing that does not exist is described. The app reads `agents/APP_MANUAL.md` at startup and puts it into the assistant's instructions, so editing this file changes the next conversation without rebuilding the app.

## 1. What this app does

AI Crew is a desktop app that opens one local folder of the user's as a project and lets the user **talk with a single assistant** while several roles work behind it. The assistant answers a simple question itself; a request that needs several hands, such as changing code, is planned and handed to roles like development, review, style and test, then reported back as one conversation. A file change goes through approval and verification, and who changed what stays in the job log and the audit record. All data stays on this computer.

## 2. Screen layout

| Place | What is there | How it is used |
|---|---|---|
| Left **camp** | A flat camp yard with a campfire at its center and a tent, a wagon, three log benches and a supply crate around it, the crew characters, role-colored name tags and states (waiting, planning, developing, verifying, not hired), collapsed **crew legend** | The characters show who is in which state now. The yard is flat grass with a dirt path and no sky, cliff or water, so the whole yard is walkable and the crew turns around the tent, the wagon, the campfire, the benches and the crates. Characters and props are sorted by their feet, so walking behind the tent, the wagon or a bench really hides a character and stepping forward puts it in front. When work is assigned, the assistant walks to the assignee and hands it over, and style and review watch beside the worker. Hovering the tent, the wagon, the campfire, a bench or the crates shows a tag, and pressing makes sparks rise and the firelight pulse. Hiring, name, model and skills are set on each legend row. In a narrow window the campfire button at the top switches between the camp view and the work view. |
| Top **toolbar** | Campfire (camp and work), chat, log, memory, workflow, pulse (environment diagnostics), bell (notifications), ≡ (session list) | A tab icon swaps the same right panel. The project folder is not at the top but on the **folder tag above the composer, beside the approval mode**. Pick a recent project there or open the operating system picker with "open folder…". |
| **Chat** tab | Assistant and user bubbles, composer, approval card, running-job banner | See section 4. |
| **Log** tab | Per-job activity (delegation, plan, change, verification, failure, retry), check results and evidence, and **model runs** (count, time, tokens and cost per role and model) | It can be narrowed to one job, and a completion report opens it with "job log". |
| **Memory** tab | Two sections: **memory** (project-wide and per assignee) and the **project wiki** (explorer and graph) | Memory is carried into the next conversation by the assistant. The wiki is a document the team shares, and its version and author stay. The explorer searches title and body and links on with chips for "pages that reference this page" and "pages this page points to"; the graph places pages by connection depth and opens the same page when pressed. The wiki is read before work by the assistant and every role, and confirmed rules, structures and decisions are written back. |
| **Workflow** tab | Stages and connections of a job flow, assignee role, run condition, handoff artifact, completion criteria, saved versions | Drag a node with the mouse to move it, and drag from its connection point onto another stage's connection point (or its card) to join the running order. Pressing a connection line shows a ✕ to cut it, or press Delete. Pressing a node edits name, assignee and condition on the line below. Saving the flow used for new jobs checks broken connections, cycles and missing required stages. |

## 3. The assistant and the eight roles

**The conversation happens only with the assistant.** Every message the user writes in the composer goes to the assistant. The other roles never talk to the user directly; they report results and questions to the assistant, which passes them on in the user's words. The tools that operate the app itself (reading screen state, finding an action, running an action) are used by the assistant too.

| id | Role | Name | Skills | When it runs | What it does |
|---|---|---|---|---|---|
| `assistant` | Assistant (비서) | 하나 | Chat · app control · delegation | Every message the user sends | The only conversation channel. Splits the request, plans, and gathers the returned reports; also runs the app-control tools |
| `hr` | HR (인사) | 지민 | Hire · fire | An instruction to hire or fire crew | Changes the roster with `crew.hire` and `crew.fire`; starting roles can be fired and rehired too |
| `development` | Development (개발) | 태오 | Code | The code-change stage of an approved plan | Writes the real files inside the approved scope, through the write permission and approval scope |
| `build` | Build (빌드) | 도윤 | Build · release | A build, package, publish or release stage | Runs builds, checks artifacts, prepares build facts for release notes; publishing waits for the user's confirmation |
| `docs` | Docs (문서) | 서연 | Documents | A request for a README, release note or guide | Writes documents (writing, not reviewing); never writes an unconfirmed feature |
| `style` | Style (스타일) | 유진 | Code · documents | **Every time a file is saved, automatically** | The style watcher: folder and file structure, file-name rules, comments and document sentences. It reports to the assistant and does not fix |
| `review` | Review (리뷰) | 현우 | Code · documents | A code or document review stage | Checks that a saved change does what was asked and that a document matches the real behavior; a point carries the file, line and evidence |
| `test` | Test (테스트) | 민재 | Tests | A test run stage | Runs the tests and fills missing cases; leaves the command and its result as evidence |
| `vision` | Vision (비전) | 수아 | Reading images | When an image or screenshot must be read | Reads and describes an image for a text-only local model; it never creates an image |

- Planning is **the assistant's job**, not a separate role, so the default flow is `plan (assistant) → development → (review ∥ style ∥ test) → report (assistant)`.
- `build`, `docs` and `vision` are not fixed in the default flow; they run when added as a stage in the workflow editor or when the assistant hands them that work.
- A role's instruction, skills and trigger are data (`roles` in `src/shared/actions.ts`), and the definition MD on screen and the agent prompt read the same content.

**Each role's working rules.** The instructions follow the user's code and document principles (user-wiki) and their way of finishing work (groove). Every role stays inside the scope the user set, separates what it confirmed from what it suggests, and speaks in changed lines, functions and files and in checks actually run. Development keeps a linear structure that reads in execution order, verb-first function names and a one-line why-only comment; it leaves no uncalled code, one-use wrapper or repeated check and fixes the cause and the source contract rather than the symptom. Documents put the conclusion first, delete wording that repeats the title or file name, and use only real file names and commands actually run. Review splits its points into facts and suggestions about whether a function is needed, its name and whether the fix is at the source contract, and style only watches the same criteria every time a file changes. Tests replace a heavy model with a small double to stay fast and leave one strong test and a regression test. Build runs the cheap checks first, the whole verification once at the end, and reports only the commands it ran and their results. The assistant asks only when an answer is not in the files and a wrong guess would be expensive, and hands work back only for plan approval, the same check failing twice, work only a person can do, and an irreversible action.

These rules are assigned with the role instruction as **default skills** (`groove-triage`, `roster-hygiene`, `groove-coding`, `lean-verify`, `concise-docs`, `code-style`, `docs-style`, `code-review`, `docs-review`, `fast-tests`, `faithful-reading`). They are planted once when a project is first opened and can be read or removed in the legend. A removed default skill is not planted again.

### Composer and queue

Write in the composer and press **Enter** and the message goes to the assistant at once. When the assistant is still answering, that answer is cut right there and the new message is answered first. The answer made up to the cut is not discarded: it stays as "stopped", and the next answer carries on from it and closes what is needed.

- **Ctrl+Enter** (**Cmd+Enter** on macOS) queues without cutting. When the earlier answer ends, the queued messages are answered in the order they were added. Waiting messages show as numbered chips above the composer, and the ✕ on a chip removes one.
- **Shift+Enter** breaks the line.
- Enter pressed while a Hangul syllable is being composed does not send (it only finishes the composition).
- A line under the composer always lists these shortcuts, and a narrow window hides only the approval mode's text label while keeping the shield and folder icons.

### Attaching pictures (picker, paste, drop)

The **picture icon** on the left of the composer's control bar opens a file picker. The same thing can be done three ways.

- **The picture icon** picks png, jpeg, webp or gif files (several at once, up to 6 files, 8MB each).
- **Ctrl+V** (**Cmd+V** on a mac): capturing the screen and pasting into the composer attaches it as a picture. Pasting text works as usual.
- **Drag and drop**: dragging a picture file over the composer shows where the card will take it, and dropping attaches it.

Attached pictures show just above the composer as a **small thumbnail, file name and size**, and ✕ removes one. With a picture attached, send is enabled even without text. A sent picture stays as a thumbnail inside the user's bubble, and the assistant answers from the description the vision role read. Picture files are stored per message in `attachments/` of the app data folder, not in the project folder.

> The model that reads pictures is marked separately in **model connections** (legend → settings → model connections → **as vision**). Without a marked connection the assistant cannot read the picture and gets only the file information (name, type, size). In that case it says plainly that it could not read the picture and that a vision model connection is needed.

## 4. Hiring and firing crew

In the crew legend:

- The **hired / not hired** button on each row changes the hire state right there.
- Pressing the **name** edits it, and the selector beside it sets the **model (local LLM or Codex)**.
- **＋ member** adds another member with the same role (the assistant role is not added).
- **Settings** shows that member's role definition, assigned skill MD, MCP tool permissions and memory.
- Only the development role has a **write allowed / write revoked** button. Revoked, that member cannot write files.

Told in words through the assistant, the HR role runs two actions.

- `crew.hire`: `{ projectId, roleId, name?, provider? }`. Hires a fired role again and sets the name and model.
- `crew.fire`: `{ projectId, memberId }`. Removes that member from the roster.

**The nine starting roles are a roster you start with, not an unremovable crew.** A fired member leaves the camp and stays as "not hired", and comes back when hired again. A firing or hiring stays in the log and in the **audit record** (`crew.roster`). Work assigned at the time is tidied by the existing procedure.

> Firing the assistant leaves nobody to talk to. Sending a message then says "hire the assistant back in the crew", and the assistant must be hired again from the legend.

## 5. The style watcher and the reviewer's two skills

`style` and `review` each have a **code** skill and a **document** skill.

| | Code skill | Document skill | When |
|---|---|---|---|
| Style watcher (`style`) | Folder and file structure, file and folder naming rules, comments | Whether a document's sentences and structure follow the project rules | Without a command, **every time a file is saved**. Not at commit time |
| Reviewer (`review`) | Whether the saved change does what was asked | Whether a document matches the real behavior | At a job's review stage, reading the same change version |

The style watcher's result is **a report to the assistant, not a user bubble**. When a file change arrives, the log records `스타일 → 비서 · 파일 변경 감지 · <path>`, and the report is delivered once the next time the assistant reads and is not delivered again. The assistant tells the user briefly and offers a check by the style role when it matters.

> A file-change notice is attached today at the moment **applying a job (`job.apply`) finishes**. The operating system file watcher is not turned on yet; only the entry point where code that changes a file calls `noteFileChange` exists.

## 6. The tester

At a verification stage the test role **runs the tests** and also **fills test cases** a request needs but lacks. It leaves the command and its result (pass or the failure reason) as evidence, and reports the cause to the assistant when a test fails. When a check cannot run in this environment it marks it "unavailable" and never counts it as a pass. In the log's change record the review, style and test results are read side by side.

## 7. Vision (reading pictures)

Vision **only reads pictures**. For a text-only local LLM it writes down what is visible in an image or a screenshot, what state the screen is in and what words an error window holds. It does not create pictures.

**Today it really reads a picture attached to the chat.** When the user sends a picture by attaching, pasting or dropping it into the composer, vision reads that picture before the assistant answers and makes a description, and the description goes into the assistant model right after the user message. The description stays on the picture, so the next turn does not ask again.

- The reading model is the endpoint **marked as vision in model connections** (OpenAI-compatible). With several marked connections the first one is used. `AI_CREW_VISION_URL` and `AI_CREW_VISION_MODEL` can set it as well.
- When there is no vision model, or it does not answer, **only the file information stays and it says plainly that it could not read it.** The assistant does not invent the content and briefly says what is missing (a vision model connection).
- A failed read is not stored on the picture, so after the connection is fixed the same picture is read again by a new message.
- An assistant running on Codex receives the same description text (the picture bytes themselves are not passed to Codex).

## 8. Environment diagnostics (`diagnostics.run`)

Pressing the **pulse icon** (environment diagnostics) in the toolbar checks in one pass the conditions this run needs. Telling the assistant "run environment diagnostics" runs the same action (`diagnostics.run`).

| Check | What it looks at |
|---|---|
| Git repository | Whether the project folder is a Git repository, and its current state |
| Codex CLI | Whether it is installed and can run |
| Local model | Whether the configured address (default `http://127.0.0.1:8082/v1`) answers |
| MCP server | Whether a connected server answers |

The result shows as a green or red dot for each check in a one-line banner over the camp, and hovering shows the detailed reason. Diagnostics change no state.

## 9. Approval flow and audit log

**Approval mode** (the selector above the composer) has three settings.

- **Manual**: the user allows a file change or tool call directly.
- **Auto**: the assistant decides and allows.
- **Always**: a request inside the current role's permission is allowed automatically.

A job that changes files first shows its plan (target paths and completion criteria) and takes **allow or refuse** on the card above the composer. With several waiting, the card head shows "waiting +N" and "next", and an answer applies only to that card's request ID. A change tool on an MCP server is approved separately too.

A decision that touches the user's resources — an approval, a refusal, a model connection change, applying a worktree, hiring or firing crew — goes into the **audit record** (`audit_logs`). The text is scrubbed of secrets before it is stored. The job log (activity) and the audit record are different: activity is the chronological record of what happened, and the audit record is who decided what.

## 10. Attaching from another program (local HTTP and SSE)

The code holds a small HTTP server that uses the app's state, actions and events directly (`createCrewHttpServer` in `src/backend/server/chat/http-server.ts`). It opens only on `127.0.0.1` and requires the token made at startup.

| Request | What it does |
|---|---|
| `GET /health` | Checks that it is alive (no token) |
| `GET /api/snapshot` | The current screen state (JSON) |
| `POST /api/action` | Runs an action with the same runner as the screen (the body is the action JSON itself) |
| `GET /api/events` | SSE. Stream chunks and state changes, with a periodic `: ping` |

```sh
curl -H "authorization: Bearer $TOKEN" http://127.0.0.1:PORT/api/snapshot
curl -X POST -H "authorization: Bearer $TOKEN" -H "content-type: application/json" \
  -d '{"type":"app.state"}' http://127.0.0.1:PORT/api/action
curl -N "http://127.0.0.1:PORT/api/events?token=$TOKEN"
```

EventSource cannot send a header, so only the stream accepts `?token=`. The same request ID with the same arguments returns the first result again.

> This server is not started automatically when the app opens yet. Only the module and its test (`tests/backend/server/chat/http-server.test.ts`) are ready, so attaching it means calling `createCrewHttpServer` from the app's startup code. Do not answer that it "opens automatically when the app starts".

## 11. Common mistakes and cautions

- **There is no way to pick a role and talk to it.** Input always goes to the assistant, and the other roles move through the assistant.
- **The style watcher looks when a file is saved**, not when it is committed. A comment can appear without a commit.
- **Revoking the development role's write permission** stops a file-change job. It must be allowed again in the legend.
- **Approval "always" is not unlimited.** It auto-approves only inside the current role's permission.
- **A message sent while the assistant answers** is not lost; it is answered after the earlier answer ends. Pressing stop folds the waiting message too.
- **`/clear`** opens an empty conversation that inherits the same project settings (team, model, workflow). It is not a command that builds a new team.
- **"Do that again"** and similar words pointing at an earlier job go through a step that picks the target job. When the target is ambiguous the assistant asks.
- **On a model limit** the job stops and reports what was saved so far and what remains. A transient dropped connection is retried up to three times in the same stage.
- Projects and conversations are stored in the app data folder's SQLite (`crew.sqlite`). `AI_CREW_DATA_DIR` moves it. Files in the source folder change only when the app applies a change it made.
- The local model address defaults to `http://127.0.0.1:8082/v1` and is changed with `AI_CREW_LOCAL_URL` and `AI_CREW_LOCAL_MODEL`.
- **Reading pictures (vision)** reads only a picture attached to the chat. Without an endpoint **marked as vision** in model connections it cannot read the content and keeps only the file information.
- **The local HTTP server** does not start automatically yet.
