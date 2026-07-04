import type { CardRelation, Conversation, KnowledgeCard, KnowledgeGraph } from "./types";

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? "";

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

export const api = {
  createConversation(input: { raw_content: string; source_type?: string; title?: string }) {
    return request<Conversation>("/api/conversations", {
      method: "POST",
      body: JSON.stringify(input)
    });
  },
  listConversations() {
    return request<Conversation[]>("/api/conversations");
  },
  extractConversation(id: string) {
    return request<{ cards: KnowledgeCard[]; relations: CardRelation[] }>(`/api/conversations/${id}/extract`, {
      method: "POST"
    });
  },
  listCards() {
    return request<KnowledgeCard[]>("/api/cards");
  },
  getCard(id: string) {
    return request<KnowledgeCard>(`/api/cards/${id}`);
  },
  getGraph() {
    return request<KnowledgeGraph>("/api/graph");
  }
};
