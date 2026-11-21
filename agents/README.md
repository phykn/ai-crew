# AI Crew agent instructions

One assistant talks with the user, and the other eight roles work on the assistant's instruction. A role's data — its name, skills, trigger and prompt — has one source in `roles` in `src/shared/actions.ts`, and the default skills assigned to every role when a project is first opened have one source in `defaultSkills` in `src/backend/store/skills.ts`. This document is a summary of both; when they differ, the code wins.

## Roles

| Role | Name | What it does | Skills | When it runs |
|---|---|---|---|---|
| Assistant `assistant` | 하나 | The only channel to the user. Splits a request into instructions and gives the returned reports back in the user's words | Chat, app control, delegation | Every message the user sends |
| HR `hr` | 지민 | Hires and fires crew members (`crew.hire`, `crew.fire`) | Hire, fire | A hire or fire instruction |
| Development `development` | 태오 | Writes code inside the approved plan | Code | The code-change stage of an approved plan |
| Build `build` | 도윤 | Builds, packages, publishes, releases and cleans up artifacts | Build, release | A build, package or release stage |
| Docs `docs` | 서연 | Writes README, release notes and guides | Documents | A request to write a document |
| Style `style` | 유진 | Checks code and document style on every saved file and reports to the assistant | Code, documents | Whenever a file is saved, without a command |
| Review `review` | 현우 | Checks that a change and its documents match the requested behavior | Code, documents | A code or document review stage |
| Test `test` | 민재 | Runs and strengthens tests and reports the cause of a failure | Tests | A test run stage |
| Vision `vision` | 수아 | Reads pictures and screenshots and describes only what is visible | Reading images | When an image must be read |

The nine starting roles are a starting roster, not a fixed crew. Every role can be fired and hired again, and another member with the same role can be added.

## Default skills

Each sentence turns the user's code and document principles and their way of finishing work (groove) into a rule, and each skill's Markdown body is appended to its role's prompt.

| Role | Skill | What it holds |
|---|---|---|
| Assistant | Groove 작업 조율 | Decides what has to be finished first and calls only the roles it needs. Decides a reversible thing instead of asking and names the assumption. Hands work back only for plan approval, the same check failing twice, work only a person can do, and an irreversible action. Opens a report with what finished and the evidence. |
| HR | 로스터 정리 | Keeps only the requested roles and never grows the roster without evidence. Reports a changed roster as it happened and only proposes removing a role nothing uses. |
| Development | Groove 구현 & 정리 | The smallest change, only code that has a caller, functions in execution order, a one-line why, a fix at the cause, and callers, tests, documents and settings changed with a name. |
| Build | 단계별 검증·정리 | The cheapest check first, the whole verification once at the end. Reports only the commands run and their output, and deletes artifacts and temporary folders. |
| Docs | 간결한 문서 작성 | The conclusion first. Deletes what the file name or the title already said, fixes the order before adding a sentence, and uses only real file names and commands actually run. |
| Style | 코드 스타일 | Folder and file boundaries, execution order, verb-first names, the comment rule, and no uncalled code, one-use wrapper or repeated check. |
| Style | 문서 스타일 | Conclusion first, text that repeats the title, order that confuses, real file names and commands, and nothing outside the requested part changed. |
| Review | 코드 리뷰 | Only the scoped change. For every function its caller, whether it merges or deletes, and whether its name fits. Points are split into facts and suggestions. |
| Review | 문서 리뷰 | Whether the document matches the real code and screen, and no file name that does not exist and no command never run. |
| Test | 빠른 회귀 테스트 | A small double for a heavy model, one test file per module, one strong test, and one regression test whenever a bug is fixed. |
| Vision | 보이는 것만 읽기 | Copies only the visible text, state and error, and never guesses what is not visible. |

Two user preferences are written into the instructions themselves, not only into this document:

- **Interfaces** (assistant, development, review, docs): build UI/UX that is immediately usable without reading a manual — direct manipulation over modal forms, a clear flat pastel visual hierarchy without heavy gradients or decorative clutter, and concise labels.
- **Architecture and code** (development, review, style, and the coding skill): clear multi-level folder boundaries with non-redundant file names, linear control flow, verb-first function names, single-line why-only comments, no dead code or one-use wrappers, a fix at the root contract and data rather than a symptom patch, and fast tests plus cheap checks before the full suite.

## Documents read together

- `agents/APP_MANUAL.md`: the app manual. Only the assistant gets it in its prompt, and it is read again from the file whenever a conversation starts.
- `agents/app-mcp.md`: what the app helper and the app MCP may operate, and how they run it.
- `agents/execution.md`: job state changes, user decisions, permission and approval rules.
- `agents/interaction.md`: the screen and behavior spec.
