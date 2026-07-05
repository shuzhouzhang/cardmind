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

## 3. Import Your Own Conversation

Open `导入`.

You can:

- paste AI conversation text into the textarea
- enter a title
- import a lightweight local file (`.txt`, `.md`, `.json`, `.html`)

Save the conversation, then click `开始抽取知识卡片`. CardMind will use OpenAI when configured, or local mock extraction when OpenAI is unavailable.

Before saving, edit the preview card titles, summaries, contents, tags, and relation reasons. Click `确认保存这些卡片` only after the preview looks useful.

## 4. Inspect and Maintain Cards

Open `卡片`.

Each card shows:

- title
- summary
- type
- tags
- mastery status
- source conversation id

Click a card to inspect full content and related relations.

In the detail panel you can:

- edit card fields
- delete a card
- merge the current card into another card
- create, edit, or delete relations

The merge flow is intentionally simple: it keeps the target card, appends current-card content as merged source material, moves relations to the target, and deletes the current card.

## 5. Search

In `卡片`, search for terms such as:

```text
benchmark
Reactor
简历
微服务
```

You can also filter by tag, card type, and mastery status.

CardMind prefers SQLite FTS5 search when available and falls back to LIKE search if FTS5 is unavailable or the query cannot be parsed.

## 6. Export Markdown

In `卡片`:

- click `预览全部` to preview all-card Markdown
- click `导出文件` to write all-card Markdown to `Documents/CardMind/exports`
- select a card and click `预览` to preview one-card Markdown
- select a card and click `导出文件` to write a single-card Markdown file

SQLite remains the source of truth; Markdown is only an export format.

## 7. Backup and Restore

Use the `数据` panel in the sidebar:

- click `备份` to create a local SQLite backup
- click the restore icon to restore the latest backup

Backups are stored under the user documents folder:

```text
Documents\CardMind\backups
```

Before restore, CardMind creates a safety backup of the current database.

## 8. Graph View

Open `图谱`.

Nodes represent `KnowledgeCard`. Edges represent `CardRelation`.

Click a node to inspect:

- title
- summary
- content
- tags
- source conversation id
- related cards
