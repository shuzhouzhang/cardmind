# CardMind Demo Guide

This guide shows how to run the current CardMind MVP and exercise the core loop.

## 1. Run

```powershell
pnpm install
pnpm tauri dev
```

For a packaged desktop build:

```powershell
pnpm build:desktop
```

## 2. Load Demo Data

Open CardMind. If the database is empty, the Home page shows an empty state.

Click:

```text
加载示例数据
```

The demo creates:

- one sample conversation
- five knowledge cards
- three card relations

Demo topics:

- 视频点播后端修复记录
- 内存池 benchmark 分析
- TinyMuduo Reactor 事件循环问答
- 简历优化建议
- 微服务拆分边界

No API Key or private data is included in the demo.

## 3. Inspect Cards

Open `卡片`.

Check that each card shows:

- title
- summary
- type
- tags
- mastery status
- source conversation id

Click a card to inspect full content and related relations.

## 4. Search

In `卡片`, search for terms such as:

```text
benchmark
Reactor
简历
微服务
```

CardMind prefers SQLite FTS5 search when available and falls back to LIKE search if FTS5 is unavailable or the query cannot be parsed.

## 5. Export Markdown

In `卡片`:

- click `导出全部` to export all cards
- select a card and click `导出 Markdown` to export one card

The export appears as Markdown text in the app. SQLite remains the source of truth; Markdown is only an export format.

## 6. Graph View

Open `图谱`.

Nodes represent `KnowledgeCard`. Edges represent `CardRelation`.

Click a node to inspect:

- title
- summary
- content
- tags
- source conversation id
- related cards
