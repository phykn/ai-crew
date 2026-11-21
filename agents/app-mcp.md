# The app helper and the AI Crew MCP

The user talks to the assistant as usual. The app helper looks up how something works and, when asked, does the AI Crew operation a person could do on screen. Help, screen movement, running a job, editing, saving and changing settings are all approached the same way. The assistant passes the request on and says the result in the original conversation.

## How an action continues in conversation

| What the user said | What the helper does | What the user sees |
|---|---|---|
| "How do I change the workflow?" | Reads the current screen and the help for that feature. | The assistant gives a short explanation that can be followed in this window. |
| "Show me why the last test stopped" | Finds the job in the current project, reads the record and opens that log. When several jobs match and the request does not single one out, it returns titles and times to the assistant. | The log is filtered to that job. The assistant says the reason it confirmed from the record. If several jobs match, it asks once in the original chat which one. |
| "Run that test again" | Checks the ID and latest state of the job chosen before and runs the same action as `continue` on screen. | That job goes through the existing resume rules. If the real run has not started, the waiting state and the reason are given. |
| "Add an accessibility review after development and do it for every screen job from now on" | Checks the current project's flow and assignees, then adds a conditional stage to the graph draft. After verifying the connection, the handoff artifact and the completion criteria, it saves with the scope the user asked for. | The changed node and connection can be checked in the same editor. The assistant states the version and the condition the next new job will use. |
| "Delete this memory" | Finds the project, the assignee and the memory, and when a run rule is attached, reads the effect and the options as the existing delete procedure does. | When the target is clear, the same delete procedure runs. When it must decide between deleting only the memory and dropping the rule too, the existing confirmation opens. |

A request that changes the screen is answered with success only after the real panel moved. A request for an explanation is handled as a read. While a work screen is opened or its state is read, job runs keep going as they were. When the user's answer is needed, the existing approval card or the assistant's question is used, and the detailed operations and results stay in the related log.

## Feature scope

For every feature the user can operate, the actions that can run are defined. A read gives the current value, the possible choices, the target ID and the state. A key press, a click or a drag is how the screen calls that feature. MCP calls the action those inputs would produce directly.

| Area | Read | Run |
|---|---|---|
| Screen and camp | Current project, session, tab, working characters, chosen job, open detail | Switch chat, log, memory, workflow; switch camp and work view in a narrow window; resize the work panel; fold and unfold the crew legend and a detail; open a job from a character or a handoff scene; go to a related message, log or document; go back to the earlier screen |
| Project | Registered folders, connection state, last session, the app records a removal would affect | Open the folder picker or a folder access was granted to; switch, reconnect or remove a project. The source files stay outside what removing a project touches. |
| Session and composer | Session list and titles, conversation record, draft, current follow-up target, registered commands | New conversation; load or delete an earlier session; write or edit a draft; attach or clear the target; send a message or resend a failed one; run a registered slash command and `/clear` |
| Job and approval | Job state, participants, handoffs, change and test results, waiting questions, current approval mode | Open a job and its question; approve or ask to revise the current plan version; add a follow-up to a named job; stop a response or a named job; continue or retry; allow or refuse a permission question; answer a general question; change the approval mode |
| Log and usage | Work history, run counts, time and usage per assignee and model, plan and change history and artifacts | Filter all or one job; open an event, evidence or artifact; attach a follow-up to a plan comment or a changed range |
| Job workspace | Source folder or the per-job worktree, base commit, change versions and apply state | Choose an isolated run; request and confirm applying; clean up a finished workspace |
| Crew | Role, name, hired state (`hired`, `not hired`), current job, role definition, model and connection state, skill state, required permissions, blocking reason, MCP settings and memory links | Choose a role and name in the legend; rename; open the role definition; set the model; open a skill detail, its run log or its approval question; add or remove a skill; grant or revoke MCP servers and tool permissions; request, adopt and assign a candidate; hire, fire or rehire a regular member or a temp member |
| Model and connection | Connected Codex and local LLM, available models, connection state and supported features | Add, edit and remove a model connection the user can set, check the connection, assign a model per role. Sign-in and credential entry open that settings screen and continue with the user input the operating system or provider requires. |
| Shared wiki | Contents, nodes and references, body and source, versions and change timeline | Switch between list, node and timeline; open a document or a source; create, edit, save and delete a document and its references; open the change history; keep or drop an attached rule |
| Agent memory | Per-assignee memory the user can see in this project, and its source | Choose an assignee; open a memory and its source; delete a memory the UI allows and handle an attached rule |
| Workflow | Default flow per job type, saved versions and drafts, stages, connections and check results | Choose a flow; add, move, change and delete stages and connections; edit assignee, permission request, run condition, handoff and completion criteria; save layout; check and save a draft; apply to the next new job, the current job or this once, as the user asks |
| App help and settings | Guidance for the current screen, possible actions, setting values and their effect | Open the settings screen; change the app settings the UI offers; quit and restart the app and restore the earlier session. When a run is going at quit time, the existing quit procedure applies. |

