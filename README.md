# CardMind

CardMind is a local-first personal knowledge graph that turns AI conversations into connected knowledge cards.

CardMind 把 AI 对话中的有效知识点拆成结构化知识卡片，再通过卡片关系生成个人知识图谱。第一版 MVP 优先保证本地存储、清晰对象模型和可替换的 AI 抽取服务。

## Current Status

This repository is being initialized as a TypeScript monorepo:

- `apps/api`: Node.js + Express API, backed by SQLite.
- `apps/web`: React + Vite frontend.
- `packages/shared`: shared TypeScript contracts.
- `docs/product`: product and domain model documents.

More setup, implementation details, and roadmap will be filled as the MVP lands.
