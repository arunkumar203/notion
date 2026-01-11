import React, { useEffect, useMemo, useState, useRef } from 'react';
import { Node, mergeAttributes, type CommandProps } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';

/* ========= Types ========= */

type ColumnType = 'text' | 'select' | 'number' | 'progress' | 'date' | 'checkbox' | 'createdTime';

interface SelectOption {
  id: string;
  label: string;
  color: string;
}

interface ColumnDefinition {
  id: string;
  name: string;
  type: ColumnType;
  options?: SelectOption[];
}

type CellValue = string | number | boolean;

interface TableRow {
  id: string;
  values: Record<string, CellValue>;
  createdAt: string;
  updatedAt?: string;
}

interface TableBoardAttrs {
  columns: ColumnDefinition[];
  columnCount: number;
  rowCount: number;
  rows: TableRow[];
  layout?: 'horizontal' | 'vertical';
  fitContainer?: boolean;
}

/* ========= Constants ========= */

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'text', label: 'Text', icon: 'T' },
  { value: 'select', label: 'Select', icon: '○' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'progress', label: 'Progress', icon: '▭' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'createdTime', label: 'Created Time', icon: '🕐' },
];

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b'
];

const DEFAULT_COLUMNS: ColumnDefinition[] = [
  { id: 'col-1', name: 'Task', type: 'text' },
  {
    id: 'col-2',
    name: 'Status',
    type: 'select',
    options: [
      { id: 'todo', label: 'To Do', color: '#64748b' },
      { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
      { id: 'done', label: 'Done', color: '#10b981' },
    ]
  },
  { id: 'col-3', name: 'Progress', type: 'progress' },
];

const DEFAULT_ROWS = 0;

/* ========= Utils ========= */

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const createDefaultValue = (type: ColumnType, options?: SelectOption[]): CellValue => {
  switch (type) {
    case 'select': return options?.[0]?.id ?? '';
    case 'number': return 0;
    case 'progress': return 50;
    case 'checkbox': return false;
    case 'date': return new Date().toISOString().slice(0, 10);
    case 'createdTime': return new Date().toISOString();
    default: return '';
  }
};

const createDefaultRows = (columns: ColumnDefinition[], count: number): TableRow[] =>
  Array.from({ length: count }).map(() => ({
    id: uid('row'),
    createdAt: new Date().toISOString(),
    updatedAt: undefined,
    values: columns.reduce<Record<string, CellValue>>((acc, col) => {
      acc[col.id] = createDefaultValue(col.type, col.options);
      return acc;
    }, {}),
  }));

const formatDate = (iso: string) => {
  const d = new Date(iso);
  return d.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
};

/* ========= Tag Manager Modal ========= */

const TagManager: React.FC<{
  options: SelectOption[];
  onUpdate: (opts: SelectOption[]) => void;
  onClose: () => void;
}> = ({ options, onUpdate, onClose }) => {
  const [tags, setTags] = useState(options);
  const [newTag, setNewTag] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');

  const addTag = () => {
    if (!newTag.trim()) return;
    const tag: SelectOption = {
      id: uid('tag'),
      label: newTag.trim(),
      color: DEFAULT_COLORS[tags.length % DEFAULT_COLORS.length]
    };
    setTags([...tags, tag]);
    setNewTag('');
  };

  const deleteTag = (id: string) => {
    setTags(tags.filter(t => t.id !== id));
  };

  const updateTag = (id: string, label: string, color: string) => {
    setTags(tags.map(t => t.id === id ? { ...t, label, color } : t));
  };

  const handleSave = () => {
    onUpdate(tags);
    onClose();
  };

  return (
    <div className="kt__modal-backdrop" onClick={onClose}>
      <div className="kt__modal" onClick={e => e.stopPropagation()}>
        <div className="kt__modal-header">
          <h3>Manage Tags</h3>
          <button className="kt__modal-close" onClick={onClose}>×</button>
        </div>

        <div className="kt__modal-body">
          <div className="kt__tag-list">
            {tags.map(tag => (
              <div key={tag.id} className="kt__tag-item">
                {editingId === tag.id ? (
                  <>
                    <input
                      className="kt__tag-edit-input"
                      value={editValue}
                      onChange={e => setEditValue(e.target.value)}
                      onBlur={() => {
                        updateTag(tag.id, editValue, tag.color);
                        setEditingId(null);
                      }}
                      onKeyDown={e => {
                        if (e.key === 'Enter') {
                          updateTag(tag.id, editValue, tag.color);
                          setEditingId(null);
                        }
                      }}
                      autoFocus
                    />
                  </>
                ) : (
                  <>
                    <span
                      className="kt__tag-color"
                      style={{ backgroundColor: tag.color }}
                    />
                    <span
                      className="kt__tag-label"
                      onClick={() => {
                        setEditingId(tag.id);
                        setEditValue(tag.label);
                      }}
                    >
                      {tag.label}
                    </span>
                  </>
                )}
                <input
                  type="color"
                  value={tag.color}
                  onChange={e => updateTag(tag.id, tag.label, e.target.value)}
                  className="kt__color-picker"
                  title="Change color"
                />
                <button
                  className="kt__tag-delete"
                  onClick={() => deleteTag(tag.id)}
                  title="Delete tag"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div className="kt__tag-add">
            <input
              className="kt__tag-input"
              placeholder="New tag name..."
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
            />
            <button className="kt__btn-primary" onClick={addTag}>Add Tag</button>
          </div>
        </div>

        <div className="kt__modal-footer">
          <button className="kt__btn" onClick={onClose}>Cancel</button>
          <button className="kt__btn-primary" onClick={handleSave}>Save</button>
        </div>
      </div>
    </div>
  );
};

/* ========= Column Type Selector ========= */

const ColumnTypeSelector: React.FC<{
  value: ColumnType;
  onChange: (type: ColumnType) => void;
  onClose: () => void;
}> = ({ value, onChange, onClose }) => {
  return (
    <div className="kt__dropdown">
      {COLUMN_TYPE_OPTIONS.map(opt => (
        <button
          key={opt.value}
          className={`kt__dropdown-item ${value === opt.value ? 'kt__dropdown-item--active' : ''}`}
          onClick={() => {
            onChange(opt.value);
            onClose();
          }}
        >
          <span className="kt__dropdown-icon">{opt.icon}</span>
          <span>{opt.label}</span>
          {value === opt.value && <span className="kt__check">✓</span>}
        </button>
      ))}
    </div>
  );
};

/* ========= Header Cell ========= */

const HeaderCell: React.FC<{
  col: ColumnDefinition;
  index: number;
  editable: boolean;
  onName: (i: number, v: string) => void;
  onType: (i: number, v: ColumnType) => void;
  onManageTags: (i: number) => void;
  onDelete: (i: number) => void;
  onDragStart: (i: number) => void;
  onDragOver: (i: number) => void;
  onDrop: (i: number) => void;
}> = ({ col, index, editable, onName, onType, onManageTags, onDelete, onDragStart, onDragOver, onDrop }) => {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showActions, setShowActions] = useState(false);

  const typeInfo = COLUMN_TYPE_OPTIONS.find(o => o.value === col.type);

  return (
    <th
      className="kt__th"
      draggable={editable}
      onDragStart={() => onDragStart(index)}
      onDragOver={e => { e.preventDefault(); onDragOver(index); }}
      onDrop={() => onDrop(index)}
      onMouseEnter={() => setShowActions(true)}
      onMouseLeave={() => setShowActions(false)}
    >
      <div className="kt__th-inner">
        <div className="kt__th-top">
          {editable && <div className="kt__drag-handle" title="Drag to reorder">⋮⋮</div>}
          <input
            className="kt__th-name"
            value={col.name}
            onChange={(e) => onName(index, e.target.value)}
            disabled={!editable}
            placeholder={`Column ${index + 1}`}
          />
        </div>

        <div className="kt__th-bottom">
          <button
            className="kt__type-btn"
            onClick={() => editable && setShowTypeMenu(!showTypeMenu)}
            disabled={!editable}
            title="Column type"
          >
            <span className="kt__type-icon">{typeInfo?.icon}</span>
            <span className="kt__type-label">{typeInfo?.label}</span>
          </button>

          {col.type === 'select' && editable && (
            <button
              className="kt__manage-tags-btn"
              onClick={() => onManageTags(index)}
              title="Manage tags"
            >
              ⚙
            </button>
          )}

          {showTypeMenu && (
            <div className="kt__type-menu">
              <ColumnTypeSelector
                value={col.type}
                onChange={(type) => onType(index, type)}
                onClose={() => setShowTypeMenu(false)}
              />
            </div>
          )}
        </div>

        {editable && showActions && (
          <button
            className="kt__col-delete"
            onClick={() => onDelete(index)}
            title="Delete column"
          >
            🗑
          </button>
        )}
      </div>
    </th>
  );
};

/* ========= Node View ========= */

const TableBoardView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, getPos }) => {
  const attrs = node.attrs as TableBoardAttrs;
  const columns = attrs.columns?.length ? attrs.columns : DEFAULT_COLUMNS;
  const rows = attrs.rows?.length ? attrs.rows : [];

  // Force re-render when editor editable state changes
  const [, forceUpdate] = useState({});
  const editable = editor.isEditable;

  useEffect(() => {
    const handleUpdate = () => {
      forceUpdate({});
    };

    editor.on('update', handleUpdate);
    editor.on('transaction', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [managingTags, setManagingTags] = useState<number | null>(null);
  const [draggedCol, setDraggedCol] = useState<number | null>(null);
  const [draggedRow, setDraggedRow] = useState<number | null>(null);
  const [showViewMenu, setShowViewMenu] = useState(false);

  const [isHeaderAreaHovered, setIsHeaderAreaHovered] = useState(false);
  const [showAddRowButton, setShowAddRowButton] = useState(false);

  const headerRef = useRef<HTMLTableSectionElement>(null);
  const addColumnButtonRef = useRef<HTMLButtonElement>(null); // For potential future more granular hover
  const lastRowRef = useRef<HTMLTableRowElement>(null);
  const addRowButtonRef = useRef<HTMLButtonElement>(null);
  const draggingRef = useRef(false);

  // init
  useEffect(() => {
    if (!editable) return;
    const needsCols = !attrs.columns?.length;
    const needsRows = !rows.length;
    if (needsCols || needsRows) {
      const baseCols = needsCols ? DEFAULT_COLUMNS : columns;
      const nextRows = createDefaultRows(baseCols, DEFAULT_ROWS);
      // Use setTimeout instead of queueMicrotask to avoid flushSync issues
      setTimeout(() => {
        updateAttributes({
          columns: baseCols,
          columnCount: baseCols.length,
          rowCount: nextRows.length,
          rows: nextRows,
        });
      }, 0);
    }
  }, [editable, attrs.columns?.length, rows.length]);

  const effectiveRows = rows.length ? rows : createDefaultRows(columns, DEFAULT_ROWS);

  // Handle hover for both last row and add button to keep button visible
  const handleLastRowMouseEnter = () => {
    setShowAddRowButton(true);
  };
  const handleLastRowMouseLeave = () => {
    setTimeout(() => {
      // Only hide if neither the row nor the button is being hovered
      if (!lastRowRef.current?.matches(':hover') && !addRowButtonRef.current?.matches(':hover')) {
        setShowAddRowButton(false);
      }
    }, 10);
  };
  const handleAddRowButtonMouseEnter = () => {
    setShowAddRowButton(true);
  };
  const handleAddRowButtonMouseLeave = () => {
    setTimeout(() => {
      // Only hide if neither the row nor the button is being hovered
      if (!lastRowRef.current?.matches(':hover') && !addRowButtonRef.current?.matches(':hover')) {
        setShowAddRowButton(false);
      }
    }, 10);
  };

  /* ---- column ops ---- */

  const renameCol = (i: number, name: string) => {
    if (!editable) return;
    const next = [...columns];
    next[i] = { ...next[i], name };
    updateAttributes({ columns: next });
  };

  const setType = (i: number, type: ColumnType) => {
    if (!editable) return;
    const next = [...columns];
    const colId = next[i].id;

    // Preserve existing options if changing from select to select, otherwise set appropriate options
    let newOptions = next[i].options;
    if (type === 'select' && (!next[i].options || next[i].options.length === 0)) {
      // Only create default options if there were none before
      newOptions = [
        { id: uid('opt'), label: 'Option 1', color: DEFAULT_COLORS[0] },
        { id: uid('opt'), label: 'Option 2', color: DEFAULT_COLORS[1] },
      ];
    } else if (type !== 'select') {
      // Clear options if changing to non-select type
      newOptions = undefined;
    }

    next[i] = { ...next[i], type, options: newOptions };
    const updRows = effectiveRows.map(r => ({
      ...r,
      values: { ...r.values, [colId]: createDefaultValue(type, newOptions) },
    }));
    updateAttributes({ columns: next, rows: updRows });
  };

  const updateColumnOptions = (i: number, options: SelectOption[]) => {
    if (!editable) return;
    const next = [...columns];
    next[i] = { ...next[i], options };
    updateAttributes({ columns: next });
  };

  const insertColumnAt = (index: number) => {
    if (!editable) return;
    const id = uid('col');
    const newCol: ColumnDefinition = { id, name: 'New column', type: 'text' };
    const nextCols = [...columns.slice(0, index), newCol, ...columns.slice(index)];
    const updRows = effectiveRows.map(r => ({
      ...r,
      values: { ...r.values, [id]: createDefaultValue('text') },
    }));
    updateAttributes({ columns: nextCols, columnCount: nextCols.length, rows: updRows });
  };

  const deleteColumnAt = (index: number) => {
    if (!editable || columns.length <= 1) return;
    const id = columns[index].id;
    const nextCols = columns.filter((_, i) => i !== index);
    const updRows = effectiveRows.map(r => {
      const { [id]: _, ...rest } = r.values;
      return { ...r, values: rest };
    });
    updateAttributes({ columns: nextCols, columnCount: nextCols.length, rows: updRows });
  };

  const reorderColumn = (from: number, to: number) => {
    if (from === to) return;
    const next = [...columns];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateAttributes({ columns: next });
  };

  /* ---- row ops ---- */

  const insertRowAt = (index: number) => {
    if (!editable) return;
    const newRow: TableRow = {
      id: uid('row'),
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      values: columns.reduce<Record<string, CellValue>>((acc, col) => {
        acc[col.id] = createDefaultValue(col.type, col.options);
        return acc;
      }, {}),
    };
    const nextRows = [...effectiveRows.slice(0, index), newRow, ...effectiveRows.slice(index)];
    updateAttributes({ rowCount: nextRows.length, rows: nextRows });
  };

  const deleteRowAt = (index: number) => {
    if (!editable || effectiveRows.length <= 1) return;
    const nextRows = effectiveRows.filter((_, i) => i !== index);
    updateAttributes({ rowCount: nextRows.length, rows: nextRows });
  };

  const reorderRow = (from: number, to: number) => {
    if (from === to) return;
    const next = [...effectiveRows];
    const [moved] = next.splice(from, 1);
    next.splice(to, 0, moved);
    updateAttributes({ rows: next });
  };

  /* ---- cell edit ---- */

  const setCell = (rowId: string, colId: string, value: CellValue) => {
    if (!editable) return;
    const next = effectiveRows.map(r =>
      r.id === rowId ? { ...r, values: { ...r.values, [colId]: value }, updatedAt: new Date().toISOString() } : r
    );
    updateAttributes({ rows: next });
  };

  /* ---- render ---- */

  // Determine if we can render Kanban (group by first select column)
  const groupColIndex = useMemo(() => columns.findIndex(c => c.type === 'select'), [columns]);
  const groupCol = groupColIndex >= 0 ? columns[groupColIndex] : null;

  const groupOptions = useMemo(() => {
    if (!groupCol) return [] as SelectOption[];
    return groupCol.options ?? [];
  }, [groupCol]);

  const groups = useMemo(() => {
    if (!groupCol) return {} as Record<string, TableRow[]>;
    const map: Record<string, TableRow[]> = {};
    const validIds = new Set(groupOptions.map(o => o.id));
    for (const row of effectiveRows) {
      const val = String(row.values[groupCol.id] ?? '');
      const key = validIds.has(val) ? val : '__none';
      (map[key] ||= []).push(row);
    }
    // Ensure all columns exist in map
    for (const opt of groupOptions) {
      map[opt.id] ||= [];
    }
    // Also ensure the none bucket exists if needed
    if (Object.prototype.hasOwnProperty.call(map, '__none')) {
      map['__none'] ||= [];
    }
    return map;
  }, [effectiveRows, groupCol, groupOptions]);

  const [dragCard, setDragCard] = useState<{ rowId: string; from: string } | null>(null);
  const [dropTarget, setDropTarget] = useState<{ groupId: string; index: number } | null>(null);
  const [dragMetrics, setDragMetrics] = useState<{ height: number }>({ height: 56 });
  const [editingCardId, setEditingCardId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState<string>('');

  // Global, capture-phase suppression for file-drop overlay when a card is being dragged
  useEffect(() => {
    const prevent = (e: DragEvent) => {
      if (!draggingRef.current) return;
      e.preventDefault();
      try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch { }
    };
    const opts: AddEventListenerOptions = { capture: true };
    window.addEventListener('dragenter', prevent, opts);
    window.addEventListener('dragover', prevent, opts);
    window.addEventListener('drop', prevent, opts);
    document.addEventListener('dragenter', prevent, opts);
    document.addEventListener('dragover', prevent, opts);
    document.addEventListener('drop', prevent, opts);
    document.body.addEventListener('dragenter', prevent, opts);
    document.body.addEventListener('dragover', prevent, opts);
    document.body.addEventListener('drop', prevent, opts);
    return () => {
      window.removeEventListener('dragenter', prevent, opts as any);
      window.removeEventListener('dragover', prevent, opts as any);
      window.removeEventListener('drop', prevent, opts as any);
      document.removeEventListener('dragenter', prevent, opts as any);
      document.removeEventListener('dragover', prevent, opts as any);
      document.removeEventListener('drop', prevent, opts as any);
      document.body.removeEventListener('dragenter', prevent, opts as any);
      document.body.removeEventListener('dragover', prevent, opts as any);
      document.body.removeEventListener('drop', prevent, opts as any);
    };
  }, []);

  const moveRowToEnd = (rowId: string) => {
    const idx = effectiveRows.findIndex(r => r.id === rowId);
    if (idx < 0) return effectiveRows;
    const next = [...effectiveRows];
    const [moved] = next.splice(idx, 1);
    next.push(moved);
    return next;
  };

  // Compute insert index inside a column based on pointer Y relative to cards
  const computeInsertIndex = (
    e: React.DragEvent<HTMLDivElement>,
    columnEl: HTMLDivElement
  ): number => {
    const cardsEl = columnEl.querySelector('.ktb__cards') as HTMLElement | null;
    if (!cardsEl) return 0;
    const children = Array.from(cardsEl.querySelectorAll('.ktb__card')) as HTMLElement[];
    const y = e.clientY;
    let idx = 0;
    for (const child of children) {
      const rect = child.getBoundingClientRect();
      const mid = rect.top + rect.height / 2;
      if (y < mid) return idx;
      idx++;
    }
    return children.length;
  };

  const dropToGroup = (targetGroupId: string, insertIndex: number) => {
    if (!editable || !groupCol || !dragCard) return;
    const next = [...effectiveRows];
    const fromIdx = next.findIndex(r => r.id === dragCard.rowId);
    if (fromIdx < 0) return;
    const [moved] = next.splice(fromIdx, 1);
    const normalizedTarget = targetGroupId === '__none' ? '' : targetGroupId;
    const updatedMoved: TableRow = {
      ...moved,
      values: { ...moved.values, [groupCol.id]: normalizedTarget },
      updatedAt: new Date().toISOString()
    };

    // Find global insertion position corresponding to insertIndex within the target group
    let seenInGroup = 0;
    let targetGlobalIndex: number | null = null;
    for (let i = 0; i < next.length; i++) {
      const r = next[i];
      const val = String(r.values[groupCol.id] ?? '');
      if (val === normalizedTarget) {
        if (seenInGroup === insertIndex) {
          targetGlobalIndex = i; // insert before this row
          break;
        }
        seenInGroup++;
      }
    }

    if (targetGlobalIndex === null) {
      // Append to end of the group (after last row of that group)
      let lastIndexInGroup = -1;
      for (let i = 0; i < next.length; i++) {
        const r = next[i];
        const val = String(r.values[groupCol.id] ?? '');
        if (val === normalizedTarget) lastIndexInGroup = i;
      }
      targetGlobalIndex = lastIndexInGroup >= 0 ? lastIndexInGroup + 1 : next.length;
    }

    next.splice(targetGlobalIndex, 0, updatedMoved);
    updateAttributes({ rows: next });
    setDragCard(null);
    setDropTarget(null);
  };

  const addCard = (targetGroupId: string) => {
    if (!editable || !groupCol) return;
    const newRow: TableRow = {
      id: uid('row'),
      createdAt: new Date().toISOString(),
      updatedAt: undefined,
      values: columns.reduce<Record<string, CellValue>>((acc, col) => {
        acc[col.id] = createDefaultValue(col.type, col.options);
        return acc;
      }, {}),
    };
    newRow.values[groupCol.id] = targetGroupId === '__none' ? '' : targetGroupId;
    const nextRows = [...effectiveRows, newRow];
    updateAttributes({ rows: nextRows, rowCount: nextRows.length });
  };

  const addGroup = () => {
    if (!editable || !groupCol) return;
    const newOpt: SelectOption = {
      id: uid('opt'),
      label: `New`,
      color: DEFAULT_COLORS[(groupOptions.length) % DEFAULT_COLORS.length],
    };
    const nextCols = [...columns];
    nextCols[groupColIndex] = { ...nextCols[groupColIndex], options: [...(groupOptions || []), newOpt] };
    updateAttributes({ columns: nextCols });
  };

  const rootClass = `kt ${groupCol ? 'kt-kanban' : ''}`;
  const titleColId = columns[0]?.id;
  const beginEdit = (row: TableRow) => {
    if (!editable || !titleColId) return;
    setEditingCardId(row.id);
    setEditingTitle(String(row.values[titleColId] ?? ''));
  };
  const commitEdit = (rowId: string) => {
    if (!editable || !titleColId) return;
    const next = effectiveRows.map(r =>
      r.id === rowId ? { ...r, values: { ...r.values, [titleColId]: editingTitle }, updatedAt: new Date().toISOString() } : r
    );
    updateAttributes({ rows: next });
    setEditingCardId(null);
  };
  const cancelEdit = () => setEditingCardId(null);

  const deleteCard = (rowId: string) => {
    if (!editable) return;
    const next = effectiveRows.filter(r => r.id !== rowId);
    updateAttributes({ rows: next });
  };

  const deleteKanban = () => {
    if (!editable || typeof getPos !== 'function') return;
    // Delete the entire kanban node
    const pos = getPos();
    if (pos !== undefined) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    }
  };

  const toggleLayout = () => {
    if (!editable) return;
    const newLayout = attrs.layout === 'vertical' ? 'horizontal' : 'vertical';
    updateAttributes({ layout: newLayout });
  };

  const toggleFit = () => {
    if (!editable) return;
    updateAttributes({ fitContainer: !attrs.fitContainer });
  };

  const suppressDragIfDragging = (e: React.DragEvent) => {
    if (!dragCard) return;
    e.preventDefault();
    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch { }
  };

  return (
    <NodeViewWrapper
      className={rootClass}
      data-type="kanban-table"
      onDragEnterCapture={suppressDragIfDragging}
      onDragOverCapture={suppressDragIfDragging}
      onDropCapture={suppressDragIfDragging}
    >
      {!groupCol ? (
        // Fallback: render the existing table UI when no select column exists
        <div className="kt__container">
          <div className="kt__scroll">
            <table className="kt__table">
              <thead
                ref={headerRef}
                onMouseEnter={() => setIsHeaderAreaHovered(true)}
                onMouseLeave={() => {
                  setTimeout(() => {
                    if (!headerRef.current?.matches(':hover')) {
                      setIsHeaderAreaHovered(false);
                    }
                  }, 10);
                }}
              >
                <tr>
                  {editable && (
                    <th className="kt__row-handle-header"></th>
                  )}
                  {columns.map((c, i) => (
                    <HeaderCell
                      key={c.id}
                      col={c}
                      index={i}
                      editable={editable}
                      onName={renameCol}
                      onType={setType}
                      onManageTags={(idx) => setManagingTags(idx)}
                      onDelete={deleteColumnAt}
                      onDragStart={(idx) => setDraggedCol(idx)}
                      onDragOver={(idx) => draggedCol !== null && setDraggedCol(idx)}
                      onDrop={(idx) => {
                        if (draggedCol !== null) {
                          reorderColumn(draggedCol, idx);
                          setDraggedCol(null);
                        }
                      }}
                    />
                  ))}
                  {editable && isHeaderAreaHovered && (
                    <th className="kt__th kt__th--add-column">
                      <button
                        ref={addColumnButtonRef}
                        className="kt__add-col-btn"
                        onClick={() => insertColumnAt(columns.length)}
                        title="Add column"
                        onMouseEnter={() => setIsHeaderAreaHovered(true)}
                        onMouseLeave={() => {
                          setTimeout(() => {
                            if (!headerRef.current?.matches(':hover')) {
                              setIsHeaderAreaHovered(false);
                            }
                          }, 10);
                        }}
                      >
                        + Column
                      </button>
                    </th>
                  )}
                </tr>
              </thead>

              <tbody>
                {effectiveRows.map((row, rIdx) => (
                  <tr
                    key={row.id}
                    className="kt__row"
                    draggable={editable}
                    onDragStart={() => setDraggedRow(rIdx)}
                    onDragOver={e => { e.preventDefault(); }}
                    onDrop={() => {
                      if (draggedRow !== null) {
                        reorderRow(draggedRow, rIdx);
                        setDraggedRow(null);
                      }
                    }}
                    ref={rIdx === effectiveRows.length - 1 ? lastRowRef : null}
                    onMouseEnter={() => {
                      setHoverRow(rIdx);
                      if (rIdx === effectiveRows.length - 1) {
                        handleLastRowMouseEnter();
                      }
                    }}
                    onMouseLeave={() => {
                      setHoverRow(null);
                      if (rIdx === effectiveRows.length - 1) {
                        handleLastRowMouseLeave();
                      }
                    }}
                  >
                    {editable && (
                      <td className="kt__row-handle">
                        <div className="kt__drag-handle" title="Drag to reorder">⋮⋮</div>
                      </td>
                    )}

                    {columns.map((col) => {
                      const val = row.values[col.id] ?? createDefaultValue(col.type, col.options);
                      return (
                        <td key={`${row.id}-${col.id}`} className="kt__td" data-type={col.type}>
                          {col.type === 'select' ? (
                            <div className="kt__select-cell">
                              <select
                                className="kt__select"
                                value={String(val)}
                                onChange={(e) => {
                                  setCell(row.id, col.id, e.target.value);
                                }}
                                disabled={!editable}
                                style={{
                                  backgroundColor: col.options?.find(o => o.id === val)?.color,
                                  color: '#fff'
                                }}
                                data-stored-value={String(val)}
                                data-column-options={JSON.stringify(col.options?.map(opt => ({ id: opt.id, label: opt.label })) || [])}
                              >
                                {col.options?.map(opt => (
                                  <option key={opt.id} value={opt.id}>{opt.label}</option>
                                ))}
                              </select>
                            </div>
                          ) : col.type === 'checkbox' ? (
                            <div className="kt__checkbox-cell">
                              <input
                                type="checkbox"
                                className="kt__checkbox"
                                checked={Boolean(val)}
                                onChange={(e) => setCell(row.id, col.id, e.target.checked)}
                                disabled={!editable}
                              />
                            </div>
                          ) : col.type === 'number' ? (
                            <input
                              type="number"
                              className="kt__input"
                              value={Number(val) || 0}
                              onChange={(e) => setCell(row.id, col.id, Number(e.target.value))}
                              disabled={!editable}
                            />
                          ) : col.type === 'progress' ? (
                            <div className="kt__progress-cell">
                              <div className="kt__progress-bar">
                                <div
                                  className="kt__progress-fill"
                                  style={{ width: `${Number(val) || 0}%` }}
                                />
                              </div>
                              <input
                                type="number"
                                min={0}
                                max={100}
                                className="kt__progress-input"
                                value={Number(val) || 0}
                                onChange={(e) => setCell(row.id, col.id, Math.min(100, Math.max(0, Number(e.target.value))))}
                                disabled={!editable}
                              />
                              <span className="kt__progress-label">%</span>
                            </div>
                          ) : col.type === 'date' ? (
                            <input
                              type="date"
                              className="kt__input"
                              value={String(val)}
                              onChange={(e) => setCell(row.id, col.id, e.target.value)}
                              disabled={!editable}
                            />
                          ) : col.type === 'createdTime' ? (
                            <div className="kt__created-time">{formatDate(row.createdAt)}</div>
                          ) : (
                            <input
                              type="text"
                              className="kt__input"
                              value={String(val)}
                              onChange={(e) => setCell(row.id, col.id, e.target.value)}
                              disabled={!editable}
                              placeholder="Empty"
                            />
                          )}
                        </td>
                      );
                    })}

                    {editable && hoverRow === rIdx && (
                      <td className="kt__row-actions">
                        <button
                          className="kt__icon-btn"
                          onClick={() => deleteRowAt(rIdx)}
                          title="Delete row"
                        >
                          🗑
                        </button>
                      </td>
                    )}
                  </tr>
                ))}

                {editable && showAddRowButton && (
                  <tr className="kt__row kt__row--add">
                    <td colSpan={columns.length + (editable ? 2 : 0)}>
                      <button
                        ref={addRowButtonRef}
                        className="kt__add-row-btn"
                        onClick={() => insertRowAt(effectiveRows.length)}
                        onMouseEnter={handleAddRowButtonMouseEnter}
                        onMouseLeave={handleAddRowButtonMouseLeave}
                      >
                        + New Row
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        // Kanban board UI
        <div className="ktb__outer">
          <div className="ktb__toolbar">
            <div className="ktb__actions">
              <div style={{ position: 'relative' }}>
                <button
                  className="kt__btn"
                  onClick={() => setShowViewMenu(!showViewMenu)}
                  title="View settings"
                >
                  👁 View
                </button>
                {showViewMenu && (
                  <div className="kt__type-menu" style={{ right: 0, left: 'auto', minWidth: '200px' }}>
                    <button
                      className="kt__dropdown-item"
                      onClick={() => { toggleLayout(); setShowViewMenu(false); }}
                    >
                      <span className="kt__dropdown-icon">{attrs.layout === 'vertical' ? '⬍' : '⬄'}</span>
                      <span>{attrs.layout === 'vertical' ? 'Switch to Horizontal' : 'Switch to Vertical'}</span>
                    </button>
                    <button
                      className="kt__dropdown-item"
                      onClick={() => { toggleFit(); setShowViewMenu(false); }}
                    >
                      <span className="kt__dropdown-icon">{attrs.fitContainer ? '☒' : '☐'}</span>
                      <span>
                        {attrs.layout === 'vertical'
                          ? (attrs.fitContainer ? 'Disable Fit Height' : 'Enable Fit Height')
                          : (attrs.fitContainer ? 'Disable Fit Width' : 'Enable Fit Width')
                        }
                      </span>
                    </button>
                  </div>
                )}
              </div>

              <button
                className="kt__manage-tags-btn"
                onClick={() => editable && setManagingTags(groupColIndex)}
                disabled={!editable}
                title={editable ? "Manage statuses" : "View only - cannot manage statuses"}
              >
                ⚙ Manage
              </button>
              <button
                className="kt__btn"
                onClick={() => editable && addGroup()}
                disabled={!editable}
                title={editable ? "Add status" : "View only - cannot add status"}
              >
                + Add Status
              </button>
              {editable && (
                <button
                  className="kt__kanban-delete"
                  onClick={deleteKanban}
                  title="Delete kanban board"
                >
                  ×
                </button>
              )}
            </div>
          </div>

          <div
            className={`ktb__board ${attrs.layout === 'vertical' ? 'ktb__board--vertical' : ''} ${attrs.fitContainer ? 'ktb__board--fit' : ''}`}
            role="list"
            onDragEnter={suppressDragIfDragging}
            onDragOver={suppressDragIfDragging}
          >
            {/* Regular groups */}
            {groupOptions.map(opt => {
              const rowsInGroup = groups[opt.id] || [];
              return (
                <div key={opt.id} className={`ktb__column ${dragCard ? 'is-dnd-active' : ''}`}
                  onDragOver={(e) => {
                    if (!dragCard) return;
                    e.preventDefault();
                    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch { }
                    const idx = computeInsertIndex(e, e.currentTarget as HTMLDivElement);
                    setDropTarget({ groupId: opt.id, index: idx });
                  }}
                  onDragLeave={(e) => {
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                    setDropTarget(prev => prev && prev.groupId === opt.id ? null : prev);
                  }}
                  onDrop={(e) => {
                    if (!dragCard) return;
                    const idx = computeInsertIndex(e, e.currentTarget as HTMLDivElement);
                    dropToGroup(opt.id, idx);
                  }}
                  role="listitem">
                  <div className="ktb__column-header">
                    <div className="ktb__column-title">
                      <span className="ktb__swatch" style={{ backgroundColor: opt.color }} />
                      <span className="ktb__name">{opt.label}</span>
                      <span className="ktb__count">({rowsInGroup.length})</span>
                    </div>
                  </div>

                  <div
                    className="ktb__cards"
                    style={dropTarget?.groupId === opt.id && dropTarget.index === 0 ? { paddingTop: dragMetrics.height } : undefined}
                  >
                    {rowsInGroup.map((row, idx) => {
                      const isSpacerBelow = !!(dragCard && dropTarget?.groupId === opt.id && dropTarget.index - 1 === idx && dragCard.rowId !== row.id);
                      return (
                        <div
                          key={row.id}
                          className={`ktb__card ${dragCard?.rowId === row.id ? 'is-dragging' : ''}`}
                          style={isSpacerBelow ? { marginBottom: dragMetrics.height } : undefined}
                          draggable={editable && editingCardId !== row.id}
                          onDragStart={(e) => {
                            try { e.dataTransfer?.setData('text/plain', row.id); e.dataTransfer!.effectAllowed = 'move'; } catch { }
                            try {
                              const h = (e.currentTarget as HTMLElement).getBoundingClientRect().height;
                              if (h && Number.isFinite(h)) setDragMetrics({ height: Math.round(h) });
                            } catch { }
                            draggingRef.current = true;
                            setDragCard({ rowId: row.id, from: String(row.values[groupCol!.id] || '') });
                          }}
                          onDragEnd={() => { draggingRef.current = false; setDragCard(null); setDropTarget(null); }}
                        >
                          {editable && (
                            <button
                              className="ktb__card-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCard(row.id);
                              }}
                              title="Delete card"
                            >
                              ×
                            </button>
                          )}
                          <div className="ktb__card-title" onClick={() => beginEdit(row)}>
                            {editingCardId === row.id ? (
                              <input
                                className="ktb__card-title-input"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => commitEdit(row.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit(row.id);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                autoFocus
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            ) : (
                              String(titleColId ? row.values[titleColId] : '') || 'Untitled'
                            )}
                          </div>
                          <div className="ktb__card-meta">
                            <span className="ktb__meta-item">
                              {row.updatedAt ? `Last updated ${formatDate(row.updatedAt)}` : `Created ${formatDate(row.createdAt)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  {editable && (
                    <button className="ktb__add-card" onClick={() => addCard(opt.id)}>+ Add card</button>
                  )}
                </div>
              );
            })}

            {/* No Status bucket if any */}
            {groups['__none'] && (() => {
              const rowsInGroup = groups['__none'] || [];
              return (
                <div key="__none" className={`ktb__column ${dragCard ? 'is-dnd-active' : ''}`}
                  onDragOver={(e) => {
                    if (!dragCard) return;
                    e.preventDefault();
                    try { if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'; } catch { }
                    const idx = computeInsertIndex(e, e.currentTarget as HTMLDivElement);
                    setDropTarget({ groupId: '__none', index: idx });
                  }}
                  onDragLeave={(e) => {
                    const rt = e.relatedTarget as HTMLElement | null;
                    if (rt && (e.currentTarget as HTMLElement).contains(rt)) return;
                    setDropTarget(prev => prev && prev.groupId === '__none' ? null : prev);
                  }}
                  onDrop={(e) => {
                    if (!dragCard) return;
                    const idx = computeInsertIndex(e, e.currentTarget as HTMLDivElement);
                    dropToGroup('__none', idx);
                  }}
                  role="listitem">
                  <div className="ktb__column-header">
                    <div className="ktb__column-title">
                      <span className="ktb__swatch ktb__swatch--none" />
                      <span className="ktb__name">No Status</span>
                      <span className="ktb__count">{rowsInGroup.length}</span>
                    </div>
                  </div>
                  <div
                    className="ktb__cards"
                    style={dropTarget?.groupId === '__none' && dropTarget.index === 0 ? { paddingTop: dragMetrics.height } : undefined}
                  >
                    {rowsInGroup.map((row, idx) => {
                      const isSpacerBelow = !!(dragCard && dropTarget?.groupId === '__none' && dropTarget.index - 1 === idx && dragCard.rowId !== row.id);
                      return (
                        <div
                          key={row.id}
                          className={`ktb__card ${dragCard?.rowId === row.id ? 'is-dragging' : ''}`}
                          style={isSpacerBelow ? { marginBottom: dragMetrics.height } : undefined}
                          draggable={editable && editingCardId !== row.id}
                          onDragStart={(e) => {
                            try { e.dataTransfer?.setData('text/plain', row.id); e.dataTransfer!.effectAllowed = 'move'; } catch { }
                            try {
                              const h = (e.currentTarget as HTMLElement).getBoundingClientRect().height;
                              if (h && Number.isFinite(h)) setDragMetrics({ height: Math.round(h) });
                            } catch { }
                            draggingRef.current = true;
                            setDragCard({ rowId: row.id, from: '__none' });
                          }}
                          onDragEnd={() => { draggingRef.current = false; setDragCard(null); setDropTarget(null); }}
                        >
                          {editable && (
                            <button
                              className="ktb__card-delete"
                              onClick={(e) => {
                                e.stopPropagation();
                                deleteCard(row.id);
                              }}
                              title="Delete card"
                            >
                              ×
                            </button>
                          )}
                          <div className="ktb__card-title" onDoubleClick={() => beginEdit(row)}>
                            {editingCardId === row.id ? (
                              <input
                                className="ktb__card-title-input"
                                value={editingTitle}
                                onChange={(e) => setEditingTitle(e.target.value)}
                                onBlur={() => commitEdit(row.id)}
                                onKeyDown={(e) => {
                                  if (e.key === 'Enter') commitEdit(row.id);
                                  if (e.key === 'Escape') cancelEdit();
                                }}
                                autoFocus
                                onMouseDown={(e) => e.stopPropagation()}
                              />
                            ) : (
                              String(row.values[columns[0].id] || 'Untitled')
                            )}
                          </div>
                          <div className="ktb__card-meta">
                            <span className="ktb__meta-item">
                              {row.updatedAt ? `Last updated ${formatDate(row.updatedAt)}` : `Created ${formatDate(row.createdAt)}`}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                  {editable && (
                    <button className="ktb__add-card" onClick={() => addCard('__none')}>+ Add card</button>
                  )}
                </div>
              );
            })()}
          </div>
        </div>
      )}

      {managingTags !== null && columns[managingTags]?.options && (
        <TagManager
          options={columns[managingTags].options!}
          onUpdate={(opts) => updateColumnOptions(managingTags, opts)}
          onClose={() => setManagingTags(null)}
        />
      )}
    </NodeViewWrapper>
  );
}
  ;

/* ========= Node ========= */

const KanbanTableNode = Node.create<TableBoardAttrs>({
  name: 'kanbanTable',
  group: 'block',
  content: '',
  isolating: true,
  draggable: false,

  addAttributes() {
    return {
      columns: {
        default: DEFAULT_COLUMNS,
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-columns');
          if (!raw) return DEFAULT_COLUMNS;
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as ColumnDefinition[]) : DEFAULT_COLUMNS;
          } catch { return DEFAULT_COLUMNS; }
        },
        renderHTML: (attrs: TableBoardAttrs) => ({ 'data-columns': JSON.stringify(attrs.columns || DEFAULT_COLUMNS) }),
      },
      columnCount: { default: DEFAULT_COLUMNS.length },
      rowCount: { default: DEFAULT_ROWS },
      rows: {
        default: [],
        parseHTML: (el: HTMLElement) => {
          const raw = el.getAttribute('data-rows');
          if (!raw) return [];
          try {
            const parsed = JSON.parse(raw);
            return Array.isArray(parsed) ? (parsed as TableRow[]) : [];
          } catch { return []; }
        },
        renderHTML: (attrs: TableBoardAttrs) => ({ 'data-rows': JSON.stringify(attrs.rows || []) }),
      },
      layout: {
        default: 'horizontal',
        parseHTML: (el: HTMLElement) => el.getAttribute('data-layout') as 'horizontal' | 'vertical' || 'horizontal',
        renderHTML: (attrs: TableBoardAttrs) => ({ 'data-layout': attrs.layout || 'horizontal' }),
      },
      fitContainer: {
        default: false,
        parseHTML: (el: HTMLElement) => el.getAttribute('data-fit-container') === 'true',
        renderHTML: (attrs: TableBoardAttrs) => ({ 'data-fit-container': attrs.fitContainer ? 'true' : 'false' }),
      },
    } as Record<string, unknown>;
  },

  parseHTML() {
    return [{ tag: 'div[data-type="kanban-table"]' }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const attrs = node.attrs as TableBoardAttrs;
    const columns = attrs.columns || DEFAULT_COLUMNS;
    const rows = attrs.rows || [];

    // Generate board view HTML for storage/export
    const selectColumn = columns.find(col => col.type === 'select');

    if (selectColumn) {
      // Render as board with columns
      const titleColumn = columns.find(c => c.type === 'text');
      const groupOptions = selectColumn.options || [];

      // Group rows by status
      const grouped: Record<string, TableRow[]> = {};
      groupOptions.forEach(opt => {
        grouped[opt.id] = [];
      });

      rows.forEach(row => {
        const statusValue = row.values[selectColumn.id];
        if (statusValue && grouped[statusValue as string]) {
          grouped[statusValue as string].push(row);
        }
      });

      const boardHTML: any = [
        'div',
        mergeAttributes(HTMLAttributes, { 'data-type': 'kanban-table', class: 'kt-kanban' }),
        ['div', { class: 'ktb__columns' },
          ...groupOptions.map(opt => [
            'div',
            { class: 'ktb__column' },
            ['div', { class: 'ktb__column-header' },
              ['div', { class: 'ktb__column-title' },
                ['span', { class: 'ktb__swatch', style: `background-color: ${opt.color}` }],
                ['span', { class: 'ktb__name' }, opt.label],
                ['span', { class: 'ktb__count' }, `(${grouped[opt.id]?.length || 0})`]
              ]
            ],
            ['div', { class: 'ktb__cards' },
              ...(grouped[opt.id] || []).map(row => {
                const title = titleColumn ? (row.values[titleColumn.id] || 'Untitled') : 'Untitled';
                const createdDate = row.createdAt ? new Date(row.createdAt).toLocaleString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                  hour: '2-digit',
                  minute: '2-digit'
                }) : '';

                return [
                  'div',
                  { class: 'ktb__card' },
                  ['div', { class: 'ktb__card-title' }, String(title)],
                  ['div', { class: 'ktb__card-meta' },
                    ['span', { class: 'ktb__meta-item' }, `Created ${createdDate}`]
                  ]
                ];
              })
            ]
          ])
        ]
      ];

      return boardHTML;
    }

    // Fallback to table if no select column
    const tableHTML: any = [
      'div',
      mergeAttributes(HTMLAttributes, { 'data-type': 'kanban-table', class: 'kt-kanban' }),
      [
        'table',
        { class: 'kt__table', style: 'width: 100%; border-collapse: collapse; table-layout: fixed;' },
        [
          'thead',
          {},
          [
            'tr',
            { class: 'kt__header-row' },
            ...columns.map(col => ['th', { class: 'kt__th', style: 'border: 1px solid #e5e7eb; padding: 0.5rem; background-color: #f9fafb; font-weight: 600; text-align: left;' }, col.name])
          ]
        ],
        [
          'tbody',
          {},
          ...rows.map(row => [
            'tr',
            { class: 'kt__row' },
            ...columns.map(col => {
              const val = row.values[col.id] ?? '';
              if (col.type === 'select' && col.options) {
                const option = col.options.find(opt => opt.id === val);
                const label = option ? option.label : 'Not Started';
                const color = option ? option.color : '#6b7280';
                return [
                  'td',
                  { class: 'kt__td', style: 'border: 1px solid #e5e7eb; padding: 0.5rem;' },
                  [
                    'span',
                    {
                      class: 'kt__select-display',
                      style: `background-color: ${color}; color: white; padding: 0.25rem 0.5rem; border-radius: 4px; font-weight: 500; text-align: center; min-width: 80px; display: inline-block;`
                    },
                    label
                  ]
                ];
              } else if (col.type === 'progress') {
                const progress = Number(val) || 0;
                return [
                  'td',
                  { class: 'kt__td', style: 'border: 1px solid #e5e7eb; padding: 0.5rem;' },
                  [
                    'div',
                    { style: 'display: flex; align-items: center; gap: 8px;' },
                    [
                      'div',
                      { style: 'flex: 1; height: 20px; background-color: #e5e7eb; border-radius: 10px; overflow: hidden; position: relative;' },
                      ['div', { style: `width: ${progress}%; height: 100%; background-color: #3b82f6; position: absolute; top: 0; left: 0;` }]
                    ],
                    ['span', { style: 'font-size: 12px; color: #374151; white-space: nowrap;' }, `${progress}%`]
                  ]
                ];
              } else if (col.type === 'checkbox') {
                return [
                  'td',
                  { class: 'kt__td', style: 'border: 1px solid #e5e7eb; padding: 0.5rem; text-align: center;' },
                  ['input', { type: 'checkbox', checked: Boolean(val) ? 'checked' : null, disabled: 'disabled' }]
                ];
              } else {
                return ['td', { class: 'kt__td', style: 'border: 1px solid #e5e7eb; padding: 0.5rem;' }, String(val)];
              }
            })
          ])
        ]
      ]
    ];

    return tableHTML;
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableBoardView);
  },

  addCommands() {
    return {
      insertKanbanTable: () => ({ tr, dispatch, state }: CommandProps) => {
        const tableType = state.schema.nodes.kanbanTable;
        if (!tableType) return false;

        const cols = DEFAULT_COLUMNS;
        const rows = createDefaultRows(cols, DEFAULT_ROWS);

        const node = tableType.create({
          columns: cols,
          columnCount: cols.length,
          rowCount: rows.length,
          rows,
        });

        if (!node) return false;
        if (dispatch) {
          tr.replaceSelectionWith(node).scrollIntoView();
          dispatch(tr);
        }
        return true;
      },
    };
  },
});

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    kanbanTable: {
      insertKanbanTable: () => ReturnType;
    };
  }
}

export default [KanbanTableNode];

