use crate::extractor::extract_knowledge_cards;
use crate::models::{
    CardRelation, ConfirmExtractionInput, Conversation, CreateConversationInput, ExtractionPreview,
    ExtractedCardDraft, ExtractedRelationDraft, GraphEdge, GraphNode, KnowledgeCard, KnowledgeGraph,
    OpenAiStatus, PersistedExtraction,
    SearchCardsInput, SearchCardsResult,
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
        repository.initialize_search_index();
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

            let _ = transaction.execute(
                "INSERT INTO knowledge_cards_fts (card_id, title, summary, content, tags)
                 VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    card.id,
                    card.title,
                    card.summary,
                    card.content,
                    serde_json::to_string(&card.tags).unwrap_or_default()
                ],
            );

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

    pub fn search_cards(&self, input: SearchCardsInput) -> Result<SearchCardsResult, String> {
        let query = input.query.trim().to_string();
        if query.is_empty() && input.tag.as_deref().unwrap_or_default().trim().is_empty() {
            return Ok(SearchCardsResult {
                cards: self.list_cards()?,
                engine: self.search_engine_name(),
            });
        }

        if self.is_fts_available() {
            match self.search_cards_fts(&query, input.tag.as_deref()) {
                Ok(cards) => {
                    return Ok(SearchCardsResult {
                        cards,
                        engine: "fts5".to_string(),
                    });
                }
                Err(_) => {
                    // Fall through to LIKE search. FTS can fail on special query syntax.
                }
            }
        }

        Ok(SearchCardsResult {
            cards: self.search_cards_like(&query, input.tag.as_deref())?,
            engine: "like".to_string(),
        })
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

    pub fn export_card_markdown(&self, id: &str) -> Result<String, String> {
        let card = self
            .get_card(id)?
            .ok_or_else(|| "Knowledge card not found".to_string())?;
        Ok(self.render_markdown_export(&[card]))
    }

    pub fn export_all_cards_markdown(&self) -> Result<String, String> {
        let cards = self.list_cards()?;
        Ok(self.render_markdown_export(&cards))
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
            title: Some("示例：学习复盘、工程分析与简历沉淀".to_string()),
            raw_content: "这是一段 CardMind 示例对话，内容来自个人学习和面试复盘场景：视频点播后端修复记录需要沉淀为可复用的排查方法；内存池 benchmark 分析需要记录实验口径和性能结论；TinyMuduo Reactor 事件循环问答可以拆成 Channel、Poller、EventLoop 等知识点；简历优化建议需要区分真实项目能力和包装表达；微服务拆分边界需要说明模块职责、数据归属和接口契约。".to_string(),
            source_type: Some("sample".to_string()),
        })?;

        let cards = vec![
            ExtractedCardDraft {
                title: "视频点播后端修复记录".to_string(),
                summary: "后端修复记录应沉淀问题现象、定位路径、验证命令和最终边界。".to_string(),
                content: "视频点播后端修复不只是记录改了哪一行代码，还要记录接口现象、日志线索、数据库状态、复现步骤、修复方案和 smoke test 结果，方便之后复盘和面试讲解。".to_string(),
                r#type: "engineering-note".to_string(),
                tags: vec!["后端".to_string(), "视频点播".to_string(), "排障".to_string()],
            },
            ExtractedCardDraft {
                title: "内存池 benchmark 分析".to_string(),
                summary: "benchmark 结论必须绑定测试口径，否则性能数字不可复用。".to_string(),
                content: "分析内存池 benchmark 时，需要同时记录分配粒度、线程数、循环次数、预热策略、对照组、统计指标和异常波动。否则单个耗时数字很难说明设计是否真的更好。".to_string(),
                r#type: "analysis".to_string(),
                tags: vec!["C++".to_string(), "性能".to_string(), "benchmark".to_string()],
            },
            ExtractedCardDraft {
                title: "TinyMuduo Reactor 事件循环".to_string(),
                summary: "Reactor 通过事件循环把 IO 就绪事件分发给 Channel 回调。".to_string(),
                content: "TinyMuduo 的 Reactor 模型可以从 EventLoop、Poller、Channel 三个对象理解：Poller 等待 IO 就绪，Channel 描述 fd 和回调，EventLoop 负责循环调度和线程归属。".to_string(),
                r#type: "concept".to_string(),
                tags: vec!["C++".to_string(), "网络库".to_string(), "Reactor".to_string()],
            },
            ExtractedCardDraft {
                title: "简历优化建议".to_string(),
                summary: "简历表达要把真实经历转成可验证的工程成果。".to_string(),
                content: "简历优化不是夸大项目，而是把做过的功能、验证方式、技术取舍和结果边界表达清楚。尤其要区分已完成能力、demo 能力和后续计划。".to_string(),
                r#type: "career-note".to_string(),
                tags: vec!["简历".to_string(), "面试".to_string(), "表达".to_string()],
            },
            ExtractedCardDraft {
                title: "微服务拆分边界".to_string(),
                summary: "微服务拆分边界应围绕业务职责、数据归属和接口契约判断。".to_string(),
                content: "微服务拆分不能只按代码目录拆，应该明确每个服务的业务职责、数据所有权、跨服务调用方式、失败处理和演进成本。边界不清会带来分布式复杂度。".to_string(),
                r#type: "architecture".to_string(),
                tags: vec!["微服务".to_string(), "架构".to_string(), "边界".to_string()],
            },
        ];

        let relations = vec![
            ExtractedRelationDraft {
                source_title: "视频点播后端修复记录".to_string(),
                target_title: "简历优化建议".to_string(),
                relation_type: "related".to_string(),
                reason: "真实修复记录可以转化为简历中可验证的项目成果。".to_string(),
                confidence: 0.9,
            },
            ExtractedRelationDraft {
                source_title: "内存池 benchmark 分析".to_string(),
                target_title: "简历优化建议".to_string(),
                relation_type: "supports".to_string(),
                reason: "清晰的 benchmark 口径支持简历中对性能优化的可信表达。".to_string(),
                confidence: 0.92,
            },
            ExtractedRelationDraft {
                source_title: "微服务拆分边界".to_string(),
                target_title: "视频点播后端修复记录".to_string(),
                relation_type: "contains".to_string(),
                reason: "视频点播后端问题定位通常涉及模块职责和服务边界判断。".to_string(),
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

    fn initialize_search_index(&self) {
        if self
            .connection
            .execute_batch(
                r#"
                CREATE VIRTUAL TABLE IF NOT EXISTS knowledge_cards_fts
                USING fts5(card_id UNINDEXED, title, summary, content, tags);

                INSERT INTO knowledge_cards_fts (card_id, title, summary, content, tags)
                SELECT id, title, summary, content, tags
                FROM knowledge_cards
                WHERE NOT EXISTS (
                  SELECT 1 FROM knowledge_cards_fts WHERE knowledge_cards_fts.card_id = knowledge_cards.id
                );
                "#,
            )
            .is_err()
        {
            return;
        }
    }

    fn is_fts_available(&self) -> bool {
        self.connection
            .query_row(
                "SELECT 1 FROM sqlite_master WHERE type='table' AND name='knowledge_cards_fts'",
                [],
                |_| Ok(()),
            )
            .is_ok()
    }

    fn search_engine_name(&self) -> String {
        if self.is_fts_available() {
            "fts5".to_string()
        } else {
            "like".to_string()
        }
    }

    fn search_cards_fts(&self, query: &str, tag: Option<&str>) -> Result<Vec<KnowledgeCard>, String> {
        let fts_query = sanitize_fts_query(query);
        let tag_filter = tag.unwrap_or_default().trim().to_string();
        let mut statement = self
            .connection
            .prepare(
                "SELECT kc.id, kc.title, kc.summary, kc.content, kc.type, kc.tags, kc.mastery_status, kc.source_conversation_id, kc.created_at, kc.updated_at
                 FROM knowledge_cards kc
                 JOIN knowledge_cards_fts fts ON fts.card_id = kc.id
                 WHERE (?1 = '' OR knowledge_cards_fts MATCH ?1)
                   AND (?2 = '' OR kc.tags LIKE ?3)
                 ORDER BY kc.created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(
                params![fts_query, tag_filter, format!("%{}%", tag_filter)],
                map_card,
            )
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    fn search_cards_like(&self, query: &str, tag: Option<&str>) -> Result<Vec<KnowledgeCard>, String> {
        let query_filter = query.trim().to_string();
        let like_query = format!("%{}%", query_filter);
        let tag_filter = tag.unwrap_or_default().trim().to_string();
        let like_tag = format!("%{}%", tag_filter);

        let mut statement = self
            .connection
            .prepare(
                "SELECT id, title, summary, content, type, tags, mastery_status, source_conversation_id, created_at, updated_at
                 FROM knowledge_cards
                 WHERE (?1 = '' OR title LIKE ?2 OR summary LIKE ?2 OR content LIKE ?2)
                   AND (?3 = '' OR tags LIKE ?4)
                 ORDER BY created_at DESC",
            )
            .map_err(|error| error.to_string())?;

        let rows = statement
            .query_map(params![query_filter, like_query, tag_filter, like_tag], map_card)
            .map_err(|error| error.to_string())?;

        collect_rows(rows)
    }

    fn render_markdown_export(&self, cards: &[KnowledgeCard]) -> String {
        let relations = self.list_relations().unwrap_or_default();
        let cards_by_id = self
            .list_cards()
            .unwrap_or_default()
            .into_iter()
            .map(|card| (card.id.clone(), card))
            .collect::<HashMap<_, _>>();
        let mut output = String::from("# CardMind Export\n\n");

        for card in cards {
            output.push_str(&format!("## {}\n\n", card.title));
            output.push_str("摘要：\n");
            output.push_str(&format!("{}\n\n", card.summary));
            output.push_str("内容：\n");
            output.push_str(&format!("{}\n\n", card.content));
            output.push_str("来源对话：\n");
            output.push_str(&format!("{}\n\n", card.source_conversation_id));
            output.push_str("标签：\n");
            output.push_str(&format!("{}\n\n", card.tags.join(", ")));
            output.push_str("关系：\n");

            let related = relations
                .iter()
                .filter(|relation| relation.source_card_id == card.id || relation.target_card_id == card.id)
                .collect::<Vec<_>>();

            if related.is_empty() {
                output.push_str("- 暂无关系\n\n");
            } else {
                for relation in related {
                    let other_id = if relation.source_card_id == card.id {
                        &relation.target_card_id
                    } else {
                        &relation.source_card_id
                    };
                    let other_title = cards_by_id
                        .get(other_id)
                        .map(|other| other.title.as_str())
                        .unwrap_or(other_id);
                    output.push_str(&format!(
                        "- {} -> {}：{}\n",
                        relation.relation_type, other_title, relation.reason
                    ));
                }
                output.push('\n');
            }
        }

        output
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

fn sanitize_fts_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter_map(|token| {
            let cleaned = token
                .chars()
                .filter(|character| character.is_alphanumeric() || *character == '_' || ('\u{4e00}'..='\u{9fff}').contains(character))
                .collect::<String>();
            if cleaned.is_empty() {
                None
            } else {
                Some(cleaned)
            }
        })
        .collect::<Vec<_>>()
        .join(" ")
}

#[cfg(test)]
mod tests {
    use super::CardMindRepository;
    use crate::models::{CreateConversationInput, SearchCardsInput};
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

    #[test]
    fn search_cards_finds_seeded_demo_content() {
        let tempdir = tempdir().expect("create tempdir");
        let mut repository =
            CardMindRepository::open(tempdir.path().join("cardmind.sqlite")).expect("open db");

        repository.seed_sample_data().expect("seed sample data");
        let result = repository
            .search_cards(SearchCardsInput {
                query: "benchmark".to_string(),
                tag: None,
            })
            .expect("search cards");

        assert!(result.engine == "fts5" || result.engine == "like");
        assert!(result
            .cards
            .iter()
            .any(|card| card.title == "内存池 benchmark 分析"));
    }

    #[test]
    fn export_markdown_contains_core_card_fields() {
        let tempdir = tempdir().expect("create tempdir");
        let mut repository =
            CardMindRepository::open(tempdir.path().join("cardmind.sqlite")).expect("open db");

        repository.seed_sample_data().expect("seed sample data");
        let card = repository
            .list_cards()
            .expect("list cards")
            .into_iter()
            .find(|card| card.title == "TinyMuduo Reactor 事件循环")
            .expect("find demo card");
        let markdown = repository
            .export_card_markdown(&card.id)
            .expect("export markdown");

        assert!(markdown.contains("# CardMind Export"));
        assert!(markdown.contains("TinyMuduo Reactor 事件循环"));
        assert!(markdown.contains("摘要："));
        assert!(markdown.contains(&card.source_conversation_id));
    }
}
