import type Database from "better-sqlite3";
import { randomUUID } from "node:crypto";
import type {
  CardRelation,
  Conversation,
  GraphEdge,
  GraphNode,
  KnowledgeCard,
  RelationType
} from "./types.js";

type CardRow = Omit<KnowledgeCard, "tags"> & { tags: string };

function nowIso() {
  return new Date().toISOString();
}

function createId(prefix: string) {
  return `${prefix}_${randomUUID()}`;
}

function parseCard(row: CardRow): KnowledgeCard {
  return {
    ...row,
    tags: JSON.parse(row.tags) as string[]
  };
}

export class CardMindRepository {
  constructor(private readonly db: Database.Database) {}

  createConversation(input: { title?: string; raw_content: string; source_type?: string }): Conversation {
    const timestamp = nowIso();
    const title = input.title?.trim() || this.createTitle(input.raw_content);
    const conversation: Conversation = {
      id: createId("conv"),
      title,
      raw_content: input.raw_content,
      source_type: input.source_type ?? "manual",
      created_at: timestamp,
      updated_at: timestamp
    };

    this.db
      .prepare(
        `INSERT INTO conversations (id, title, raw_content, source_type, created_at, updated_at)
         VALUES (@id, @title, @raw_content, @source_type, @created_at, @updated_at)`
      )
      .run(conversation);

    return conversation;
  }

  listConversations(): Conversation[] {
    return this.db
      .prepare("SELECT * FROM conversations ORDER BY created_at DESC")
      .all() as Conversation[];
  }

  getConversation(id: string): Conversation | undefined {
    return this.db.prepare("SELECT * FROM conversations WHERE id = ?").get(id) as Conversation | undefined;
  }

  createKnowledgeCard(input: {
    title: string;
    summary: string;
    content: string;
    type: string;
    tags: string[];
    source_conversation_id: string;
    mastery_status?: "new" | "learning" | "mastered";
  }): KnowledgeCard {
    const timestamp = nowIso();
    const card: KnowledgeCard = {
      id: createId("card"),
      title: input.title,
      summary: input.summary,
      content: input.content,
      type: input.type,
      tags: input.tags,
      mastery_status: input.mastery_status ?? "new",
      source_conversation_id: input.source_conversation_id,
      created_at: timestamp,
      updated_at: timestamp
    };

    this.db
      .prepare(
        `INSERT INTO knowledge_cards
         (id, title, summary, content, type, tags, mastery_status, source_conversation_id, created_at, updated_at)
         VALUES (@id, @title, @summary, @content, @type, @tags, @mastery_status, @source_conversation_id, @created_at, @updated_at)`
      )
      .run({ ...card, tags: JSON.stringify(card.tags) });

    return card;
  }

  listKnowledgeCards(): KnowledgeCard[] {
    const rows = this.db.prepare("SELECT * FROM knowledge_cards ORDER BY created_at DESC").all() as CardRow[];
    return rows.map(parseCard);
  }

  getKnowledgeCard(id: string): KnowledgeCard | undefined {
    const row = this.db.prepare("SELECT * FROM knowledge_cards WHERE id = ?").get(id) as CardRow | undefined;
    return row ? parseCard(row) : undefined;
  }

  createRelation(input: {
    source_card_id: string;
    target_card_id: string;
    relation_type: RelationType;
    reason: string;
    confidence: number;
  }): CardRelation {
    const relation: CardRelation = {
      id: createId("rel"),
      source_card_id: input.source_card_id,
      target_card_id: input.target_card_id,
      relation_type: input.relation_type,
      reason: input.reason,
      confidence: input.confidence,
      created_at: nowIso()
    };

    this.db
      .prepare(
        `INSERT INTO card_relations
         (id, source_card_id, target_card_id, relation_type, reason, confidence, created_at)
         VALUES (@id, @source_card_id, @target_card_id, @relation_type, @reason, @confidence, @created_at)`
      )
      .run(relation);

    return relation;
  }

  listRelations(): CardRelation[] {
    return this.db
      .prepare("SELECT * FROM card_relations ORDER BY created_at DESC")
      .all() as CardRelation[];
  }

  getGraph(): { nodes: GraphNode[]; edges: GraphEdge[] } {
    const cards = this.listKnowledgeCards();
    const relations = this.listRelations();

    return {
      nodes: cards.map((card) => ({
        id: card.id,
        label: card.title,
        type: card.type,
        summary: card.summary,
        tags: card.tags,
        mastery_status: card.mastery_status,
        source_conversation_id: card.source_conversation_id
      })),
      edges: relations.map((relation) => ({
        id: relation.id,
        source: relation.source_card_id,
        target: relation.target_card_id,
        label: relation.relation_type,
        reason: relation.reason,
        confidence: relation.confidence
      }))
    };
  }

  private createTitle(rawContent: string) {
    const firstLine = rawContent
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);

    return firstLine ? firstLine.slice(0, 60) : "Untitled conversation";
  }
}
