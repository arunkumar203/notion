import React, { useCallback, useState, useEffect, useMemo } from 'react';
import { Node, mergeAttributes, CommandProps } from '@tiptap/core';
import { ReactNodeViewRenderer, NodeViewWrapper, NodeViewProps } from '@tiptap/react';
import ReactFlow, {
    Node as FlowNode,
    Edge,
    Controls,
    ControlButton,
    Background,
    useNodesState,
    useEdgesState,
    MarkerType,
    Handle,
    Position,
    Connection,
    addEdge,
    useReactFlow,
    ReactFlowProvider,
    NodeProps,
    EdgeProps,
    getBezierPath,
    BaseEdge,
    ReactFlowInstance
} from 'reactflow';
import 'reactflow/dist/style.css';
import dagre from 'dagre';

/* ========= Types ========= */

interface MindMapNode {
    id: string;
    label: string;
    children?: MindMapNode[];
    isExpanded?: boolean;
}

interface MindMapAttrs {
    root: MindMapNode;
}

/* ========= Constants ========= */

const DEFAULT_ROOT: MindMapNode = {
    id: 'root',
    label: 'Central Topic',
    isExpanded: true,
    children: [
        { id: 'c1', label: 'Main Idea 1', isExpanded: true, children: [] },
        { id: 'c2', label: 'Main Idea 2', isExpanded: true, children: [] },
        { id: 'c3', label: 'Main Idea 3', isExpanded: true, children: [] },
    ]
};

const NODE_WIDTH = 180;
const NODE_HEIGHT = 50;

// Colors for different depths (NotebookLM style)
const DEPTH_COLORS = [
    '#eff6ff', // depth 0 - root (blue-50)
    '#ecfdf5', // depth 1 (emerald-50)
    '#faf5ff', // depth 2 (purple-50)
    '#fffbeb', // depth 3 (amber-50)
    '#fff1f2', // depth 4+ (rose-50)
];

const BORDER_COLORS = [
    '#2563eb', // depth 0 - root (blue-600)
    '#10b981', // depth 1 (emerald-500)
    '#a855f7', // depth 2 (purple-500)
    '#f59e0b', // depth 3 (amber-500)
    '#f43f5e', // depth 4+ (rose-500)
];

/* ========= Layout Helper ========= */

const getLayoutedElements = (root: MindMapNode) => {
    const dagreGraph = new dagre.graphlib.Graph();
    dagreGraph.setGraph({ rankdir: 'LR' }); // Left to Right layout

    dagreGraph.setDefaultEdgeLabel(() => ({}));

    const flowNodes: FlowNode[] = [];
    const flowEdges: Edge[] = [];

    // Traverse and build graph
    const traverse = (node: MindMapNode, depth: number = 0, parentId?: string) => {
        // Styling based on depth
        const bgColor = DEPTH_COLORS[Math.min(depth, DEPTH_COLORS.length - 1)];
        const borderColor = BORDER_COLORS[Math.min(depth, BORDER_COLORS.length - 1)];

        flowNodes.push({
            id: node.id,
            data: {
                label: node.label,
                depth,
                isExpanded: node.isExpanded !== false, // default true
                hasChildren: (node.children && node.children.length > 0),
                originalNode: node // keep ref to update
            },
            type: 'mindMapNode',
            position: { x: 0, y: 0 }, // calculated by dagre
            style: {
                background: bgColor,
                border: `2px solid ${borderColor}`,
                borderRadius: '8px',
                width: NODE_WIDTH,
            }
        });

        if (parentId) {
            flowEdges.push({
                id: `${parentId}-${node.id}`,
                source: parentId,
                target: node.id,
                type: 'default',
                animated: false,
                style: { stroke: '#94a3b8', strokeWidth: 2, strokeDasharray: '5 5' }
            });
        }

        if (node.isExpanded !== false && node.children) {
            node.children.forEach(child => traverse(child, depth + 1, node.id));
        }
    };

    traverse(root);

    // Layout with Dagre
    flowNodes.forEach((node) => {
        dagreGraph.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
    });

    flowEdges.forEach((edge) => {
        dagreGraph.setEdge(edge.source, edge.target);
    });

    dagre.layout(dagreGraph);

    const layoutedNodes = flowNodes.map((node) => {
        const nodeWithPosition = dagreGraph.node(node.id);
        node.targetPosition = Position.Left;
        node.sourcePosition = Position.Right;

        // Shift x/y slightly for proper centering
        node.position = {
            x: nodeWithPosition.x - NODE_WIDTH / 2,
            y: nodeWithPosition.y - NODE_HEIGHT / 2,
        };

        return node;
    });

    return { nodes: layoutedNodes, edges: flowEdges };
};


