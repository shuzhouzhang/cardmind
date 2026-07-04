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
import { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "./api";
import { CardDetail } from "./App";
import type { KnowledgeCard, KnowledgeGraph } from "./types";

interface CardNodeData extends Record<string, unknown> {
  label: string;
  type: string;
  summary: string;
  tags: string[];
  mastery_status: KnowledgeCard["mastery_status"];
  source_conversation_id: string;
}

type CardNode = Node<CardNodeData>;

export function GraphView({ fallbackCard }: { fallbackCard?: KnowledgeCard }) {
  const [graph, setGraph] = useState<KnowledgeGraph | null>(null);
  const [selectedNode, setSelectedNode] = useState<CardNode | null>(null);
  const [status, setStatus] = useState("Loading graph");

  const graphNodes = useMemo(() => createGraphNodes(graph), [graph]);
  const graphEdges = useMemo(() => createGraphEdges(graph), [graph]);
  const [nodes, setNodes, onNodesChange] = useNodesState<CardNode>(graphNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(graphEdges);

  useEffect(() => {
    api
      .getGraph()
      .then((nextGraph) => {
        setGraph(nextGraph);
        setStatus(`${nextGraph.nodes.length} nodes, ${nextGraph.edges.length} edges`);
      })
      .catch((error: unknown) => {
        setStatus(error instanceof Error ? error.message : "Unable to load graph");
      });
  }, []);

  useEffect(() => {
    setNodes(graphNodes);
    setEdges(graphEdges);
    setSelectedNode(graphNodes[0] ?? null);
  }, [graphNodes, graphEdges, setEdges, setNodes]);

  const onNodeClick: NodeMouseHandler<CardNode> = useCallback((_event, node) => {
    setSelectedNode(node);
  }, []);

  const selectedCard = selectedNode ? nodeToCard(selectedNode) : fallbackCard;

  return (
    <section className="view graph-layout">
      <div className="graph-workspace">
        <div className="graph-toolbar">
          <div>
            <p className="eyebrow">Knowledge Graph</p>
            <h2>{status}</h2>
          </div>
        </div>
        {nodes.length === 0 ? (
          <div className="empty-state graph-empty">Import a conversation and extract cards to populate the graph.</div>
        ) : (
          <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeClick={onNodeClick}
            fitView
            minZoom={0.35}
            maxZoom={1.6}
            proOptions={{ hideAttribution: true }}
          >
            <Background color="#d5e0e3" gap={24} />
            <MiniMap pannable zoomable nodeColor="#0f766e" maskColor="rgba(16, 36, 39, 0.12)" />
            <Controls />
          </ReactFlow>
        )}
      </div>
      <CardDetail card={selectedCard} />
    </section>
  );
}

function createGraphNodes(graph: KnowledgeGraph | null): CardNode[] {
  if (!graph) {
    return [];
  }

  const radius = Math.max(180, graph.nodes.length * 42);
  return graph.nodes.map((node, index) => {
    const angle = (index / Math.max(graph.nodes.length, 1)) * Math.PI * 2;
    const orbit = radius + (index % 3) * 34;

    return {
      id: node.id,
      type: "default",
      position: {
        x: Math.cos(angle) * orbit,
        y: Math.sin(angle) * orbit
      },
      data: {
        label: node.label,
        type: node.type,
        summary: node.summary,
        tags: node.tags,
        mastery_status: node.mastery_status,
        source_conversation_id: node.source_conversation_id
      },
      className: "graph-node"
    };
  });
}

function createGraphEdges(graph: KnowledgeGraph | null): Edge[] {
  if (!graph) {
    return [];
  }

  return graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    type: "smoothstep",
    animated: edge.confidence >= 0.75,
    className: "graph-edge",
    labelBgPadding: [6, 3],
    labelBgBorderRadius: 4,
    data: {
      reason: edge.reason,
      confidence: edge.confidence
    }
  }));
}

function nodeToCard(node: CardNode): KnowledgeCard {
  return {
    id: node.id,
    title: node.data.label,
    summary: node.data.summary,
    content: node.data.summary,
    type: node.data.type,
    tags: node.data.tags,
    mastery_status: node.data.mastery_status,
    source_conversation_id: node.data.source_conversation_id,
    created_at: "",
    updated_at: ""
  };
}
