<h1 align="center">AI Crew</h1>

<p align="center">One secretary talks with you, eight agents work behind it, and a pixel-art camp shows who is doing what.</p>

<p align="center">
  <img alt="Electron" src="https://img.shields.io/badge/Electron-45-47848f">
  <img alt="React" src="https://img.shields.io/badge/React-19-61dafb">
  <img alt="TypeScript" src="https://img.shields.io/badge/TypeScript-5.9-3178c6">
  <img alt="Vite" src="https://img.shields.io/badge/Vite-8-646cff">
</p>

## Features

- **One place to ask.** You talk to the secretary only. It answers directly or splits the job across the crew and brings the result back to the same conversation.
- **A crew, not a fixed team.** Hiring, development, build, docs, style, review, test, and vision roles come as a starting roster: fire them, re-hire them, or add teammates with the same role.
- **Edits you approve.** Text file changes, moves, and new files show the target paths on an approval card before anything is written. Verification results are readable in the job log.
- **Memory and a shared wiki.** Project memories and per-member memories persist, and the crew can write and read the project wiki it shares.
- **Local models or Codex.** Each role runs on a local OpenAI-compatible model or on the installed Codex CLI. Sessions, drafts, and job history live in a local SQLite file.
- **A camp to watch.** The left pane renders the crew with PixiJS and animates walking, sitting, hand-offs, and watching with GSAP.

## Run

```sh
npm install
npm start
```

Open a project folder and send the secretary a message. Models default to `http://127.0.0.1:8082/v1`; set `AI_CREW_LOCAL_URL` and `AI_CREW_LOCAL_MODEL` to point elsewhere.

Type `/` in the message box for chat commands. `/clear` opens an empty conversation with the same project settings.

## Check

```sh
npm run check
npm test
```

`npm run package` builds the desktop app, and `npm run test:desktop` drives the packaged app through folder selection, session restore, tool calls, and file approval. It needs a running local model and macOS.

## Mockup

```sh
python3 -m http.server 48723 --bind 127.0.0.1 --directory demo
```

Open `http://127.0.0.1:48723/` to walk the static concept of the camp, chat, and workflow editor.

## References

1. EngChooN, AI Office, 2026. [GitHub](https://github.com/EngChooN/ai-office)
2. Microsoft Research, Agensh: Scaling Organizational Intelligence to 1,024 Agents, 2026. [Paper](https://arxiv.org/abs/2609.26781), [Code](https://github.com/microsoft/agensh)