/* ========= Custom Node Component ========= */

const CustomNode: React.FC<NodeProps> = ({ data, id, selected }) => {
    const { onNodeChange } = useReactFlowContext(); // Custom hook to bubble events up

    const [isEditing, setIsEditing] = useState(false);
    const [label, setLabel] = useState(data.label);

    const handleExpandToggle = (e: React.MouseEvent) => {
        e.stopPropagation();
        // Prevent selection of the node itself when toggling expand
        e.preventDefault();
        onNodeChange(id, 'toggle');
    };

    const handleAddChild = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onNodeChange(id, 'add');
    };

    const handleDelete = (e: React.MouseEvent) => {
        e.stopPropagation();
        e.preventDefault();
        onNodeChange(id, 'delete');
    };

    const onDoubleClick = () => {
        setIsEditing(true);
    };

    const onBlur = () => {
        setIsEditing(false);
        if (label !== data.label) {
            onNodeChange(id, 'rename', label);
        }
    };

    return (
        <div className={`mindmap-node ${selected ? 'selected' : ''}`} style={{ padding: '8px 12px', textAlign: 'center', position: 'relative' }}>
            <Handle type="target" position={Position.Left} style={{ opacity: 0 }} />

            {isEditing ? (
                <input
                    value={label}
                    onChange={(e) => setLabel(e.target.value)}
                    onBlur={onBlur}
                    onKeyDown={(e) => {
                        if (e.key === 'Enter') onBlur();
                    }}
                    autoFocus
                    className="nodrag" // allow text selection
                    style={{ width: '100%', border: 'none', outline: 'none', background: 'transparent', textAlign: 'center' }}
                />
            ) : (
                <div onDoubleClick={onDoubleClick} style={{ cursor: 'text', fontWeight: 500, color: '#1e293b' }}>
                    {data.label}
                </div>
            )}

            {/* Buttons container - appears on hover or selection */}
            <div className="node-actions nodrag" style={{
                position: 'absolute',
                top: -24,
                right: 0,
                display: 'flex',
                gap: 4,
                background: 'white',
                border: '1px solid #e2e8f0',
                borderRadius: 4,
                padding: 2,
                opacity: selected ? 1 : 0, // styled to show on hover via css too
                transition: 'opacity 0.2s',
            }}>
                <button onClick={handleAddChild} title="Add Child" style={{ cursor: 'pointer', color: '#10b981' }}>+</button>
                <button onClick={handleDelete} title="Delete" style={{ cursor: 'pointer', color: '#ef4444' }}>×</button>
            </div>

            <style>{`
        .mindmap-node:hover .node-actions,
        .mindmap-node.selected .node-actions {
          opacity: 1 !important;
          pointer-events: auto;
        }
      `}</style>

            {data.hasChildren && (
                <div
                    onClick={handleExpandToggle}
                    className="nodrag"
                    style={{
                        position: 'absolute',
                        right: -10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        width: 16,
                        height: 16,
                        background: '#fff',
                        border: '1px solid #9ca3af', // gray-400
                        borderRadius: '50%',
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 10,
                        lineHeight: 1,
                        zIndex: 10,
                        color: '#6b7280' // gray-500
                    }}
                >
                    {data.isExpanded ? '<' : '>'}
                </div>
            )}

            <Handle type="source" position={Position.Right} style={{ opacity: 0 }} />
        </div>
    );
};

// Context for custom node communication
const NodeContext = React.createContext<{ onNodeChange: (id: string, type: 'toggle' | 'add' | 'rename' | 'delete' | 'import', value?: any) => void }>({ onNodeChange: () => { } });
const useReactFlowContext = () => React.useContext(NodeContext);

const nodeTypes = {
    mindMapNode: CustomNode,
};


/* ========= Node View ========= */

