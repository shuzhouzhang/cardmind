import { invoke } from "@tauri-apps/api/core";
import type {
  CardRelation,
  BackupInfo,
  Conversation,
  CreateRelationInput,
  ExtractedCardDraft,
  ExtractedRelationDraft,
  ExtractionPreview,
  KnowledgeCard,
  KnowledgeGraph,
  MergeCardsInput,
  OpenAiStatus,
  SearchCardsResult,
  UpdateRelationInput,
  UpdateCardInput
} from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

declare global {
  interface Window {
    __TAURI_INTERNALS__?: unknown;
  }
}

function isTauriRuntime() {
  return typeof window !== "undefined" && Boolean(window.__TAURI_INTERNALS__);
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...options?.headers
    },
    ...options
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || `Request failed with ${response.status}`);
  }

  return response.json() as Promise<T>;
}

async function getRequiredCard(id: string) {
  const card = await invoke<KnowledgeCard | null>("get_card", { id });
  if (!card) {
    throw new Error("Knowledge card not found");
  }

  return card;
}

export const api = {
  createConversation(input: { raw_content: string; source_type?: string; title?: string }) {
    if (isTauriRuntime()) {
      return invoke<Conversation>("create_conversation", { input });
    }

    return request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  listConversations() {
    if (isTauriRuntime()) {
      return invoke<Conversation[]>("list_conversations");
    }

    return request<Conversation[]>("/api/conversations");
  },
  extractConversation(id: string) {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("extract_conversation", { id });
    }

    return request<{ cards: KnowledgeCard[]; relations: CardRelation[] }>(`/api/conversations/${id}/extract`, {
      method: "POST"
    });
  },
  previewExtraction(id: string): Promise<ExtractionPreview> {
    if (isTauriRuntime()) {
      return invoke<ExtractionPreview>("preview_extraction", { id });
    }

    return this.extractConversation(id).then((result) => ({
      cards: result.cards,
      relations: result.relations.map((relation) => ({
        source_title: relation.source_card_id,
        target_title: relation.target_card_id,
        relation_type: relation.relation_type,
        reason: relation.reason,
        confidence: relation.confidence
      })),
      provider: "legacy",
      warning: undefined
    }));
  },
  confirmExtraction(input: {
    conversation_id: string;
    cards: ExtractedCardDraft[];
    relations: ExtractedRelationDraft[];
  }) {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("confirm_extraction", { input });
    }

    return Promise.resolve({ cards: [], relations: [] });
  },
  listCards() {
    if (isTauriRuntime()) {
      return invoke<KnowledgeCard[]>("list_cards");
    }

    return request<KnowledgeCard[]>("/api/cards");
  },
  getCard(id: string) {
    if (isTauriRuntime()) {
      return getRequiredCard(id);
    }

    return request<KnowledgeCard>(`/api/cards/${id}`);
  },
  updateCard(input: UpdateCardInput) {
    if (isTauriRuntime()) {
      return invoke<KnowledgeCard>("update_card", { input });
    }

    return Promise.reject(new Error("卡片编辑只能在桌面版中使用。"));
  },
  deleteCard(id: string) {
    if (isTauriRuntime()) {
      return invoke<void>("delete_card", { id });
    }

    return Promise.reject(new Error("卡片删除只能在桌面版中使用。"));
  },
  mergeCards(input: MergeCardsInput) {
    if (isTauriRuntime()) {
      return invoke<KnowledgeCard>("merge_cards", { input });
    }

    return Promise.reject(new Error("卡片合并只能在桌面版中使用。"));
  },
  searchCards(input: { query: string; tag?: string; card_type?: string; mastery_status?: string }) {
    if (isTauriRuntime()) {
      return invoke<SearchCardsResult>("search_cards", { input });
    }

    return this.listCards().then((cards) => {
      const query = input.query.trim().toLowerCase();
      const tag = input.tag?.trim().toLowerCase() ?? "";
      const cardType = input.card_type?.trim().toLowerCase() ?? "";
      const masteryStatus = input.mastery_status?.trim().toLowerCase() ?? "";
      return {
        cards: cards.filter((card) => {
          const matchesQuery =
            query.length === 0 ||
            card.title.toLowerCase().includes(query) ||
            card.summary.toLowerCase().includes(query) ||
            card.content.toLowerCase().includes(query);
          const matchesTag = tag.length === 0 || card.tags.some((item) => item.toLowerCase().includes(tag));
          const matchesType = cardType.length === 0 || card.type.toLowerCase() === cardType;
          const matchesMastery = masteryStatus.length === 0 || card.mastery_status === masteryStatus;
          return matchesQuery && matchesTag && matchesType && matchesMastery;
        }),
        engine: "like"
      };
    });
  },
  getGraph() {
    if (isTauriRuntime()) {
      return invoke<KnowledgeGraph>("get_graph");
    }

    return request<KnowledgeGraph>("/api/graph");
  },
  listRelations() {
    if (isTauriRuntime()) {
      return invoke<CardRelation[]>("list_relations");
    }

    return request<CardRelation[]>("/api/relations");
  },
  createRelation(input: CreateRelationInput) {
    if (isTauriRuntime()) {
      return invoke<CardRelation>("create_relation", { input });
    }

    return Promise.reject(new Error("关系编辑只能在桌面版中使用。"));
  },
  updateRelation(input: UpdateRelationInput) {
    if (isTauriRuntime()) {
      return invoke<CardRelation>("update_relation", { input });
    }

    return Promise.reject(new Error("关系编辑只能在桌面版中使用。"));
  },
  deleteRelation(id: string) {
    if (isTauriRuntime()) {
      return invoke<void>("delete_relation", { id });
    }

    return Promise.reject(new Error("关系删除只能在桌面版中使用。"));
  },
  getCardRelations(cardId: string) {
    if (isTauriRuntime()) {
      return invoke<CardRelation[]>("get_card_relations", { cardId });
    }

    return this.listRelations().then((relations) =>
      relations.filter((relation) => relation.source_card_id === cardId || relation.target_card_id === cardId)
    );
  },
  seedSampleData() {
    if (isTauriRuntime()) {
      return invoke<{ cards: KnowledgeCard[]; relations: CardRelation[] }>("seed_sample_data");
    }

    return Promise.reject(new Error("示例数据只能在桌面版中加载。"));
  },
  getOpenAiStatus() {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("get_openai_status");
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  saveOpenAiApiKey(apiKey: string) {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("save_openai_api_key", { input: { api_key: apiKey } });
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  clearOpenAiApiKey() {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("clear_openai_api_key");
    }

    return Promise.resolve({ has_api_key: false, model: "gpt-5.4-mini" });
  },
  setOpenAiModel(model: string) {
    if (isTauriRuntime()) {
      return invoke<OpenAiStatus>("set_openai_model", { input: { model } });
    }

    return Promise.resolve({ has_api_key: false, model });
  },
  exportCardMarkdown(id: string) {
    if (isTauriRuntime()) {
      return invoke<string>("export_card_markdown", { id });
    }

    return Promise.resolve("");
  },
  exportAllCardsMarkdown() {
    if (isTauriRuntime()) {
      return invoke<string>("export_all_cards_markdown");
    }

    return Promise.resolve("");
  },
  exportCardMarkdownFile(id: string) {
    if (isTauriRuntime()) {
      return invoke<string>("export_card_markdown_file", { id });
    }

    return Promise.reject(new Error("文件导出只能在桌面版中使用。"));
  },
  exportAllCardsMarkdownFile() {
    if (isTauriRuntime()) {
      return invoke<string>("export_all_cards_markdown_file");
    }

    return Promise.reject(new Error("文件导出只能在桌面版中使用。"));
  },
  createDatabaseBackup() {
    if (isTauriRuntime()) {
      return invoke<BackupInfo>("create_database_backup");
    }

    return Promise.reject(new Error("数据库备份只能在桌面版中使用。"));
  },
  listDatabaseBackups() {
    if (isTauriRuntime()) {
      return invoke<BackupInfo[]>("list_database_backups");
    }

    return Promise.resolve([]);
  },
  restoreDatabaseBackup(path: string) {
    if (isTauriRuntime()) {
      return invoke<void>("restore_database_backup", { path });
    }

    return Promise.reject(new Error("数据库恢复只能在桌面版中使用。"));
  }
};
