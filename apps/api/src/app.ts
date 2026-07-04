import cors from "cors";
import express from "express";
import { z } from "zod";
import { extractKnowledgeCards } from "./extraction/mockExtractor.js";
import { CardMindRepository } from "./repositories.js";

const createConversationSchema = z.object({
  title: z.string().trim().min(1).optional(),
  raw_content: z.string().trim().min(1, "raw_content is required"),
  source_type: z.string().trim().min(1).optional()
});

export function createApp(repository: CardMindRepository) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, product: "CardMind" });
  });

  app.post("/api/conversations", (req, res, next) => {
    try {
      const input = createConversationSchema.parse(req.body);
      const conversation = repository.createConversation(input);
      res.status(201).json(conversation);
    } catch (error) {
      next(error);
    }
  });

  app.get("/api/conversations", (_req, res) => {
    res.json(repository.listConversations());
  });

  app.get("/api/conversations/:id", (req, res) => {
    const conversation = repository.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    res.json(conversation);
  });

  app.post("/api/conversations/:id/extract", (req, res) => {
    const conversation = repository.getConversation(req.params.id);
    if (!conversation) {
      res.status(404).json({ error: "Conversation not found" });
      return;
    }

    const extraction = extractKnowledgeCards(conversation.raw_content);
    const cards = extraction.cards.map((card) =>
      repository.createKnowledgeCard({
        ...card,
        source_conversation_id: conversation.id
      })
    );

    const cardByTitle = new Map(cards.map((card) => [card.title, card]));
    const relations = extraction.relations.flatMap((relation) => {
      const source = cardByTitle.get(relation.source_title);
      const target = cardByTitle.get(relation.target_title);

      if (!source || !target) {
        return [];
      }

      return repository.createRelation({
        source_card_id: source.id,
        target_card_id: target.id,
        relation_type: relation.relation_type,
        reason: relation.reason,
        confidence: relation.confidence
      });
    });

    res.status(201).json({ cards, relations });
  });

  app.get("/api/cards", (_req, res) => {
    res.json(repository.listKnowledgeCards());
  });

  app.get("/api/cards/:id", (req, res) => {
    const card = repository.getKnowledgeCard(req.params.id);
    if (!card) {
      res.status(404).json({ error: "Knowledge card not found" });
      return;
    }

    res.json(card);
  });

  app.get("/api/relations", (_req, res) => {
    res.json(repository.listRelations());
  });

  app.get("/api/graph", (_req, res) => {
    res.json(repository.getGraph());
  });

  app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    if (error instanceof z.ZodError) {
      res.status(400).json({ error: "Invalid request", details: error.flatten() });
      return;
    }

    console.error(error);
    res.status(500).json({ error: "Internal server error" });
  });

  return app;
}
