# AI Crew screens and behavior

The camp shows who is working, the conversation with the assistant decides the next action, and the log holds the evidence. State changes and permissions follow [running and recovering work](execution.md).

## Work space

| Place | Default screen | What you do there |
|---|---|---|
| Left **camp** | A flat yard with a campfire, a tent, a wagon, three log benches and a supply crate, the characters, role-colored name tags, collapsed crew legend | Open a crew member to check hired state, model and skills and to manage them. Press a working character to go to that job's detail or approval question. |
| Right header | Project switch on the left; chat, log, memory and workflow icons on the right; session list | Read an icon's name with the pointer or keyboard focus. Tabs swap the same panel. The project button picks a recent folder or opens the operating system picker; the session list opens right under the button and shows only this project's conversations. An open menu closes on an outside click or Escape. |
| Chat header | One-line status banner with the crew member, current stage and goal of the running job, and the list of running jobs, unfolded only when there is more than one | The banner also reports waiting approvals and questions; pressing it opens that job's log, and the `camp` control beside it switches to the camp view. With a single job, that job's stop or continue sits at the end of the same line. Every job keeps its title and current stage on one line; the title opens handoff, state, follow-up, stop and log. The approval request you have open sits above the composer. The rest of the waiting approvals are chosen from the top. |
| Chat body | Assistant bubbles on the left, user bubbles on the right | An assistant bubble reads as headings, lists, inline code, links and code blocks with a language label and a copy button. Focusing or hovering a bubble shows a message copy button at its top right inside the bubble, and the text leaves that place free. While reading up, `jump to latest` at the bottom right returns to the newest message. A report opens the job log; an interrupted report lets you continue. |
| Chat footer | Composer card at one fixed place, with the control bar under it | The composer is a single floating card: the top grows from two lines to 160px as you write, and a thin rule separates the control bar below. On the left of the bar sit the project folder tag and the approval-mode pill (shield icon plus a short label; a narrow window keeps only the icon), and on the right is the primary send button (stop stands beside it while answering). Queued messages show as numbered chips above the card, each removed with ✕. A line under the card always lists the shortcuts. A permission request is answered on one card just above the composer. |

On a wide screen the camp fills the left edge of the window and shares one boundary line with the work panel. On a narrow screen the camp view and the work view are switched and read the same session. Width, spacing and typography of the right panel follow the [design tokens](../demo/tokens.css). A title on screen identifies the document, job or option being used. Icons carry an accessible name and a focus mark. The accent color marks the current tab, the primary action and the user's decision. A role color marks the name tag and the work animation. A character's tag and line sit on one line over the horizontal center of the body.

## From request to report

| State | What the user can do | Screen and result |
|---|---|---|
| New conversation or draft | Enter sends, Ctrl+Enter (Cmd+Enter on a mac) queues, Shift+Enter breaks the line | Enter pressed to finish a Hangul composition neither sends nor queues. The composer stays where it is before and after sending. A question the assistant can answer itself makes only two bubbles. |
| Collaboration request | Press the job title to open its detail | The request is linked to a job ID. When a stage changes, only the top line is refreshed and the camp reflects the same state. |
| A user decision is needed | On one card above the composer, read the permission scope and the requester, then allow or refuse | With several decisions waiting, only the highest-priority one is shown, with `waiting +N` and `next` at the head of the card. An answer applies once, to the request ID on the card. When the approval scope grows, the changed scope is shown above the composer. After the question is replaced, a click from the earlier card shows the current question again. An answered question closes and the decision stays in the log. A result that started with an allow or ended with a refuse is shown. A general question that needs another answer is shown in its own assistant bubble. |
| Answer being generated, or a job running | Choose stop. With a draft written, send (Enter) or queue (Ctrl+Enter) also works | Stop applies to one response or one job attached to the button, and folds the messages that were waiting. Send cuts the current answer right there and answers the new message first; the part already made stays with the stop reason and the next answer takes the beginning over and knows that the new message is what cut it. Queue adds without cutting and answers in turn after the earlier answer finishes. With several runs, the target job name is read at the composer. Stop in a job detail applies to that job. A double click or key auto-repeat does not run a second action that appears behind the first. |
| Follow-up instruction | In the job detail, choose `follow-up` and write | The composer shows the target. Reading another card keeps the draft's recipient. When the target ends, the draft is kept and sending waits. Clearing the link or saying it is a new job sends it as a separate request. When `do that again` could mean several things, the assistant asks which. |
| Stop and continue | `continue` in the interrupted report | First show `complete` or `stopping` from the stored state. Once the stop is confirmed it becomes `stopped`, keeping the real change and the draft. When whether an external action ran cannot be checked, the assistant's question is shown. Continue starts only the stages that are needed from the last confirmed state. |
| Complete or failed | Open that job's log from the report | The finished job leaves the top line. The report keeps the result, what blocked it and what is unconfirmed. The log ties together handoffs, completion criteria, change versions, review comments and test results. |

