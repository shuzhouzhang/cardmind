use crate::extractor::extract_knowledge_cards;
use crate::models::{
    CardRelation, ConfirmExtractionInput, Conversation, CreateConversationInput, ExtractionPreview,
    ExtractedCardDraft, ExtractedRelationDraft, GraphEdge, GraphNode, KnowledgeCard, KnowledgeGraph,
    OpenAiStatus, PersistedExtraction,
};
use crate::openai::extract_with_openai_or_mock;
use chrono::Utc;
use keyring::Entry;
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
      'source',
      'supports'
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

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
"#;

const DEFAULT_OPENAI_MODEL: &str = "gpt-5.4-mini";
const KEYRING_SERVICE: &str = "CardMind";
const KEYRING_USER: &str = "openai_api_key";

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
        let repository = Self { connection };
        repository.migrate_supports_relation_type()?;
        Ok(repository)
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
        self.persist_extraction(&conversation.id, extraction.cards, extraction.relations)
    }

    pub fn preview_extraction(&self, id: &str) -> Result<ExtractionPreview, String> {
        let conversation = self
            .get_conversation(id)?
            .ok_or_else(|| "Conversation not found".to_string())?;
        Ok(extract_with_openai_or_mock(
            &conversation.raw_content,
            self.openai_api_key(),
            &self.openai_model()?,
        ))
    }

    pub fn confirm_extraction(
        &mut self,
        input: ConfirmExtractionInput,
    ) -> Result<PersistedExtraction, String> {
        if self.get_conversation(&input.conversation_id)?.is_none() {
            return Err("Conversation not found".to_string());
        }

        self.persist_extraction(&input.conversation_id, input.cards, input.relations)
    }

    fn persist_extraction(
        &mut self,
        conversation_id: &str,
        card_drafts: Vec<ExtractedCardDraft>,
        relation_drafts: Vec<ExtractedRelationDraft>,
    ) -> Result<PersistedExtraction, String> {
        let transaction = self.connection.transaction().map_err(|error| error.to_string())?;

        let mut cards = Vec::new();
        for draft in card_drafts {
            let timestamp = now_iso();
            let card = KnowledgeCard {
                id: create_id("card"),
                title: draft.title,
                summary: draft.summary,
                content: draft.content,
                r#type: draft.r#type,
                tags: draft.tags,
                mastery_status: "new".to_string(),
                source_conversation_id: conversation_id.to_string(),
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

        for draft in relation_drafts {
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

    pub fn get_card_relations(&self, card_id: &str) -> Result<Vec<CardRelation>, String> {
        let mut statement = self
            .connection
            .prepare(
                "SELECT id, source_card_id, target_card_id, relation_type, reason, confidence, created_at
                 FROM card_relations
                 WHERE source_card_id = ?1 OR target_card_id = ?1
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map([card_id], map_relation)
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    pub fn seed_sample_data(&mut self) -> Result<PersistedExtraction, String> {
        if !self.list_conversations()?.is_empty() || !self.list_cards()?.is_empty() {
            return Err("已有数据时不会自动写入示例数据。".to_string());
        }

        let conversation = self.create_conversation(CreateConversationInput {
            title: Some("示例：产品化、本地优先、SQLite 与知识图谱".to_string()),
            raw_content: "这是一段关于 CardMind 产品设计的示例对话。我们讨论产品化如何把技术能力变成可持续交付的产品，也讨论本地优先为什么适合个人知识系统。SQLite 可以支持本地优先的数据存储，知识卡片是最小学习单位，知识图谱则包含并连接这些知识卡片。".to_string(),
            source_type: Some("sample".to_string()),
        })?;

        let cards = vec![
            ExtractedCardDraft {
                title: "产品化".to_string(),
                summary: "产品化是把技术能力变成可交付、可维护、可迭代的产品。".to_string(),
                content: "产品化不是简单写代码，而是把技术能力包装成用户可以使用、持续维护、持续迭代的产品能力。".to_string(),
                r#type: "concept".to_string(),
                tags: vec!["产品".to_string(), "工程".to_string(), "交付".to_string()],
            },
            ExtractedCardDraft {
                title: "本地优先".to_string(),
                summary: "本地优先强调数据优先保存在用户自己的设备上。".to_string(),
                content: "本地优先适合个人知识系统，因为学习记录、对话内容和知识卡片都具有长期价值和隐私属性。".to_string(),
                r#type: "concept".to_string(),
                tags: vec!["隐私".to_string(), "本地化".to_string(), "数据所有权".to_string()],
            },
            ExtractedCardDraft {
                title: "SQLite".to_string(),
                summary: "SQLite 是适合本地优先产品的轻量结构化数据库。".to_string(),
                content: "SQLite 能在不依赖云端服务的情况下保存对话、卡片和关系，同时为全文搜索、同步和备份留下扩展空间。".to_string(),
                r#type: "technology".to_string(),
                tags: vec!["数据库".to_string(), "本地存储".to_string(), "架构".to_string()],
            },
            ExtractedCardDraft {
                title: "知识卡片".to_string(),
                summary: "知识卡片是从对话中抽取出的最小知识单位。".to_string(),
                content: "知识卡片把一段对话中的有效知识点结构化保存，便于复习、搜索、连接和后续导出。".to_string(),
                r#type: "concept".to_string(),
                tags: vec!["知识管理".to_string(), "学习".to_string(), "结构化".to_string()],
            },
            ExtractedCardDraft {
                title: "知识图谱".to_string(),
                summary: "知识图谱用节点和边表达知识点之间的关系。".to_string(),
                content: "在 CardMind 中，节点来自 KnowledgeCard，边来自 CardRelation，用户可以通过图谱看到知识之间的前置、包含、对比、相关、应用和支持关系。".to_string(),
                r#type: "concept".to_string(),
                tags: vec!["图谱".to_string(), "关系".to_string(), "可视化".to_string()],
            },
        ];

        let relations = vec![
            ExtractedRelationDraft {
                source_title: "产品化".to_string(),
                target_title: "本地优先".to_string(),
                relation_type: "related".to_string(),
                reason: "二者都会影响产品架构和长期用户体验。".to_string(),
                confidence: 0.9,
            },
            ExtractedRelationDraft {
                source_title: "SQLite".to_string(),
                target_title: "本地优先".to_string(),
                relation_type: "supports".to_string(),
                reason: "SQLite 的本地结构化存储能力支持本地优先理念。".to_string(),
                confidence: 0.92,
            },
            ExtractedRelationDraft {
                source_title: "知识图谱".to_string(),
                target_title: "知识卡片".to_string(),
                relation_type: "contains".to_string(),
                reason: "知识图谱由知识卡片节点和关系边生成。".to_string(),
                confidence: 0.95,
            },
        ];

        self.persist_extraction(&conversation.id, cards, relations)
    }

    pub fn openai_status(&self) -> Result<OpenAiStatus, String> {
        let env_key = std::env::var("OPENAI_API_KEY").ok().filter(|key| !key.trim().is_empty());
        let keyring_key = keyring_entry().and_then(|entry| entry.get_password().ok());
        let (has_api_key, key_source) = if env_key.is_some() {
            (true, Some("环境变量 OPENAI_API_KEY".to_string()))
        } else if keyring_key.is_some() {
            (true, Some("Windows Credential Manager".to_string()))
        } else {
            (false, None)
        };

        Ok(OpenAiStatus {
            has_api_key,
            key_source,
            model: self.openai_model()?,
        })
    }

    pub fn save_openai_api_key(&self, api_key: &str) -> Result<OpenAiStatus, String> {
        let entry = keyring_entry().ok_or_else(|| "无法打开 Windows Credential Manager。".to_string())?;
        entry.set_password(api_key.trim()).map_err(|error| error.to_string())?;
        self.openai_status()
    }

    pub fn clear_openai_api_key(&self) -> Result<OpenAiStatus, String> {
        if let Some(entry) = keyring_entry() {
            let _ = entry.delete_credential();
        }
        self.openai_status()
    }

    pub fn set_openai_model(&self, model: &str) -> Result<OpenAiStatus, String> {
        let normalized = match model.trim() {
            "gpt-5.5" => "gpt-5.5",
            _ => DEFAULT_OPENAI_MODEL,
        };

        self.connection
            .execute(
                "INSERT INTO settings (key, value, updated_at)
                 VALUES ('openai_model', ?1, ?2)
                 ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
                params![normalized, now_iso()],
            )
            .map_err(|error| error.to_string())?;

        self.openai_status()
    }

    fn openai_model(&self) -> Result<String, String> {
        self.connection
            .query_row(
                "SELECT value FROM settings WHERE key = 'openai_model'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()
            .map_err(|error| error.to_string())
            .map(|model| model.unwrap_or_else(|| DEFAULT_OPENAI_MODEL.to_string()))
    }

    fn openai_api_key(&self) -> Option<String> {
        std::env::var("OPENAI_API_KEY")
            .ok()
            .filter(|key| !key.trim().is_empty())
            .or_else(|| keyring_entry().and_then(|entry| entry.get_password().ok()))
    }

    fn migrate_supports_relation_type(&self) -> Result<(), rusqlite::Error> {
        let sql = self
            .connection
            .query_row(
                "SELECT sql FROM sqlite_master WHERE type='table' AND name='card_relations'",
                [],
                |row| row.get::<_, String>(0),
            )
            .optional()?;

        if sql.as_deref().is_none_or(|value| value.contains("'supports'")) {
            return Ok(());
        }

        self.connection.execute_batch(
            r#"
            PRAGMA foreign_keys = OFF;
            ALTER TABLE card_relations RENAME TO card_relations_old;
            CREATE TABLE card_relations (
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
                  'source',
                  'supports'
                )
              ),
              reason TEXT NOT NULL,
              confidence REAL NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
              created_at TEXT NOT NULL,
              FOREIGN KEY (source_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE,
              FOREIGN KEY (target_card_id) REFERENCES knowledge_cards(id) ON DELETE CASCADE
            );
            INSERT INTO card_relations
              (id, source_card_id, target_card_id, relation_type, reason, confidence, created_at)
            SELECT id, source_card_id, target_card_id, relation_type, reason, confidence, created_at
            FROM card_relations_old;
            DROP TABLE card_relations_old;
            CREATE INDEX IF NOT EXISTS idx_card_relations_source_card_id
              ON card_relations(source_card_id);
            CREATE INDEX IF NOT EXISTS idx_card_relations_target_card_id
              ON card_relations(target_card_id);
            PRAGMA foreign_keys = ON;
            "#,
        )?;

        Ok(())
    }
}

fn keyring_entry() -> Option<Entry> {
    Entry::new(KEYRING_SERVICE, KEYRING_USER).ok()
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

    #[test]
    fn preview_does_not_persist_until_confirmed() {
        let tempdir = tempdir().expect("create tempdir");
        let mut repository =
            CardMindRepository::open(tempdir.path().join("cardmind.sqlite")).expect("open db");

        let conversation = repository
            .create_conversation(CreateConversationInput {
                title: Some("预览测试".to_string()),
                raw_content: "CardMind 使用 SQLite 保存知识卡片，并形成 knowledge graph。".to_string(),
                source_type: Some("manual".to_string()),
            })
            .expect("create conversation");
        let preview = repository
            .preview_extraction(&conversation.id)
            .expect("preview extraction");

        assert_eq!(repository.list_cards().unwrap().len(), 0);
        assert!(!preview.cards.is_empty());

        repository
            .confirm_extraction(crate::models::ConfirmExtractionInput {
                conversation_id: conversation.id,
                cards: preview.cards,
                relations: preview.relations,
            })
            .expect("confirm extraction");

        assert!(!repository.list_cards().unwrap().is_empty());
    }

    #[test]
    fn seed_sample_data_creates_expected_graph() {
        let tempdir = tempdir().expect("create tempdir");
        let mut repository =
            CardMindRepository::open(tempdir.path().join("cardmind.sqlite")).expect("open db");

        repository.seed_sample_data().expect("seed sample data");
        let graph = repository.get_graph().expect("get graph");
        let relations = repository.list_relations().expect("list relations");

        assert_eq!(repository.list_conversations().unwrap().len(), 1);
        assert_eq!(graph.nodes.len(), 5);
        assert_eq!(graph.edges.len(), 3);
        assert!(relations
            .iter()
            .any(|relation| relation.relation_type == "supports"));
    }
}
