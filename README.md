# CardMind

CardMind is a local-first personal knowledge graph that turns AI conversations into connected knowledge cards.

CardMind 把 AI 对话中的有效知识点拆成结构化知识卡片，再通过卡片关系生成个人知识图谱。第一版 MVP 优先保证本地存储、清晰对象模型和可替换的 AI 抽取服务。

## Product Positioning

CardMind is not an AI chat archive and not a Markdown-first note app. It keeps original conversations as source material, then extracts reusable knowledge cards as the smallest durable unit. The graph view is generated from structured card and relation data.

## Tech Stack

- Frontend: React, TypeScript, Vite, React Flow, Lucide icons.
- Backend: Node.js, Express, TypeScript.
- Database: SQLite through `better-sqlite3`.
- Package manager: pnpm workspace.

Node.js + Express was chosen because the MVP frontend is already TypeScript-based, so shared contracts and future AI service adapters can stay lightweight inside one TypeScript workspace.

## Project Structure

- `apps/api`: Node.js + Express API, backed by SQLite.
- `apps/web`: React + Vite frontend.
- `packages/shared`: shared TypeScript contracts.
- `docs/product`: product and domain model documents.

## Local Setup

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

- `POST /api/conversations`: import one raw AI conversation.
- `GET /api/conversations`: list conversations.
- `GET /api/conversations/:id`: get one conversation.
- `POST /api/conversations/:id/extract`: run mock extraction and persist cards/relations.
- `GET /api/cards`: list knowledge cards.
- `GET /api/cards/:id`: get one card.
- `GET /api/relations`: list card relations.
- `GET /api/graph`: return graph `nodes` and `edges` for the frontend.

## Current MVP

- Structured SQLite schema for conversations, knowledge cards, and card relations.
- Local API with conversation import, card/relation reads, and graph output.
- Mock extraction service that can later be replaced by a real LLM extractor without changing database or frontend graph contracts.
- React frontend with Home, Import, Cards, and Graph views.
- React Flow graph where nodes are knowledge cards and edges are card relations.
- Node click detail panel showing card summary, mastery status, and source conversation id.

## Roadmap

- Replace mock extraction with a real model-backed service and prompt/evaluation harness.
- Add card deduplication and merge review.
- Add SQLite full-text search and optional embedding storage.
- Add Markdown export without changing SQLite as the source of truth.
- Add spaced repetition metadata and review workflows.
- Add local backup/sync options.
- Add import adapters for ChatGPT, Claude, and Markdown/HTML exports.
