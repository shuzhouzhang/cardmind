use crate::extractor::extract_knowledge_cards;
use crate::models::{
    CardRelation, Conversation, CreateConversationInput, GraphEdge, GraphNode, KnowledgeCard,
    KnowledgeGraph, PersistedExtraction,
};
use chrono::Utc;
use rusqlite::{params, Connection, OptionalExtension};
use std::collections::HashMap;
use std::path::PathBuf;
use uuid::Uuid;

const SCHEMA_SQL: &str = r#"
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  raw_content TEXT NOT NULL,
  source_type TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS knowledge_cards (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  summary TEXT NOT NULL,
  content TEXT NOT NULL,
  type TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '[]',
  mastery_status TEXT NOT NULL DEFAULT 'new',
  source_conversation_id TEXT NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (source_conversation_id) REFERENCES conversations(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS card_relations (
  id TEXT PRIMARY KEY,
  source_card_id TEXT NOT NULL,
  target_card_id TEXT NOT NULL,
  relation_type TEXT NOT NULL CHECK (
    relation_type IN (
      'prerequisite',
      'contains',
      'related',
      'contrast',
      'application',
      'source'
    )
  ),
  reason TEXT NOT NULL,
  confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  created_at TEXT NOT NULL,
  FOREIGN KEY (source_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE,
  FOREIGN KEY (target_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_knowledge_cards_source_conversation_id
  ON knowledge_cards(source_conversation_id);

CREATE INDEX IF NOT EXISTS idx_card_relations_source_card_id
  ON card_relations(source_card_id);

CREATE INDEX IF NOT EXISTS idx_card_relations_target_card_id
  ON card_relations(target_card_id);
"#;

pub struct CardMindRepository {
    connection: Connection,
}

impl CardMindRepository {
    pub fn open(db_path: PathBuf) -> Result<Self, rusqlite::Error> {
        if let Some(parent) = db_path.parent() {
            std::fs::create_dir_all(parent).map_err(|_| rusqlite::Error::InvalidPath(db_path.clone()))?;
        }

        let connection = Connection::open(db_path)?;
        connection.pragma_update(None, "foreign_keys", "ON")?;
        connection.execute_batch(SCHEMA_SQL)?;
        Ok(Self { connection })
    }

    pub fn create_conversation(
        &self,
        input: CreateConversationInput,
    ) -> Result<Conversation, String> {
        let timestamp = now_iso();
        let title = input
            .title
            .map(|title| title.trim().to_string())
            .filter(|title| !title.is_empty())
            .unwrap_or_else(|| create_title(&input.raw_content));

        let conversation = Conversation {
            id: create_id("conv"),
            title,
            raw_content: input.raw_content,
            source_type: input.source_type.unwrap_or_else(|| "manual".to_string()),
            created_at: timestamp.clone(),
            updated_at: timestamp,
        };

        self.connection
            .execute(
                "INSERT INTO conversations (id, title, raw_content, source_type, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
                params![
                    conversation.id,
                    conversation.title,
                    conversation.raw_content,
                    conversation.source_type,
                    conversation.created_at,
                    conversation.updated_at
                ],
            )
            .map_err(|error| error.to_string())?;

        Ok(conversation)
    }

    pub fn list_conversations(&self) -> Result<Vec<Conversation>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, title, raw_content, source_type, created_at, updated_at
                 FROM conversations
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], map_conversation)
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    pub fn get_conversation(&self, id: &str) -> Result<Option<Conversation>, String> {
        self.connection
            .query_row(
                "SELECT id, title, raw_content, source_type, created_at, updated_at
                 FROM conversations
                 WHERE id = ?1",
                [id],
                map_conversation,
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn extract_conversation(&mut self, id: &str) -> Result<PersistedExtraction, String> {
        let conversation = self
            .get_conversation(id)?
            .ok_or_else(|| "Conversation not found".to_string())?;
        let extraction = extract_knowledge_cards(&conversation.raw_content);
        let transaction = self
            .connection
            .transaction()
            .map_err(|error| error.to_string())?;

        let mut cards = Vec::new();
        for draft in extraction.cards {
            let timestamp = now_iso();
            let card = KnowledgeCard {
                id: create_id("card"),
                title: draft.title,
                summary: draft.summary,
                content: draft.content,
                r#type: draft.r#type,
                tags: draft.tags,
                mastery_status: "new".to_string(),
                source_conversation_id: conversation.id.clone(),
                created_at: timestamp.clone(),
                updated_at: timestamp,
            };

            transaction
                .execute(
                    "INSERT INTO knowledge_cards
                     (id, title, summary, content, type, tags, mastery_status, source_conversation_id, created_at, updated_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
                    params![
                        card.id,
                        card.title,
                        card.summary,
                        card.content,
                        card.r#type,
                        serde_json::to_string(&card.tags).map_err(|error| error.to_string())?,
                        card.mastery_status,
                        card.source_conversation_id,
                        card.created_at,
                        card.updated_at
                    ],
                )
                .map_err(|error| error.to_string())?;

            cards.push(card);
        }

        let card_by_title = cards
            .iter()
            .map(|card| (card.title.clone(), card.id.clone()))
            .collect::<HashMap<_, _>>();
        let mut relations = Vec::new();

        for draft in extraction.relations {
            let Some(source_card_id) = card_by_title.get(&draft.source_title) else {
                continue;
            };
            let Some(target_card_id) = card_by_title.get(&draft.target_title) else {
                continue;
            };

            let relation = CardRelation {
                id: create_id("rel"),
                source_card_id: source_card_id.clone(),
                target_card_id: target_card_id.clone(),
                relation_type: draft.relation_type,
                reason: draft.reason,
                confidence: draft.confidence,
                created_at: now_iso(),
            };

            transaction
                .execute(
                    "INSERT INTO card_relations
                     (id, source_card_id, target_card_id, relation_type, reason, confidence, created_at)
                     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                    params![
                        relation.id,
                        relation.source_card_id,
                        relation.target_card_id,
                        relation.relation_type,
                        relation.reason,
                        relation.confidence,
                        relation.created_at
                    ],
                )
                .map_err(|error| error.to_string())?;

            relations.push(relation);
        }

        transaction.commit().map_err(|error| error.to_string())?;
        Ok(PersistedExtraction { cards, relations })
    }

    pub fn list_cards(&self) -> Result<Vec<KnowledgeCard>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, title, summary, content, type, tags, mastery_status, source_conversation_id, created_at, updated_at
                 FROM knowledge_cards
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], map_card)
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    pub fn get_card(&self, id: &str) -> Result<Option<KnowledgeCard>, String> {
        self.connection
            .query_row(
                "SELECT id, title, summary, content, type, tags, mastery_status, source_conversation_id, created_at, updated_at
                 FROM knowledge_cards
                 WHERE id = ?1",
                [id],
                map_card,
            )
            .optional()
            .map_err(|error| error.to_string())
    }

    pub fn list_relations(&self) -> Result<Vec<CardRelation>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, source_card_id, target_card_id, relation_type, reason, confidence, created_at
                 FROM card_relations
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([], map_relation)
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    pub fn get_graph(&self) -> Result<KnowledgeGraph, String> {
        let nodes = self
            .list_cards()?
            .into_iter()
            .map(|card| GraphNode {
                id: card.id,
                label: card.title,
                r#type: card.r#type,
                summary: card.summary,
                tags: card.tags,
                mastery_status: card.mastery_status,
                source_conversation_id: card.source_conversation_id,
            })
            .collect();

        let edges = self
            .list_relations()?
            .into_iter()
            .map(|relation| GraphEdge {
                id: relation.id,
                source: relation.source_card_id,
                target: relation.target_card_id,
                label: relation.relation_type,
                reason: relation.reason,
                confidence: relation.confidence,
            })
            .collect();

        Ok(KnowledgeGraph { nodes, edges })
    }
}

fn map_conversation(row: &rusqlite::Row<'_>) -> rusqlite::Result<Conversation> {
    Ok(Conversation {
        id: row.get(0)?,
        title: row.get(1)?,
        raw_content: row.get(2)?,
        source_type: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn map_card(row: &rusqlite::Row<'_>) -> rusqlite::Result<KnowledgeCard> {
    let tags_json: String = row.get(5)?;
    let tags = serde_json::from_str(&tags_json).unwrap_or_default();

    Ok(KnowledgeCard {
        id: row.get(0)?,
        title: row.get(1)?,
        summary: row.get(2)?,
        content: row.get(3)?,
        r#type: row.get(4)?,
        tags,
        mastery_status: row.get(6)?,
        source_conversation_id: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn map_relation(row: &rusqlite::Row<'_>) -> rusqlite::Result<CardRelation> {
    Ok(CardRelation {
        id: row.get(0)?,
        source_card_id: row.get(1)?,
        target_card_id: row.get(2)?,
        relation_type: row.get(3)?,
        reason: row.get(4)?,
        confidence: row.get(5)?,
        created_at: row.get(6)?,
    })
}

fn collect_rows<T>(
    rows: rusqlite::MappedRows<'_, impl FnMut(&rusqlite::Row<'_>) -> rusqlite::Result<T>>,
) -> Result<Vec<T>, String> {
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|error| error.to_string())
}

fn now_iso() -> String {
    Utc::now().to_rfc3339()
}

fn create_id(prefix: &str) -> String {
    format!("{prefix}_{}", Uuid::new_v4())
}

fn create_title(raw_content: &str) -> String {
    raw_content
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .map(|line| line.chars().take(60).collect())
        .unwrap_or_else(|| "Untitled conversation".to_string())
}

#[cfg(test)]
mod tests {
    use super::CardMindRepository;
    use crate::models::CreateConversationInput;
    use tempfile::tempdir;

    #[test]
    fn persists_conversation_extraction_and_graph() {
        let tempdir = tempdir().expect("create tempdir");
        let mut repository =
            CardMindRepository::open(tempdir.path().join("cardmind.sqlite")).expect("open db");

        let conversation = repository
            .create_conversation(CreateConversationInput {
                title: None,
                raw_content: "CardMind is a local-first knowledge graph. It uses SQLite to store knowledge cards."
                    .to_string(),
                source_type: Some("manual".to_string()),
            })
            .expect("create conversation");
        let extraction = repository
            .extract_conversation(&conversation.id)
            .expect("extract cards");
        let graph = repository.get_graph().expect("get graph");

        assert_eq!(repository.list_conversations().unwrap().len(), 1);
        assert_eq!(graph.nodes.len(), extraction.cards.len());
        assert_eq!(graph.edges.len(), extraction.relations.len());
        assert!(graph.nodes.iter().any(|node| node.label == "SQLite"));
    }
}
