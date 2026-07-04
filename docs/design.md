# CardMind Design Notes

## Product Boundary

CardMind is a local-first desktop MVP for turning useful AI conversation fragments into structured knowledge cards.

It is not:

- a full AI knowledge management platform
- a generic chat archive
- a Markdown-first note app
- a RAG or vector database project
- a cloud sync product

## Core Objects

### Conversation

`Conversation` stores the original imported AI conversation. It is source material, not the main learning unit.

Important fields:

- `id`
- `title`
- `raw_content`
- `source_type`
- `created_at`
- `updated_at`

### KnowledgeCard

`KnowledgeCard` is the smallest reusable knowledge unit.

Important fields:

- `id`
- `title`
- `summary`
- `content`
- `type`
- `tags`
- `mastery_status`
- `source_conversation_id`
- `created_at`
- `updated_at`

### CardRelation

`CardRelation` connects two knowledge cards and records why they are related.

Supported relation types:

- `prerequisite`
- `contains`
- `related`
- `contrast`
- `application`
- `source`
- `supports`

## Why Not Store Whole Chats As Notes

Whole AI conversations are often too long and noisy to review. They mix questions, partial answers, corrections, and side topics.

CardMind keeps the original conversation for traceability, but stores reusable knowledge as structured cards. This makes search, graph view, export, and later review workflows more practical.

## Why SQLite

SQLite fits the MVP because:

- it keeps data local
- it supports structured tables
- it can run inside a Tauri desktop app
- it supports local keyword search through FTS5 in many environments
- it avoids adding hosted infrastructure too early

## Why Markdown Is Export Only

Markdown is useful for sharing and archival export. It is not the source of truth.

The source of truth is SQLite:

- cards are rows
- relations are rows
- tags are structured JSON text
- source conversation links remain queryable

## Extraction Flow

```text
Conversation -> Extraction Preview -> Confirm -> SQLite
```

The preview step matters because AI-generated cards should not silently become durable data. Users can inspect the result before saving it.

## Local-First and OpenAI Boundary

By default, imported conversations are stored locally. If the user configures an OpenAI API Key and triggers extraction, the conversation text is sent to OpenAI for card extraction. If OpenAI is not configured or fails, CardMind falls back to a local mock extractor.

API Keys are not stored in SQLite. They are read from `OPENAI_API_KEY` or Windows Credential Manager.
