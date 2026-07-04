export interface ExtractedCardDraft {
  title: string;
  summary: string;
  content: string;
  type: string;
  tags: string[];
}

export interface ExtractedRelationDraft {
  source_title: string;
  target_title: string;
  relation_type: "prerequisite" | "contains" | "related" | "contrast" | "application" | "source";
  reason: string;
  confidence: number;
}

export interface ExtractionResult {
  cards: ExtractedCardDraft[];
  relations: ExtractedRelationDraft[];
}

const conceptRules: Array<{
  title: string;
  keywords: string[];
  summary: string;
  content: string;
  type: string;
  tags: string[];
}> = [
  {
    title: "产品化",
    keywords: ["产品化", "product"],
    summary: "产品化是把技术能力变成可交付、可维护、可迭代的产品。",
    content:
      "产品化不是简单写代码，而是把技术能力包装成用户可以使用、持续维护、持续迭代的产品能力。",
    type: "concept",
    tags: ["产品", "工程", "交付"]
  },
  {
    title: "本地优先",
    keywords: ["本地优先", "local-first", "local first"],
    summary: "本地优先是指数据主要保存在用户本地，优先保证数据归用户所有。",
    content:
      "本地优先适合个人知识系统，因为用户的学习记录、对话内容和知识卡片都具有长期价值和隐私属性。",
    type: "concept",
    tags: ["数据存储", "隐私", "本地化"]
  },
  {
    title: "知识卡片",
    keywords: ["知识卡片", "knowledge card", "cards"],
    summary: "知识卡片是从对话中抽取出的最小知识单位。",
    content:
      "知识卡片把一段对话中的有效知识点结构化保存，便于复习、搜索、连接和后续导出。",
    type: "concept",
    tags: ["知识管理", "学习", "结构化"]
  },
  {
    title: "知识图谱",
    keywords: ["知识图谱", "knowledge graph", "graph"],
    summary: "知识图谱用节点和边表达知识点之间的关系。",
    content:
      "在 CardMind 中，节点来自 KnowledgeCard，边来自 CardRelation，用户可以通过图谱看到知识之间的前置、包含、对比、相关和应用关系。",
    type: "concept",
    tags: ["图谱", "关系", "可视化"]
  },
  {
    title: "SQLite",
    keywords: ["sqlite", "数据库", "structured"],
    summary: "SQLite 是适合本地优先产品的轻量结构化数据库。",
    content:
      "SQLite 让 CardMind 在不依赖云端服务的情况下保存对话、卡片和关系，同时为全文搜索、同步、备份和数据迁移留下空间。",
    type: "technology",
    tags: ["数据库", "本地存储", "架构"]
  }
];

// Replace this service with an LLM-backed extractor later; API and database layers depend only on this return shape.
export function extractKnowledgeCards(conversationText: string): ExtractionResult {
  const normalizedText = conversationText.toLowerCase();
  const matchedCards = conceptRules
    .filter((rule) => rule.keywords.some((keyword) => normalizedText.includes(keyword.toLowerCase())))
    .map(({ keywords: _keywords, ...card }) => card);

  const cards = matchedCards.length > 0 ? matchedCards : createFallbackCards(conversationText);

  return {
    cards,
    relations: createRelations(cards)
  };
}

function createFallbackCards(conversationText: string): ExtractedCardDraft[] {
  const sentences = conversationText
    .split(/[。！？.!?\r\n]+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)
    .slice(0, 3);

  if (sentences.length === 0) {
    return [
      {
        title: "Imported Conversation Insight",
        summary: "This card captures the main imported conversation as a first structured knowledge point.",
        content: conversationText.slice(0, 500),
        type: "note",
        tags: ["imported", "conversation"]
      }
    ];
  }

  return sentences.map((sentence, index) => ({
    title: createFallbackTitle(sentence, index),
    summary: sentence.length > 120 ? `${sentence.slice(0, 117)}...` : sentence,
    content: sentence,
    type: "note",
    tags: ["imported", "mock-extraction"]
  }));
}

function createFallbackTitle(sentence: string, index: number) {
  const compact = sentence.replace(/\s+/g, " ");
  return compact.length > 28 ? `${compact.slice(0, 28)}...` : `Conversation Insight ${index + 1}`;
}

function createRelations(cards: ExtractedCardDraft[]): ExtractedRelationDraft[] {
  if (cards.length < 2) {
    return [];
  }

  return cards.slice(1).map((card, index) => ({
    source_title: cards[index].title,
    target_title: card.title,
    relation_type: inferRelationType(cards[index], card),
    reason: `Mock extraction connected "${cards[index].title}" with "${card.title}" because they appear in the same imported conversation.`,
    confidence: 0.72
  }));
}

function inferRelationType(source: ExtractedCardDraft, target: ExtractedCardDraft): ExtractedRelationDraft["relation_type"] {
  if (source.title === "SQLite" || target.title === "SQLite") {
    return "application";
  }

  if (source.title === "知识卡片" && target.title === "知识图谱") {
    return "contains";
  }

  if (source.title === "本地优先" || target.title === "本地优先") {
    return "related";
  }

  return "related";
}