A job waiting, retrying, firing a member or resuming all record their events under the job ID. When a peer asks directly, it hands over the request scope, the expected result, the receiving role and the artifacts, and runs with the receiver's permission. When change scopes overlap or the same assignee is already running, the later job waits. When the earlier job ends, it checks the latest change and completion criteria. A transient error and a fix-and-recheck each retry up to three times, and a model limit stops the job after reporting the progress so far.

The place you were reading in a conversation or a log, and the evidence you unfolded, are kept while state refreshes. New messages are followed only when you were reading the newest one. An approval request in another session is counted on the session list icon and answered once that session is open.

## Repeated operations

| Operation | Result |
|---|---|
| Choosing the project folder | Pick a recent folder from the project tag above the composer (beside the approval mode) or open the operating system picker. A narrow window still shows the current project name, shortened with an ellipsis. Cancel returns to the earlier input and focus. Re-opening the same project loads its last session. When the folder moved, the record is kept, the base files and access are checked, and the job resumes. |
| Camp moving on its own | A crew member with assigned work walks to a work spot — by the campfire, in front of the tent, the wagon or the crates, on the path, or in the east or west yard — and works there; a resting member moves every 6 to 12 seconds to one of the three log benches or to a walking point on the grass. Only one or two walk at a time, and one bench holds one member. The assistant walks to the assignee who just took new work and shows a `delivered!` bubble, and style and review watch beside the development or document worker. The tent, wagon, campfire, benches and crates are walked around, not through. Hovering one of them shows a tag, and pressing it reacts: sparks spread and the firelight pulses. |
| Approval mode | Manual means the user decides, auto means the assistant decides, and always auto-approves a request inside the current role's permission. A mode change applies from the next permission request. A waiting question is answered where it stands. The same rule covers a new request, a revoked permission and a temp member. |
| Session list and slash commands | The first request makes the conversation title, and the list shows title and latest activity. A new conversation starts from the project settings. Choosing an earlier session continues its stored context and draft. Commands appear only while you type `/` at the composer, are chosen with the up and down arrows, filled with Tab or Enter, and closed with Escape. Sending `/clear` alone opens an empty session that inherits the team, model and workflow. New jobs use the current permission and the latest workflow; an existing job continues in its original session. |
| Deleting a session or removing a project | The list asks which records to delete. A running one is stopped first. Files in the source folder stay; when a live wiki page references a deleted session, its source reads `deleted session`. |
| Log | The full record reads events by time, role and result. Entering from a job name or a report link shows only that job. On a wide window it opens beside the conversation and folds with the close button; on a narrow one it opens as the log tab. Moving to another tab or the camp folds a side-by-side log, and coming back does not unfold it again. Clicking unfolds completion criteria and evidence. A missing cost reads `not provided`. |
| Memory | Project wiki and agent memory are kept apart. The wiki list and a node open the same page, and author and source are checked inside it. The history shows author, time and what changed. An assignee's memory unfolds in that member's row. |
| Editing and deleting memory | A wiki save and its history are one transaction. On a conflict the existing text and the draft are kept. Deleting memory with a related rule asks whether to delete only the memory or drop the rule too, and keeps the version of any running execution. |
| Workflow | React Flow reads top to bottom. Dragging a node body stores its place as the coordinates. Dragging a node's connection point onto another stage's connection point or onto its card links the running order, and a duplicate link or a link to itself is never made. Pressing a connection line shows a selection mark and a ✕; the ✕, Delete or Backspace cuts it. Pressing a node edits name, assignee role, run condition and required in the property line under the canvas, and unfolds `completion criteria and handoff artifact` for the rest. There is no separate form for picking a source and a destination stage. Versions and the editing draft are kept per project. |
| Saving a workflow | Connections, cycles, required joins and a completion path are checked. A failed draft stays in the editor. By default the next new job uses it. When the user applies it to the current job, only the affected stages are recalculated. A stage skipped by its run condition and a failed required stage each show the reason in the log. |