When a folder or sign-in screen is opened, or an existing confirmation was raised, the helper returns a `waiting for input` state. The result is settled only after the choice is made. Quit and restart first record that the request was accepted, and the result is confirmed once the same session is restored in the reopened app. When a new user feature is added to the app, the same action ID and read path are attached to the MCP catalog.

## The shared run path

The Electron main process holds the list of user actions and the runner. Each item's ID, target type, input validation, required permission and state condition live in one place. The IPC of the React screen and the app MCP call the same runner. A screen navigation replies from the renderer of the named window whether it applied, and a lasting change is handled by the existing job, settings and save logic. The same log, approval, version check and camp event happen on both sides. Inside the app the assistant's helper MCP connection is granted that delegation scope.

The MCP tool surface is narrowed to the three below. A feature's actions and input schemas are found through a search.

| Tool | Input | Return |
|---|---|---|
| `app_find_actions` | A search term or a feature area | Action IDs that fit the permission and the current context, their descriptions, target types, input schemas and, where needed, the user input condition |
| `app_read` | The item to read, project, session and target IDs, a page position when needed | Screen state, target candidates, the records allowed, current versions. When there are many targets, the position of the next page |
| `app_act` | An action ID, a target ID, registered arguments and, for a change or a send, a request ID and the base version of that target | The applied result or a wait for input or approval, the changed target and version, the failure reason and the record to link |

For example, `workflow.connect_nodes` takes the source and destination stage IDs of the same draft. `workflow.save` takes the draft and the base version and saves after the same checks as the screen. `job.resume` takes the exact job ID and goes through the existing state checks, and `approval.answer` takes the current question ID and an allow or a refuse. Text returned by a tool, or an argument a model passed, is input material: the runner checks the registered input and the user's permission.

## Permission and concurrent operation

- **User delegation.** When the assistant passes a new user request to the helper, the app links the request's source, project, session and the action scope allowed. A request to be told progress links a read, and an explicit request to fix something links the edit of that target. Several actions needed inside one delegation may run. A project switch, or a change in another project, applies to a target named or chosen clearly. A delegation passed to a peer is handled with that peer's current permission.
- **Checking the current state.** Immediately before the real call, the app checks the delegation scope, the agent's current permission, the target's ownership and the approval policy. Permission edits and deletes go through the same actions as the UI, and raise the same confirmation when the state on screen needs one. An `allow` the helper passes is handled with that ID only when the user decided it after seeing the current approval question. Auto and always follow the existing approval policy. Tool responses and logs return the connection state instead of credentials.
- **Contention.** When the user changes a job or a draft, a state change is judged by the named ID and base version. When an older input could overwrite a newer edit, the draft is kept and the changed item is named. When the user moves to another session during a screen operation, the current screen wins and the result and a link stay in the original conversation. A deleted target or a replaced approval question is read again in its latest state.
- **Duplicates and failures.** The same request ID with the same arguments returns the first result. The same ID with different arguments asks for the new intent. When a failure comes mid-way, the actions done and the actions left are told apart. When, for example, a node connection landed but the save check failed, the editing draft is kept and the error is given. A retry follows the existing job and permission rules.
- **Recording.** A save or a run change links the user request, the helper that actually ran, and the action, target, version and result applied. When the helper moved the screen, the place confirmed on screen is returned. The assistant leaves only the result the user asked about and the next choice it needs in the conversation.

## Acceptance criteria

1. The difference between the list of user action IDs and the MCP catalog is empty. Every area in the table is compared, including opening a screen, reading, input and saving, and actions that need a confirmation such as permissions and deletes.
2. In the same project, stop a job, answer an approval, rehire a member and save a workflow once from a button and once from MCP. Under the same conditions the same state change, permission decision and screen event happen, and the record tells apart who really ran it.
3. Ask to show why it stopped on two jobs with the same name. After reading the candidates, open the chosen job's log. Each job keeps its stopped state. When a resume is then requested explicitly, only the one chosen goes through the existing procedure.
4. Make the save check fail after adding a node and a connection. The draft and the error stay in the graph the user sees and the saved version does not change. UI and MCP results agree for the existing wiki delete confirmation, a cancelled folder picker and a click on an earlier approval card.
5. Reproduce an ID from another project, a revoked permission, an old version, a duplicate request, and the user switching tabs directly while the helper works. The permission decision and the first result hold, and after the direct tab switch the screen stays where the user chose.
