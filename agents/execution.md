# Running and recovering work

Input resent with the same request ID is accepted once. The same sentence the user sent separately is a new request. A plan, a handoff between roles, a change, a verification and a user decision all hang off the same job ID. The screen and MCP share one set of behaviors, described in [the app helper spec](app-mcp.md). The rules below take AgentsRoom's operating behavior and make it concrete for AI Crew.

## State changes and user decisions

| Event | Next state | How it is handled |
|---|---|---|
| A collaboration request arrives | Planning | Link the request ID to the job ID. |
| A required decision or an earlier piece of work is still open | Waiting | Store the current reason: plan review, tool approval, a reserved assignee or file. |
| The precondition and the permission are confirmed | Running | Start one stage with the approved change scope and the execution ID. |
| A change or an artifact is settled | Verifying | Hand the latest instruction and the change version to the assignee who must verify it. |
| A required check fails | Fixing | Fix the same job from the failure evidence. Repeat fix and re-check up to three times. When the check itself cannot run, report the checks that remain. |
| The required checks pass | Complete | Report once every required stage that applies has confirmed that version. A stage that does not apply is left out of the join's waiting set. For an isolated run, report the state of the original folder as well. |
| The user stops the work | Stopping → Stopped | When the stop is stored first, close later assignments. A late result stays in the history, and the scope is released only after the real stop is confirmed. A completion settled earlier stays. |
| Recovery is impossible, or the model limit is reached | Failed or Stopped | On a transient error, retry the same stage up to three times after the first try. On reaching a model limit, stop that job and report what remains. |

Plan approval and tool-call approval each use their own request ID and version. A tool call checks the assignee's current permission immediately before it runs. Manual means the user decides. Auto means the assistant judges scope and purpose and asks the user when unclear. Always auto-approves a request inside the current role's permission. A new approval request is made when the assignee or the tool changes, or the scope grows. A question already accepted keeps its original decision flow.

## Plans, handoffs and follow-up instructions

- **Plan versions.** Every time the planning assignee stores scope, files or artifacts, completion criteria, expected risk and follow-up checks, a new version is made. The assistant normally handles the review and the handoff. When the user asked to confirm before running, or the flow has a user-confirmation stage, it waits for the decision on that version. Comments attach to a plan version and a stage ID, and re-submitting a revised plan lets the changed scope and criteria be compared. An answer to an earlier version cannot start a new plan. Plan approval and file or tool-call permission keep their existing rules.
- **Handoff shape.** Store the job, stage and attempt IDs, the sender and the receiving assignee, the instruction, workflow and change versions, artifact references, change scope, risk, verification evidence and what remains. A later stage or a conditional branch starts from the state and values of a verified handoff. When a required reference is missing, ask for it in the same handoff. A message delivered twice still runs once.
- **Messages waiting.** Keep an unsent draft apart from an instruction already accepted. When the runtime supports interruption, attach the instruction to the current run of the named job. When it does not, record an instruction version on that job first and apply it in order at a safe stage boundary. When the target or the reference version changes, read the current state and settle the scope again. An independent job and a conversation draft keep their own states.
- **When verification goes back to development.** When the same assignee can take the same job, pass the review evidence and the new version into its earlier session. A verification result is bound to the change version it checked. A late result stays in the history, and the newest evidence is what satisfies the required checks of the newest change.

## Change scope and change evidence

The default is to reserve a scope inside the folder the user opened and work there. In a Git project, when the user chooses an isolated run, each job gets its own worktree. Development, review, style and test for the same job read the same change in that worktree.

| State | Backend behavior |
|---|---|
| Preparing | Record the source project, the base commit, the working branch and worktree, and the target branch on the job. When uncommitted changes are needed as the base, ask the user whether to work in the source folder or to make a separate approved base. Copy settings and secrets and prepare the build from the items approved in the project. |
| Working and verifying | A write is approved within the normalized file scope and reserved against the real workspace. Store the version before and after, the per-file change, the visible author and the execution ID. Compare before and after a command to see what changed. When authorship overlaps, mark the source as unconfirmed. |
| Reporting a result | Separate changes that existed before the job, changes this job made, and external changes that arrived during verification. Bind a report or a review comment to a specific change version and file location. When the user points at a single line, accept it as a follow-up instruction on the same job with the file, change version and range. |
| Applying to the original | Record verification and applying to the original as separate states. On a request to apply, read the original's current branch and state and check whether the same verification result still applies. When there is a conflict or an original change that must be kept, record `waiting to apply` and tell the user why. When the run ends, store the change, the verification result and the artifacts to keep in the app data. Confirm how unreleased edits should be handled, then clean up the workspace. |

## Recovering sessions and processes

When a stage changes or an external effect is settled, record the current goal, decisions, running stage, assignees, model-run references, the last confirmed change and verification, open requests and what remains in a checkpoint. Checkpoints live in the app data, so a log can be opened even after the working directory is closed or cleaned up.

- When the user says to continue, look up the earlier run first. When it can resume, use the same agent session. When a context limit, an expired run or a provider change makes that hard, read only what is needed from the checkpoint and hand it to a new run of the same job. Record why the earlier run was replaced.
- Tell a dropped connection apart from a real stop. Bind the model runs, tool requests and child processes you own to the execution ID, and after stopping, close later assignments and confirm that the runtime actually stopped. Until the stop is confirmed, keep the change scope reserved. When it is unclear whether an external effect landed, check by reading it before deciding to run it again.
- When no progress signal arrives or a process resource looks wrong, log the evidence and when progress was last seen. An observed model limit follows the existing stop rule. Record usage and cache figures as the runtime reports them.

## Artifacts, skills and notifications

- **Artifacts.** A document, report, data file or preview carries the project, job, authoring assignee, change version, display name, format, real location and hash. A report, a log and MCP read the same artifact ID. Opening one checks the current access right and whether the file is valid; an HTML preview is shown in an environment whose app-control permission is separate. When a file needed to read it moves, the original source can still be found in the record.
- **Skills and memory.** Keep the registered source of a skill, the applied version, the call condition, and the model features, MCP servers and permissions it requires. When a stage runs, choose among the skills assigned to the role the ones that fit the job and the current permission, and record a use event. Project rules and run steps confirmed by verification can go into the shared wiki with their source job and version. Personal memory and shared knowledge keep their existing read scopes.
- **Notifications.** A notification comes from an event already settled in the job record: waiting for a user answer, a final report arriving, a stop that needs the user. Once the state is stored, an event ID notifies once. It links to the project, session, job or approval question and opens that place in the original conversation when pressed. A read mark is applied after the target is confirmed. Ordinary peer calls and progress logs are read inside their job.

## Acceptance scenarios

1. Revise a plan, then deliver the earlier version's approval and handoff again. Only the newest approval runs, and the same job and change history continue.
2. Edit the same file name in two worktrees. Neither touches the other's file, and each job's review and test read its own change. Applying a conflicting change keeps the original change and waits.
3. A review asks for a fix and the existing model session then expires. The new run starts from the checkpoint, and verification results for the earlier version do not mix into the completion of the newest one.
4. Restart with a stored instruction and deliver a waiting-approval notification twice. The instruction applies once and there is one notification. Opening the notification goes to the question.
5. Clean up only the worktree while keeping the result files. Earlier reports, artifacts and verification evidence are still reachable from the log and MCP.