## Camp screen

The left screen shows a flat camp: grass and a dirt path with no sky, cliff or water, so the whole yard can be walked. A campfire burns at the center, with a tent at the upper left, a wagon at the upper right, three log benches around the fire and a supply crate at the lower left. Props are drawn at an isometric three-quarter view and characters face forward in HD-2D, and both are sorted by the point under their feet, so a character walking behind the tent, the wagon or a bench is really hidden and stands in front when it comes forward. The pixel-art camp takes Diablo 2's classic 2D view seen at an angle, Red Dead Redemption 2's mood of companions gathering around a fire, and Stardew Valley's warm, readable ground. Each character has its own silhouette and motion, and its name tag — edited in the legend — sits above it in its role color. The tag and the line or work state are joined on one line and the line's horizontal center is set on the character's center. The same rule holds when only the tag shows.

The screen shows the real work state through where each character is and what it does. The goal is that a person can tell who is working and whose answer is awaited before reading a long sentence. Below is the same development job shown in the camp.

| What actually happened | What the camp shows |
|---|---|
| The plan is handed to the development assignee | The assistant walks to the development assignee and offers a scroll. |
| Implementation, test and review run | Characters move about the camp. A short hand seal-like gesture lights a magic circle under their feet and the real work appears beside the name, such as `running tests`. |
| A style comment is passed on | The style assignee comes over to the implementer and hands over a note. |
| Waiting for the user's answer | The assistant comes near the campfire and raises a question mark. |
| A job fails or stops | The motion stops and shows what blocked it. Choosing it opens the related log. |
| Review done and reported | The assistant comes back with the result and the report arrives in the chat. |
| Hiring, rehiring and firing | A hired or rehired agent walks in from off screen, and a fired one walks out. |
| No assigned work | Characters sit on one of the three log benches or stroll across the yard. In the morning a line such as "did you have breakfast?" and in the evening "time to rest a little" appears now and then, fitting the time and situation. |

