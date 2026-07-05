use crate::models::{ExtractedCardDraft, ExtractedRelationDraft, ExtractionResult};

struct ConceptRule {
    title: &'static str,
    keywords: &'static [&'static str],
    summary: &'static str,
    content: &'static str,
    card_type: &'static str,
    tags: &'static [&'static str],
}

const CONCEPT_RULES: &[ConceptRule] = &[
    ConceptRule {
        title: "产品化",
        keywords: &["产品化", "product"],
        summary: "产品化是把技术能力变成可交付、可维护、可迭代的产品。",
        content: "产品化不是简单写代码，而是把技术能力包装成用户可以使用、持续维护、持续迭代的产品能力。",
        card_type: "concept",
        tags: &["产品", "工程", "交付"],
    },
    ConceptRule {
        title: "本地优先",
        keywords: &["本地优先", "local-first", "local first"],
        summary: "本地优先是指数据主要保存在用户本地，优先保证数据归用户所有。",
        content: "本地优先适合个人知识系统，因为用户的学习记录、对话内容和知识卡片都具有长期价值和隐私属性。",
        card_type: "concept",
        tags: &["数据存储", "隐私", "本地化"],
    },
    ConceptRule {
        title: "知识卡片",
        keywords: &["知识卡片", "knowledge card", "cards"],
        summary: "知识卡片是从对话中抽取出的最小知识单位。",
        content: "知识卡片把一段对话中的有效知识点结构化保存，便于复习、搜索、连接和后续导出。",
        card_type: "concept",
        tags: &["知识管理", "学习", "结构化"],
    },
    ConceptRule {
        title: "知识图谱",
        keywords: &["知识图谱", "knowledge graph", "graph"],
        summary: "知识图谱用节点和边表达知识点之间的关系。",
        content: "在 CardMind 中，节点来自 KnowledgeCard，边来自 CardRelation，用户可以通过图谱看到知识之间的前置、包含、对比、相关和应用关系。",
        card_type: "concept",
        tags: &["图谱", "关系", "可视化"],
    },
    ConceptRule {
        title: "SQLite",
        keywords: &["sqlite", "数据库", "structured"],
        summary: "SQLite 是适合本地优先产品的轻量结构化数据库。",
        content: "SQLite 让 CardMind 在不依赖云端服务的情况下保存对话、卡片和关系，同时为全文搜索、同步、备份和数据迁移留下空间。",
        card_type: "technology",
        tags: &["数据库", "本地存储", "架构"],
    },
];

pub fn extract_knowledge_cards(conversation_text: &str) -> ExtractionResult {
    let normalized_text = conversation_text.to_lowercase();
    let mut cards = CONCEPT_RULES
        .iter()
        .filter(|rule| {
            rule.keywords
                .iter()
                .any(|keyword| normalized_text.contains(&keyword.to_lowercase()))
        })
        .map(card_from_rule)
        .collect::<Vec<_>>();

    if cards.is_empty() {
        cards = create_fallback_cards(conversation_text);
    }

    let relations = create_relations(&cards);
    ExtractionResult { cards, relations }
}

fn card_from_rule(rule: &ConceptRule) -> ExtractedCardDraft {
    ExtractedCardDraft {
        title: rule.title.to_string(),
        summary: rule.summary.to_string(),
        content: rule.content.to_string(),
        r#type: rule.card_type.to_string(),
        tags: rule.tags.iter().map(|tag| (*tag).to_string()).collect(),
    }
}

fn create_fallback_cards(conversation_text: &str) -> Vec<ExtractedCardDraft> {
    let sentences = conversation_text
        .split(|character| {
            matches!(
                character,
                '。' | '！' | '？' | '.' | '!' | '?' | '\r' | '\n'
            )
        })
        .map(str::trim)
        .filter(|sentence| sentence.chars().count() >= 12)
        .take(3)
        .collect::<Vec<_>>();

    if sentences.is_empty() {
        return vec![ExtractedCardDraft {
            title: "Imported Conversation Insight".to_string(),
            summary: "This card captures the main imported conversation as a first structured knowledge point.".to_string(),
            content: conversation_text.chars().take(500).collect(),
            r#type: "note".to_string(),
            tags: vec!["imported".to_string(), "conversation".to_string()],
        }];
    }

    sentences
        .iter()
        .enumerate()
        .map(|(index, sentence)| ExtractedCardDraft {
            title: create_fallback_title(sentence, index),
            summary: truncate(sentence, 120),
            content: (*sentence).to_string(),
            r#type: "note".to_string(),
            tags: vec!["imported".to_string(), "mock-extraction".to_string()],
        })
        .collect()
}

fn create_fallback_title(sentence: &str, index: usize) -> String {
    let compact = sentence.split_whitespace().collect::<Vec<_>>().join(" ");
    if compact.chars().count() > 28 {
        format!("{}...", compact.chars().take(28).collect::<String>())
    } else {
        format!("Conversation Insight {}", index + 1)
    }
}

fn truncate(value: &str, limit: usize) -> String {
    if value.chars().count() > limit {
        format!("{}...", value.chars().take(limit - 3).collect::<String>())
    } else {
        value.to_string()
    }
}

fn create_relations(cards: &[ExtractedCardDraft]) -> Vec<ExtractedRelationDraft> {
    if cards.len() < 2 {
        return Vec::new();
    }

    cards
        .windows(2)
        .map(|pair| ExtractedRelationDraft {
            source_title: pair[0].title.clone(),
            target_title: pair[1].title.clone(),
            relation_type: infer_relation_type(&pair[0], &pair[1]).to_string(),
            reason: format!(
                "Mock extraction connected \"{}\" with \"{}\" because they appear in the same imported conversation.",
                pair[0].title, pair[1].title
            ),
            confidence: 0.72,
        })
        .collect()
}

fn infer_relation_type(source: &ExtractedCardDraft, target: &ExtractedCardDraft) -> &'static str {
    if source.title == "SQLite" || target.title == "SQLite" {
        "application"
    } else if source.title == "知识卡片" && target.title == "知识图谱" {
        "contains"
    } else {
        "related"
    }
}

#[cfg(test)]
mod tests {
    use super::extract_knowledge_cards;

    #[test]
    fn extracts_known_card_rules_and_relations() {
        let result = extract_knowledge_cards(
            "CardMind 是本地优先的 knowledge graph，并使用 SQLite 保存知识卡片。",
        );

        assert!(result.cards.iter().any(|card| card.title == "本地优先"));
        assert!(result.cards.iter().any(|card| card.title == "SQLite"));
        assert_eq!(result.relations.len(), result.cards.len() - 1);
    }

    #[test]
    fn fallback_creates_note_cards_for_unknown_content() {
        let result = extract_knowledge_cards(
            "排查播放接口时，先记录复现步骤和日志线索，再确认运行状态。性能测试需要固定输入规模和测量口径。",
        );

        assert!(!result.cards.is_empty());
        assert!(result.cards.len() <= 3);
        assert!(result.cards.iter().all(|card| card.r#type == "note"));
    }
}