const MindMapView: React.FC<NodeViewProps> = ({ node, updateAttributes }) => {
    const rootData = (node.attrs.root || DEFAULT_ROOT) as MindMapNode;

    const { nodes: initialNodes, edges: initialEdges } = useMemo(() => getLayoutedElements(rootData), [rootData]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    // Sync internal state when prop changes
    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges]);


    // Update logic: This function updates the nested JSON structure. 
    // Because it's a tree, we need to find the node and mutate it (immutably).
    const handleNodeAction = useCallback((id: string, type: 'toggle' | 'add' | 'rename' | 'delete' | 'import', value?: any) => {

        if (type === 'import') {
            try {
                const parsed = JSON.parse(value);

                // Helper to normalize JSON input
                const normalize = (n: any, i = 0): MindMapNode => {
                    const id = n.id || `acc-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
                    const label = n.label || n.title || 'Untitled'; // Handle 'title' from user example
                    let children: MindMapNode[] = [];
                    if (n.children && Array.isArray(n.children)) {
                        children = n.children.map((c: any) => normalize(c, i + 1));
                    }
                    return {
                        id,
                        label,
                        children,
                        isExpanded: true // default to expanded on import
                    };
                };

                const newRoot = normalize(parsed);
                if (newRoot && newRoot.label) {
                    updateAttributes({ root: newRoot });
                } else {
                    alert('Invalid JSON structure. Needs at least a label or title.');
                }

            } catch (e) {
                alert('Invalid JSON format.');
                console.error(e);
            }
            return;
        }

        // Deep clone to avoid direct mutation issues
        const newRoot = JSON.parse(JSON.stringify(rootData));

        const findAndExecute = (current: MindMapNode, parent?: MindMapNode): boolean => {
            if (current.id === id) {
                if (type === 'toggle') {
                    current.isExpanded = !current.isExpanded;
                } else if (type === 'add') {
                    current.isExpanded = true;
                    current.children = current.children || [];
                    current.children.push({
                        id: `n-${Date.now()}`,
                        label: 'New Idea',
                        isExpanded: true,
                        children: []
                    });
                } else if (type === 'rename') {
                    current.label = value;
                } else if (type === 'delete') {
                    if (parent && parent.children) {
                        parent.children = parent.children.filter(n => n.id !== id);
                    }
                }
                return true;
            }
            if (current.children) {
                for (const child of current.children) {
                    if (findAndExecute(child, current)) return true;
                }
            }
            return false;
        };

        if (findAndExecute(newRoot)) {
            updateAttributes({ root: newRoot });
        }

    }, [rootData, updateAttributes]);

    const [rfInstance, setRfInstance] = useState<ReactFlowInstance | null>(null);
    const wrapperRef = React.useRef<HTMLDivElement>(null);

    const toggleFullscreen = useCallback(() => {
        if (!document.fullscreenElement) {
            wrapperRef.current?.requestFullscreen().catch((err) => {
                console.error(`Error attempting to enable fullscreen: ${err.message} (${err.name})`);
            });
        } else {
            document.exitFullscreen();
        }
    }, []);

    // Auto-fit view on resize (window resize or print layout change)
    useEffect(() => {
        if (!rfInstance || !wrapperRef.current) return;

        const observer = new ResizeObserver(() => {
            requestAnimationFrame(() => {
                rfInstance.fitView({ duration: 0, padding: 0.1 });
            });
        });

        observer.observe(wrapperRef.current);

        return () => observer.disconnect();
    }, [rfInstance]);

    // Auto-fit view when printing to prevent clipping/misalignment
    useEffect(() => {
        const handlePrint = () => {
            if (rfInstance) {
                // Determine bounding box or just basic fit
                rfInstance.fitView({ duration: 0, padding: 0.1 });
            }
        };

        window.addEventListener('beforeprint', handlePrint);
        return () => window.removeEventListener('beforeprint', handlePrint);
    }, [rfInstance]);

    const handleImportClick = () => {
        const json = prompt('Paste Mind Map JSON data here:');
        if (json) {
            handleNodeAction('root', 'import', json);
        }
    }

    return (
        <NodeViewWrapper 
            ref={wrapperRef} 
            className="mindmap-wrapper" 
            data-mindmap={JSON.stringify(rootData)}
            style={{ height: 500, border: '1px solid #e2e8f0', borderRadius: 8, background: '#f8fafc', position: 'relative' }}
        >
            <NodeContext.Provider value={{ onNodeChange: handleNodeAction }}>

                {/* Custom Control Panel (Top-Left) - Only Import JSON now */}
                <div
                    onMouseDown={(e) => e.stopPropagation()}
                    style={{ position: 'absolute', top: 10, left: 10, zIndex: 10, background: 'white', padding: 4, borderRadius: 4, border: '1px solid #e2e8f0', display: 'flex', gap: 4 }}
                >
                    <button onClick={handleImportClick} style={{ fontSize: '12px', padding: '2px 6px', cursor: 'pointer', background: '#f3f4f6', borderRadius: 2 }}>Import JSON</button>
                </div>

                <ReactFlow
                    nodes={nodes}
                    edges={edges}
                    onNodesChange={onNodesChange}
                    onEdgesChange={onEdgesChange}
                    nodeTypes={nodeTypes}
                    onInit={setRfInstance}
                    fitView
                    attributionPosition="bottom-right"
                >
                    {/* Rebuilt Controls to insert Fullscreen button at position 3 */}
                    <div onMouseDown={(e) => e.stopPropagation()}>
                        <Controls showZoom={false} showFitView={false} showInteractive={false}>
                            <ControlButton onClick={() => rfInstance?.zoomIn()} title="Zoom In">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </ControlButton>
                            <ControlButton onClick={() => rfInstance?.zoomOut()} title="Zoom Out">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            </ControlButton>
                            <ControlButton onClick={toggleFullscreen} title="Fullscreen">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M8 3H5a2 2 0 0 0-2 2v3m18 0V5a2 2 0 0 0-2-2h-3m0 18h3a2 2 0 0 0 2-2v-3M3 16v3a2 2 0 0 0 2 2h3"></path></svg>
                            </ControlButton>
                            <ControlButton onClick={() => rfInstance?.fitView()} title="Fit View">
                                <svg viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round"><path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"></path></svg>
                            </ControlButton>
                        </Controls>
                    </div>

                    <Background color="#cbd5e1" gap={16} />
                    <style>{`
                        /* NotebookLM-like smooth transitions for layout changes */
                        .react-flow__node {
                            transition: transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s ease;
                        }
                        .react-flow__edge path {
                            transition: d 0.6s cubic-bezier(0.16, 1, 0.3, 1);
                        }
                        
                        /* Print Styles */
                        @media print {
                             .mindmap-wrapper {
                                height: 600px !important; /* Reasonable fixed height */
                                width: 100% !important;
                                page-break-inside: avoid;
                                break-inside: avoid;
                                border: none !important; /* Hide border to avoid looking clipped */
                                position: relative !important;
                                overflow: hidden !important; /* Prevent bleeding over text */
                            }
                            .react-flow {
                                height: 100% !important;
                                width: 100% !important;
                                overflow: hidden !important;
                            }
                            .react-flow__viewport {
                                /* Ensure we don't have crazy transforms if fitView fails */
                                transform-origin: center center;
                            }
                            .react-flow__renderer {
                                z-index: 0 !important;
                            }
                            /* Disable transitions for instant snap */
                            .react-flow__node, .react-flow__edge path {
                                transition: none !important;
                            }

                            /* Ensure colors print exact */
                            .mindmap-node {
                                -webkit-print-color-adjust: exact !important;
                                print-color-adjust: exact !important;
                                border: 2px solid #ccc !important; /* Fallback */
                            }
                            /* Hide controls in print */
                            .react-flow__controls, 
                            .react-flow__attribution,
                            button {
                                display: none !important;
                            }
                        }
                    `}</style>
                </ReactFlow>
            </NodeContext.Provider>
        </NodeViewWrapper>
    );
};


/* ========= TipTap Extension ========= */

export const MindMap = Node.create<MindMapAttrs>({
    name: 'mindMap',

    group: 'block',

    atom: true, // It's a single block content

    addAttributes() {
        return {
            root: {
                default: DEFAULT_ROOT,
                parseHTML: (el) => {
                    const data = el.getAttribute('data-mindmap');
                    return data ? JSON.parse(data) : DEFAULT_ROOT;
                },
                renderHTML: (attrs) => {
                    return {
                        'data-mindmap': JSON.stringify(attrs.root),
                    };
                },
            },
        };
    },

    parseHTML() {
        return [
            {
                tag: 'div[data-type="mindmap"]',
            },
        ];
    },

    renderHTML({ HTMLAttributes }) {
        return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'mindmap' })];
    },

    addNodeView() {
        return ReactNodeViewRenderer(MindMapView);
    },

    addCommands() {
        return {
            insertMindMap: () => ({ commands }: CommandProps) => {
                return commands.insertContent({
                    type: this.name,
                    attrs: { root: DEFAULT_ROOT }
                });
            },
        };
    },
});

declare module '@tiptap/core' {
    interface Commands<ReturnType> {
        mindMap: {
            insertMindMap: () => ReturnType;
        };
    }
}

export default MindMap;
