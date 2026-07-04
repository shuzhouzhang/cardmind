import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
  useEdgesState,
  useNodesState
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useCallback, useEffect, useMemo } from "react";
import { CardDetail, relationLabels } from "./App";
import type { CardRelation, KnowledgeCard } from "./types";

interface CardNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  summary: string;
}

type CardNode = Node<CardNodeData>;

export function GraphView({
  cards,
  relations,
  selectedCard,
  onSelectCard,
  onImport,
  onSeedSample
}: {
  cards: KnowledgeCard[];
  relations: CardRelation[];
  selectedCard?: KnowledgeCard;
  onSelectCard: (card: KnowledgeCard) => void;
  onImport: () => void;
  onSeedSample: () => void;
}) {
  const graphNodes = useMemo(() => createGraphNodes(cards), [cards]);
  const graphEdges = useMemo(() => createGraphEdges(relations), [relations]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
  }, [graphNodes, graphEdges, setEdges, setNodes]);

  const onNodeClick: NodeMouseHandler<CardNode> = useCallback(
    (_event, node) => {
      const card = cards.find((item) => item.id === node.id);
      if (card) {
        onSelectCard(card);
      }
    },
    [cards, onSelectCard]
  );

  if (cards.length === 0) {
    return (
      <section className="view">
        <div className="empty-state rich-empty">
          <h2>图谱还没有节点</h2>
          <p>先导入一段 AI 对话生成知识卡片，或者加载示例数据直接查看图谱效果。</p>
          <div className="empty-actions">
            <button className="primary-action" type="button" onClick={onImport}>去导入</button>
            <button className="secondary-action" type="button" onClick={onSeedSample}>加载示例数据</button>
          </div>
        </div>
      </section>
    );
  }

  return (
    <section className="view graph-layout">
      <div className="graph-workspace">
        <div className="graph-toolbar">
          <div>
            <p className="eyebrow">图谱</p>
            <h2>{cards.length} 个节点，{relations.length} 条关系</h2>
          </div>
        </div>
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onNodeClick={onNodeClick}
          fitView
          minZoom={0.35}
          maxZoom={1.8}
          proOptions={{ hideAttribution: true }}
        >
          <Background color="#d5e0e3" gap={28} />
          <MiniMap pannable zoomable nodeColor="#0f766e" maskColor="rgba(16, 36, 39, 0.16)" />
          <Controls />
        </ReactFlow>
      </div>
      <CardDetail card={selectedCard ?? cards[0]} cards={cards} relations={relations} />
    </section>
  );
}

function createGraphNodes(cards: KnowledgeCard[]): CardNode[] {
  const radius = Math.max(150, cards.length * 34);
  return cards.map((card, index) => {
    const angle = (index / Math.max(cards.length, 1)) * Math.PI * 2;
    const orbit = radius + (index % 4) * 24;

    return {
      id: card.id,
      type: "default",
      position: {
        x: Math.cos(angle) * orbit,
        y: Math.sin(angle) * orbit
      },
      data: {
        label: card.title,
        type: card.type,
        summary: card.summary
      },
      className: "graph-node"
    };
  });
}

function createGraphEdges(relations: CardRelation[]): Edge[] {
  return relations.map((relation) => ({
    id: relation.id,
    source: relation.source_card_id,
    target: relation.target_card_id,
    label: relationLabels[relation.relation_type],
    type: "straight",
    animated: relation.confidence >= 0.9,
    className: "graph-edge",
    labelBgPadding: [7, 4],
    labelBgBorderRadius: 4,
    data: {
      reason: relation.reason,
      confidence: relation.confidence
    }
  }));
}
