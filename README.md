# CardMind

CardMind is a local-first personal knowledge graph that turns AI conversations into connected knowledge cards.

CardMind 把 AI 对话中的有效知识点拆成结构化知识卡片，再通过卡片关系生成个人知识图谱。当前版本已经改造成 Tauri 桌面软件：不需要浏览器、不需要手动启动 API，数据保存在本机 SQLite。

## Product Positioning

CardMind is not an AI chat archive and not a Markdown-first note app. It keeps original conversations as source material, then extracts reusable knowledge cards as the smallest durable unit. The graph view is generated from structured card and relation data.

## Tech Stack

- Frontend: React, TypeScript, Vite, React Flow, Lucide icons.
- Desktop runtime: Tauri v2.
- Backend: Rust Tauri commands.
- Database: SQLite through `rusqlite`.
- Package manager: pnpm workspace.

The earlier Express API is retained as a legacy local prototype under `apps/api`, but the desktop app does not depend on it at runtime.

## Project Structure

- `apps/api`: Node.js + Express API, backed by SQLite.
- `apps/web`: React + Vite frontend.
- `packages/shared`: shared TypeScript contracts.
- `src-tauri`: Tauri v2 desktop shell, Rust commands, SQLite repository, and Windows packaging config.
- `docs/product`: product and domain model documents.

## Desktop Development

Install dependencies:

```powershell
pnpm install
```

Run the desktop app:

```powershell
pnpm tauri dev
```

Build the Windows installer:

```powershell
pnpm tauri build
```

The installer is generated at:

```text
src-tauri\target\release\bundle\nsis\CardMind_0.1.0_x64-setup.exe
```

The desktop app stores `cardmind.sqlite` in the operating system app data directory for `com.cardmind.app`.

## Legacy Web/API Prototype

The original local web/API prototype is still available for debugging and comparison.

Install dependencies:

```powershell
pnpm install
```

Initialize the local SQLite database:

```powershell
pnpm --filter @cardmind/api db:init
```

Run the API:

```powershell
pnpm --filter @cardmind/api dev
```

Run the web app in another terminal:

```powershell
pnpm --filter @cardmind/web dev
```

Open:

- Web: `http://127.0.0.1:5173`
- API health: `http://127.0.0.1:4000/api/health`

On this machine, `node` and `pnpm` were not on the system PATH. Verification used the Codex bundled runtime by temporarily prepending:

```powershell
$env:Path = 'C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin;' + $env:Path
& 'C:\Users\DELL\.cache\codex-runtimes\codex-primary-runtime\dependencies\bin\pnpm.cmd' install
```

## API

The desktop app uses Tauri commands instead of HTTP. The frontend API facade calls these commands when running inside Tauri:

- `create_conversation`
- `list_conversations`
- `get_conversation`
- `extract_conversation`
- `list_cards`
- `get_card`
- `list_relations`
- `get_graph`

The legacy Express API still exposes:

- `POST /api/conversations`: import one raw AI conversation.
- `GET /api/conversations`: list conversations.
- `GET /api/conversations/:id`: get one conversation.
- `POST /api/conversations/:id/extract`: run mock extraction and persist cards/relations.
- `GET /api/cards`: list knowledge cards.
- `GET /api/cards/:id`: get one card.
- `GET /api/relations`: list card relations.
- `GET /api/graph`: return graph `nodes` and `edges` for the frontend.

## Current MVP

- Windows desktop app built with Tauri v2.
- Tauri/Rust command layer for conversations, cards, relations, and graph data.
- Local SQLite database initialized automatically in app data.
- Structured SQLite schema for conversations, knowledge cards, and card relations.
- Mock extraction service that can later be replaced by a real LLM extractor without changing database or frontend graph contracts.
- React frontend with Home, Import, Cards, and Graph views.
- React Flow graph where nodes are knowledge cards and edges are card relations.
- Node click detail panel showing card summary, mastery status, and source conversation id.

## Roadmap

- Replace mock extraction with a real model-backed service and prompt/evaluation harness.
- Add a first-run onboarding flow for local storage location and import examples.
- Add card deduplication and merge review.
- Add SQLite full-text search and optional embedding storage.
- Add Markdown export without changing SQLite as the source of truth.
- Add spaced repetition metadata and review workflows.
- Add local backup/sync options.
- Add import adapters for ChatGPT, Claude, and Markdown/HTML exports.
