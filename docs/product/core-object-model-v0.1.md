# CardMind Core Object Model v0.1

## Product Frame

CardMind is a local-first personal knowledge graph that turns AI conversations into connected knowledge cards.

The product does not treat a full AI conversation as the durable learning unit. A conversation is a source artifact. The durable unit is a structured knowledge point that can be reviewed, connected, searched, merged, and exported later.

## Conversation

A `Conversation` is the raw source material imported by the user. It preserves the original context so every generated card can point back to where it came from.

Fields:

- `id`: stable identifier.
- `title`: human-readable title generated from the imported content.
- `raw_content`: original conversation text.
- `source_type`: origin, such as `manual`, `chatgpt`, or `claude`.
- `created_at`: creation timestamp.
- `updated_at`: update timestamp.

Conversations are important for traceability, but they are not the smallest learning unit.

## KnowledgeCard

A `KnowledgeCard` is the smallest durable knowledge unit in CardMind. It represents one concept, method, decision, comparison, example, or applied insight extracted from conversation content.

Fields:

- `id`: stable identifier.
- `title`: concise card name.
- `summary`: one or two sentence explanation.
- `content`: fuller explanation.
- `type`: card category, such as `concept`, `method`, `question`, `example`, or `decision`.
- `tags`: JSON array stored as text in SQLite for v0.1.
- `mastery_status`: learning status, such as `new`, `learning`, or `mastered`.
- `source_conversation_id`: source conversation reference.
- `created_at`: creation timestamp.
- `updated_at`: update timestamp.

Knowledge cards are the smallest unit because learning happens at the level of ideas, not entire transcripts. A long chat can contain many independent ideas, and one idea can later connect to many other conversations.

## CardRelation

A `CardRelation` connects two knowledge cards and explains why the connection exists.

Fields:

- `id`: stable identifier.
- `source_card_id`: source card reference.
- `target_card_id`: target card reference.
- `relation_type`: relationship kind.
- `reason`: human-readable explanation for the edge.
- `confidence`: extraction confidence from `0` to `1`.
- `created_at`: creation timestamp.

Supported relation types in v0.1:

- `prerequisite`: the source should be understood before the target.
- `contains`: the source includes or groups the target.
- `related`: the cards are generally connected.
- `contrast`: the cards are useful to compare.
- `application`: the target applies the source.
- `source`: the target comes from or depends on the source.

## Why SQLite

CardMind is local-first, so the default database should live on the user's machine and work without a hosted backend. SQLite is a good v0.1 choice because it is structured, durable, easy to back up, and has a simple migration path toward future features such as full-text search, embeddings, sync, and card deduplication.

## Why Markdown Is Only Export

Markdown is useful for portability and sharing, but it should not be the core storage format. CardMind needs typed objects, relations, source references, tags, and future metadata such as embeddings or review history. Storing these as structured SQLite rows keeps the product reliable while still allowing Markdown export later.

## Graph Generation

The knowledge graph is generated from cards and relations:

- Each `KnowledgeCard` becomes a graph node.
- Each `CardRelation` becomes a graph edge.
- Node details come from the card fields.
- Edge labels and explanations come from the relation fields.
- Clicking a node should reveal the card detail and `source_conversation_id`.

The graph is therefore not a manually drawn diagram. It is a live view over structured knowledge.

## Difference From Notes And Chat Archives

CardMind differs from ordinary note software because users do not have to manually create every note or link. It differs from ordinary AI chat history tools because it does not preserve chats as the main product surface. The main surface is a structured and growing knowledge graph built from reusable cards.

CardMind's long-term value comes from turning repeated learning conversations into a reusable personal knowledge system.