The camp is where real progress is shown in a pleasant way. Pressing a character or a handoff scene opens the related job card or log. With no work, characters walk along camp paths by themselves or sit near the campfire. When an idle companion comes close it says a short line that fits the time and situation, and the other can answer. The initial staging uses fixed motions and lines. Once a real delegation or job starts, the work state beside the name takes priority. [AI Office](https://engchoon.github.io/ai-office/), [OpenClaw Office](https://github.com/wickedapp/openclaw-office), [Generative Agents paper](https://arxiv.org/abs/2304.03442)

## Crew legend

The collapsed button shows how many members can take new work, such as `crew · 4 hired`. Unfolded, one row shows the `hired` or `not hired` state, the model and the assigned skills. Role and name tag stay together, and a narrow window moves model, definition MD and skills to a second line in the same row. Row order stays when a state changes. A not-hired row is toned down and states it in words.

| Hired | Role and name | Current job | Model and definition MD | Assigned skills |
|---|---|---|---|---|
| Hired | Development · 태오 | Search improvement | Codex · MD | Write code (in use), project wiki (ready) |
| Hired | Review · 현우 | Waiting | Local LLM · MD | Code review (ready), change diff (unavailable) |
| Not hired | Test · 민재 | — | Local LLM · MD | Run tests (unavailable) |

A skill shows in the row as an icon for its purpose. The state in brackets in the example is read from the icon and its preview. When space runs short, `+N` opens the rest. Icons in use and icons waiting for approval or unavailable come first, and inside one state the assignment order holds. Focusing an icon with the keyboard or pointer reads its name, one-line purpose and current state. Clicking or touching it opens that skill in the member detail.

| Operation | Screen and handling |
|---|---|
| Hired state | Pressing `hired` offers firing; pressing `not hired` offers rehiring. Once a firing is confirmed the row reads `not hired` right away and new assignments close. A regular member stays in the list with its settings, while a temp member leaves the list. Work being tidied is checked in that job's state and log. The character walks out after leaving a result or an interrupted handoff. A successor takes over the handoff material and what remains. |
| Name tag and job | Pressing the name beside the role edits it in place. Enter saves, Escape cancels. Pressing the current job name opens that job's detail. With several jobs it reads `search improvement and 2 more`, and the title list picks one. |
| Model and definition | Pressing the model name opens model selection, and MD opens the role definition. When a model connection is broken, the cause shows beside the model name. A model the user picks applies from the next run. |
| Skill detail | Read what it is for, when it is called, the MCP server, tools and permissions it needs, and whether it can be used now. In use links to the job and run log, waiting for approval links to that question, and unavailable links to the missing requirement and MCP settings. The detail adds a skill to that role or removes an assignment. |

### Skill states

Hired state and skill state are computed apart. One of the states below is attached to the icon and also stated in the preview and the accessible name. A running skill ranks first, then waiting for approval, unavailable, and ready.

| State | Mark and how it is decided |
|---|---|
| Ready | The default icon. The skill is assigned and the hired state, the required model features, the MCP connections and the tool permissions were confirmed. |
| In use | A run mark on the icon. It turns on when a real run linked to the skill ID and a job ID starts and off when the run ends. A runtime that reports no skill-use event shows the ready and unavailable states it can confirm. |
| Waiting for approval | A wait mark on the icon. The current question attached to that skill's tool call is waiting for an answer. |
| Unavailable | A lock mark on the icon. The reason is stated apart: not hired, a required model feature missing, an MCP connection down, a required tool or permission missing. |

When hiring, the model, an MCP connection or a permission changes, only the related icons are recomputed. When a permission is revoked during a run, work already started shows its real state until the stop is confirmed, and a new tool call is blocked by the current permission check. A skill whose assignment was removed is left out of later assignments. When an in-use mark is left behind, the icon leaves the list once that run ends.

## Letting the assistant operate the app

Asked how to do something, the assistant briefly explains what to do on the current screen. Asked to do it, the assistant calls the helper, and the helper opens the same tab, form or approval card as doing it directly. When it gets stuck, it tells the original chat the current target and the input it needs. Once a job or a setting really changes, that screen and the log refresh too. [The helper's scope and run rules](app-mcp.md)

## Saving, recovery and accessibility

- When the model does not answer, the assistant explains the model connection state and the cause. When an earlier session cannot continue, the change, decisions, unfinished stages and sources are handed to a new run. A retry first checks whether the same action already landed.
- Tabs, legend, jobs and the composer are reachable from the keyboard. Closing a popover or a detail returns to the control that opened it. A state or error sentence attaches to its job or input, and a success mark refreshes only after the save is confirmed.
- Product acceptance covers two jobs editing the same file at once, a race between stop and completion, a tool whose stop is unconfirmed, a revoked permission, Hangul composition, a dropped connection, and an old wiki or workflow being saved. The browser mock uses a simulated run.
