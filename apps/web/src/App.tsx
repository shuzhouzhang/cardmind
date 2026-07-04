import { BookOpen, BrainCircuit, FilePlus2, Home, Network } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { api } from "./api";
import type { Conversation, KnowledgeCard } from "./types";
import { GraphView } from "./GraphView";

type View = "home" | "import" | "cards" | "graph";

const navItems: Array<{ id: View; label: string; icon: typeof Home }> = [
  { id: "home", label: "Home", icon: Home },
  { id: "import", label: "Import", icon: FilePlus2 },
  { id: "cards", label: "Cards", icon: BookOpen },
  { id: "graph", label: "Graph", icon: Network }
];

export function App() {
  const [activeView, setActiveView] = useState<View>("home");
  const [cards, setCards] = useState<KnowledgeCard[]>([]);
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
  const [status, setStatus] = useState<string>("Ready");

  const selectedCard = useMemo(
    () => cards.find((card) => card.id === selectedCardId) ?? cards[0],
    [cards, selectedCardId]
  );

  async function refreshData() {
    const [nextCards, nextConversations] = await Promise.all([api.listCards(), api.listConversations()]);
    setCards(nextCards);
    setConversations(nextConversations);
    if (!selectedCardId && nextCards[0]) {
      setSelectedCardId(nextCards[0].id);
    }
  }

  useEffect(() => {
    refreshData().catch((error: unknown) => {
      setStatus(error instanceof Error ? error.message : "Unable to load CardMind data");
    });
  }, []);

  return (
    <div className="shell">
      <aside className="sidebar">
        <div className="brand">
          <BrainCircuit aria-hidden="true" />
          <div>
            <strong>CardMind</strong>
            <span>Local knowledge graph</span>
          </div>
        </div>
        <nav className="nav" aria-label="Primary navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={activeView === item.id ? "nav-button active" : "nav-button"}
                type="button"
                onClick={() => setActiveView(item.id)}
                title={item.label}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="status">{status}</div>
      </aside>

      <main className="main">
        {activeView === "home" && <HomeView cards={cards} conversations={conversations} />}
        {activeView === "import" && (
          <ImportView
            onDone={async (message) => {
              setStatus(message);
              await refreshData();
            }}
          />
        )}
        {activeView === "cards" && (
          <CardsView
            cards={cards}
            selectedCard={selectedCard}
            onSelect={(card) => setSelectedCardId(card.id)}
          />
        )}
        {activeView === "graph" && <GraphView fallbackCard={selectedCard} />}
      </main>
    </div>
  );
}

function HomeView({ cards, conversations }: { cards: KnowledgeCard[]; conversations: Conversation[] }) {
  return (
    <section className="view home-view">
      <div>
        <p className="eyebrow">CardMind</p>
        <h1>Turn AI conversations into connected knowledge cards.</h1>
        <p className="lede">
          Import a raw AI conversation, extract durable knowledge cards, and use those cards as the foundation for a
          local-first personal knowledge graph.
        </p>
      </div>
      <div className="metrics" aria-label="Workspace metrics">
        <div>
          <span>{conversations.length}</span>
          <small>Conversations</small>
        </div>
        <div>
          <span>{cards.length}</span>
          <small>Knowledge Cards</small>
        </div>
      </div>
    </section>
  );
}

function ImportView({ onDone }: { onDone: (message: string) => Promise<void> }) {
  const [rawContent, setRawContent] = useState("");
  const [conversation, setConversation] = useState<Conversation | null>(null);
  const [isBusy, setIsBusy] = useState(false);

  async function saveConversation() {
    setIsBusy(true);
    try {
      const created = await api.createConversation({ raw_content: rawContent, source_type: "manual" });
      setConversation(created);
      await onDone(`Saved conversation ${created.id}`);
    } finally {
      setIsBusy(false);
    }
  }

  async function extractCards() {
    if (!conversation) {
      return;
    }

    setIsBusy(true);
    try {
      const result = await api.extractConversation(conversation.id);
      await onDone(`Extracted ${result.cards.length} cards and ${result.relations.length} relations`);
    } finally {
      setIsBusy(false);
    }
  }

  return (
    <section className="view">
      <div className="section-head">
        <div>
          <p className="eyebrow">Import</p>
          <h2>Paste an AI conversation</h2>
        </div>
        <button className="primary-action" type="button" disabled={isBusy || rawContent.trim().length === 0} onClick={saveConversation}>
          <FilePlus2 aria-hidden="true" />
          Save
        </button>
      </div>
      <textarea
        className="conversation-input"
        value={rawContent}
        onChange={(event) => setRawContent(event.target.value)}
        placeholder="Paste a conversation about concepts, decisions, or learning notes..."
      />
      <div className="import-actions">
        <span>{conversation ? `Saved source: ${conversation.id}` : "No conversation saved yet"}</span>
        <button className="secondary-action" type="button" disabled={isBusy || !conversation} onClick={extractCards}>
          Extract Knowledge Cards
        </button>
      </div>
    </section>
  );
}

function CardsView({
  cards,
  selectedCard,
  onSelect
}: {
  cards: KnowledgeCard[];
  selectedCard?: KnowledgeCard;
  onSelect: (card: KnowledgeCard) => void;
}) {
  return (
    <section className="view cards-layout">
      <div className="card-list">
        <div className="section-head compact">
          <div>
            <p className="eyebrow">Knowledge Cards</p>
            <h2>{cards.length} cards</h2>
          </div>
        </div>
        {cards.length === 0 ? (
          <div className="empty-state">Import a conversation and run extraction to create cards.</div>
        ) : (
          cards.map((card) => (
            <button key={card.id} className="knowledge-card" type="button" onClick={() => onSelect(card)}>
              <span className="card-type">{card.type}</span>
              <strong>{card.title}</strong>
              <p>{card.summary}</p>
              <div className="tag-row">
                {card.tags.map((tag) => (
                  <span key={tag}>{tag}</span>
                ))}
              </div>
              <small>{card.mastery_status}</small>
            </button>
          ))
        )}
      </div>
      <CardDetail card={selectedCard} />
    </section>
  );
}

export function CardDetail({ card }: { card?: KnowledgeCard }) {
  if (!card) {
    return <aside className="detail-panel empty-state">Select a card to inspect its detail and source conversation.</aside>;
  }

  return (
    <aside className="detail-panel">
      <span className="card-type">{card.type}</span>
      <h2>{card.title}</h2>
      <p className="summary">{card.summary}</p>
      <p>{card.content}</p>
      <dl>
        <div>
          <dt>Mastery</dt>
          <dd>{card.mastery_status}</dd>
        </div>
        <div>
          <dt>Source conversation</dt>
          <dd>{card.source_conversation_id}</dd>
        </div>
      </dl>
    </aside>
  );
}
