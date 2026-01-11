import React, { useEffect, useState, useRef } from 'react';
import { Node, mergeAttributes } from '@tiptap/core';
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react';
import { useNotebook } from '@/context/NotebookContext';

/* ========= TypeScript Declarations ========= */

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    table: {
      /**
       * Insert a custom table
       */
      insertTable: () => ReturnType;
    };
  }
}

/* ========= Types ========= */

type ColumnType = 'text' | 'select' | 'number' | 'percentage' | 'date' | 'checkbox' | 'person';

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
  width?: number;
}

type CellValue = string | number | boolean;

interface TableRow {
  id: string;
  values: Record<string, CellValue>;
}

interface TableAttrs {
  columns: ColumnDefinition[];
  rows: TableRow[];
}

/* ========= Constants ========= */

const COLUMN_TYPE_OPTIONS: { value: ColumnType; label: string; icon: string }[] = [
  { value: 'text', label: 'Text', icon: 'T' },
  { value: 'select', label: 'Select', icon: '○' },
  { value: 'checkbox', label: 'Checkbox', icon: '☑' },
  { value: 'number', label: 'Number', icon: '#' },
  { value: 'percentage', label: 'Percentage', icon: '%' },
  { value: 'date', label: 'Date', icon: '📅' },
  { value: 'person', label: 'Person', icon: '👤' },
];

const DEFAULT_COLORS = [
  '#ef4444', '#f97316', '#f59e0b', '#eab308', '#84cc16',
  '#22c55e', '#10b981', '#14b8a6', '#06b6d4', '#0ea5e9',
  '#3b82f6', '#6366f1', '#8b5cf6', '#a855f7', '#d946ef',
  '#ec4899', '#f43f5e', '#64748b'
];

const DEFAULT_SELECT_OPTIONS: SelectOption[] = [
  { id: 'not-started', label: 'Not Started', color: '#64748b' },
  { id: 'in-progress', label: 'In Progress', color: '#3b82f6' },
  { id: 'done', label: 'Done', color: '#10b981' },
];

/* ========= Utils ========= */

const uid = (prefix: string) => `${prefix}-${Math.random().toString(36).slice(2, 9)}`;

const createDefaultValue = (type: ColumnType, options?: SelectOption[]): CellValue => {
  switch (type) {
    case 'select': return options?.[0]?.id ?? '';
    case 'number': return 0;
    case 'percentage': return 0;
    case 'checkbox': return false;
    case 'date': return new Date().toISOString().slice(0, 10);
    case 'person': return '';
    default: return '';
  }
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
          <h3>Manage Options</h3>
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
                  title="Delete option"
                >
                  🗑
                </button>
              </div>
            ))}
          </div>

          <div className="kt__tag-add">
            <input
              className="kt__tag-input"
              placeholder="New option name..."
              value={newTag}
              onChange={e => setNewTag(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && addTag()}
            />
            <button className="kt__btn-primary" onClick={addTag}>Add Option</button>
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

/* ========= Row Actions Menu ========= */

const RowActionsMenu: React.FC<{
  rowIndex: number;
  totalRows: number;
  onInsertAbove: () => void;
  onInsertBelow: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onDelete: () => void;
}> = ({ rowIndex, totalRows, onInsertAbove, onInsertBelow, onMoveUp, onMoveDown, onDelete }) => {
  const [showMenu, setShowMenu] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (menuRef.current && !menuRef.current.contains(target)) {
        setShowMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  return (
    <div className="kt__row-menu-container" ref={menuRef}>
      <button
        className="kt__row-menu-trigger"
        onClick={(e) => {
          e.stopPropagation();
          setShowMenu(!showMenu);
        }}
        title="Row actions"
      >
        ⋮
      </button>
      {showMenu && (
        <div className="kt__row-menu">
          <div className="kt__dropdown">
            <button
              className="kt__dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                onInsertAbove();
                setShowMenu(false);
              }}
            >
              <span className="kt__dropdown-icon">↑</span>
              <span>Insert Above</span>
            </button>
            <button
              className="kt__dropdown-item"
              onClick={(e) => {
                e.stopPropagation();
                onInsertBelow();
                setShowMenu(false);
              }}
            >
              <span className="kt__dropdown-icon">↓</span>
              <span>Insert Below</span>
            </button>
            {rowIndex > 0 && (
              <button
                className="kt__dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveUp();
                  setShowMenu(false);
                }}
              >
                <span className="kt__dropdown-icon">⬆</span>
                <span>Move Up</span>
              </button>
            )}
            {rowIndex < totalRows - 1 && (
              <button
                className="kt__dropdown-item"
                onClick={(e) => {
                  e.stopPropagation();
                  onMoveDown();
                  setShowMenu(false);
                }}
              >
                <span className="kt__dropdown-icon">⬇</span>
                <span>Move Down</span>
              </button>
            )}
            {totalRows > 1 && (
              <button
                className="kt__dropdown-item kt__dropdown-item--danger"
                onClick={(e) => {
                  e.stopPropagation();
                  onDelete();
                  setShowMenu(false);
                }}
              >
                <span className="kt__dropdown-icon">🗑</span>
                <span>Delete Row</span>
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

/* ========= Column Type Selector ========= */

const ColumnTypeSelector: React.FC<{
  value: ColumnType;
  onChange: (type: ColumnType) => void;
  onClose: () => void;
  isShared: boolean;
}> = ({ value, onChange, onClose, isShared }) => {
  return (
    <div className="kt__dropdown">
      {COLUMN_TYPE_OPTIONS.filter(opt => opt.value !== 'person' || isShared).map(opt => (
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

/* ========= Draggable Progress Bar ========= */

const DraggableProgressBar: React.FC<{
  value: number;
  onChange: (value: number) => void;
  disabled: boolean;
}> = ({ value, onChange, disabled }) => {
  const [isDragging, setIsDragging] = useState(false);
  const progressBarRef = useRef<HTMLDivElement>(null);

  const handleMouseDown = (e: React.MouseEvent) => {
    if (disabled) return;
    e.preventDefault();
    setIsDragging(true);
    updateValue(e);
  };

  const updateValue = (e: React.MouseEvent | MouseEvent) => {
    if (!progressBarRef.current) return;

    const rect = progressBarRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const percentage = Math.min(100, Math.max(0, (x / rect.width) * 100));
    onChange(Math.round(percentage));
  };

  const handleMouseMove = (e: MouseEvent) => {
    if (isDragging) {
      updateValue(e);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  useEffect(() => {
    if (isDragging) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isDragging]);

  return (
    <div className="kt__progress-cell">
      <div
        className={`kt__progress-bar ${disabled ? 'disabled' : 'draggable'}`}
        ref={progressBarRef}
        onMouseDown={handleMouseDown}
        style={{ cursor: disabled ? 'default' : 'pointer' }}
      >
        <div
          className="kt__progress-fill"
          style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
        />

      </div>
      <input
        type="number"
        min={0}
        max={100}
        className="kt__progress-input"
        value={value}
        onChange={(e) => onChange(Math.min(100, Math.max(0, Number(e.target.value))))}
        disabled={disabled}
      />
      <span className="kt__progress-label">%</span>
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
  onInsertBefore: (i: number) => void;
  onInsertAfter: (i: number) => void;
  onMoveLeft: (i: number) => void;
  onMoveRight: (i: number) => void;
  totalColumns: number;
  isHovered: boolean;
  onResizeStart: (e: React.MouseEvent, index: number) => void;
  isShared: boolean;
}> = ({ col, index, editable, onName, onType, onManageTags, onDelete, onInsertBefore, onInsertAfter, onMoveLeft, onMoveRight, totalColumns, isHovered, onResizeStart, isShared }) => {
  const [showTypeMenu, setShowTypeMenu] = useState(false);
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement>(null);
  const typeMenuRef = useRef<HTMLDivElement>(null);

  const typeInfo = COLUMN_TYPE_OPTIONS.find(o => o.value === col.type);

  const [isHeaderHovered, setIsHeaderHovered] = useState(false);

  // Close column menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (columnMenuRef.current && !columnMenuRef.current.contains(target)) {
        setShowColumnMenu(false);
      }
      if (typeMenuRef.current && !typeMenuRef.current.contains(target)) {
        setShowTypeMenu(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, []);

  // Close menus when mouse leaves the header area
  const handleMouseLeave = () => {
    setIsHeaderHovered(false);
    // Add a small delay to prevent menu from closing when moving to the menu
    setTimeout(() => {
      if (!columnMenuRef.current?.matches(':hover') && !typeMenuRef.current?.matches(':hover')) {
        setShowColumnMenu(false);
        setShowTypeMenu(false);
      }
    }, 100);
  };





  return (
    <th
      className="kt__th"
      style={{ width: col.width ? `${col.width}px` : 'auto', minWidth: '80px' }}
      onMouseEnter={() => setIsHeaderHovered(true)}
      onMouseLeave={handleMouseLeave}
    >
      {editable && (isHovered || isHeaderHovered) && (
        <button
          className="kt__col-menu-trigger"
          onClick={(e) => {
            e.stopPropagation();
            setShowColumnMenu(!showColumnMenu);
          }}
          title="Column actions"
        >
          ⋯
        </button>
      )}
      <div className="kt__th-inner">
        <div className="kt__th-top">
          <div className="kt__th-type-section">
            <div className="kt__type-btn-container">
              <button
                className="kt__type-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  if (editable) setShowTypeMenu(!showTypeMenu);
                }}
                disabled={!editable}
                title="Column type"
              >
                <span className="kt__type-icon">{typeInfo?.icon}</span>
              </button>
              {showTypeMenu && (
                <div className="kt__type-menu" ref={typeMenuRef}>
                  <ColumnTypeSelector
                    value={col.type}
                    onChange={(type) => onType(index, type)}
                    onClose={() => setShowTypeMenu(false)}
                    isShared={isShared}
                  />
                </div>
              )}
            </div>
            {col.type === 'select' && editable && (
              <button
                className="kt__manage-tags-btn"
                onClick={() => onManageTags(index)}
                title="Manage options"
              >
                ⚙
              </button>
            )}
          </div>
          <input
            className="kt__th-name"
            value={col.name}
            onChange={(e) => onName(index, e.target.value)}
            disabled={!editable}
            placeholder={`Column ${index + 1}`}
          />
        </div>

        <div className="kt__th-bottom">

          {showColumnMenu && (
            <div className="kt__column-menu" ref={columnMenuRef}>
              <div className="kt__dropdown">
                <button
                  className="kt__dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertBefore(index);
                    setShowColumnMenu(false);
                  }}
                >
                  <span className="kt__dropdown-icon">←</span>
                  <span>Insert Left</span>
                </button>
                <button
                  className="kt__dropdown-item"
                  onClick={(e) => {
                    e.stopPropagation();
                    onInsertAfter(index);
                    setShowColumnMenu(false);
                  }}
                >
                  <span className="kt__dropdown-icon">→</span>
                  <span>Insert Right</span>
                </button>
                {index > 0 && (
                  <button
                    className="kt__dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveLeft(index);
                      setShowColumnMenu(false);
                    }}
                  >
                    <span className="kt__dropdown-icon">⬅</span>
                    <span>Move Left</span>
                  </button>
                )}
                {index < totalColumns - 1 && (
                  <button
                    className="kt__dropdown-item"
                    onClick={(e) => {
                      e.stopPropagation();
                      onMoveRight(index);
                      setShowColumnMenu(false);
                    }}
                  >
                    <span className="kt__dropdown-icon">➡</span>
                    <span>Move Right</span>
                  </button>
                )}
                {totalColumns > 1 && (
                  <button
                    className="kt__dropdown-item kt__dropdown-item--danger"
                    onClick={(e) => {
                      e.stopPropagation();
                      onDelete(index);
                      setShowColumnMenu(false);
                    }}
                  >
                    <span className="kt__dropdown-icon">🗑</span>
                    <span>Delete Column</span>
                  </button>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
      {editable && index < totalColumns - 1 && (
        <div
          className="kt__resize-handle"
          onMouseDown={(e) => onResizeStart(e, index)}
          title="Resize column"
        />
      )}
    </th>
  );
};

/* ========= Workspace Members Cache ========= */

const membersCache: Record<string, { members: any[]; timestamp: number }> = {};
const MEMBERS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/* ========= Table View ========= */

const TableView: React.FC<NodeViewProps> = ({ node, updateAttributes, editor, getPos }) => {
  const { selectedWorkspace } = useNotebook();
  const [members, setMembers] = useState<any[]>([]);
  const isShared = members.length > 1;
  const attrs = node.attrs as TableAttrs;
  const columns = attrs.columns?.length ? attrs.columns : [
    { id: uid('col'), name: 'Column 1', type: 'text' as ColumnType },
    { id: uid('col'), name: 'Column 2', type: 'select' as ColumnType, options: DEFAULT_SELECT_OPTIONS },
    { id: uid('col'), name: 'Column 3', type: 'percentage' as ColumnType },
  ];
  const rows = attrs.rows?.length ? attrs.rows : [];

  useEffect(() => {
    if (!selectedWorkspace) return;

    // Check cache first
    const cached = membersCache[selectedWorkspace];
    if (cached && Date.now() - cached.timestamp < MEMBERS_CACHE_TTL) {
      setMembers(cached.members);
      return;
    }

    fetch(`/api/workspaces/members?workspaceId=${encodeURIComponent(selectedWorkspace)}`)
      .then(res => {
        if (!res.ok) {
          if (res.status === 404 || res.status === 403) return { members: [] };
          throw new Error('Failed to fetch members');
        }
        return res.json();
      })
      .then(data => {
        const membersList = data.members || [];
        membersCache[selectedWorkspace] = { members: membersList, timestamp: Date.now() };
        setMembers(membersList);
      })
      .catch(err => {
        console.warn('Workspace members fetch skipped or failed:', err.message);
        setMembers([]);
      });
  }, [selectedWorkspace]);

  // Force re-render when editor editable state changes
  const [, forceUpdate] = useState({});
  const editable = editor.isEditable;

  useEffect(() => {
    const handleUpdate = () => {
      // Defer update to avoid "flushSync was called from inside a lifecycle method" error
      // caused by Tiptap transactions triggering synchronous React updates
      requestAnimationFrame(() => {
        forceUpdate({});
      });
    };

    editor.on('update', handleUpdate);
    editor.on('transaction', handleUpdate);

    return () => {
      editor.off('update', handleUpdate);
      editor.off('transaction', handleUpdate);
    };
  }, [editor]);

  const [hoverRow, setHoverRow] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<number | null>(null);
  const [managingTags, setManagingTags] = useState<number | null>(null);
  const [hoveredCell, setHoveredCell] = useState<{ row: number; col: number } | null>(null);
  const [rowActionPosition, setRowActionPosition] = useState<{ top: number } | null>(null);
  const hideRowActionsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);
  const [isResizing, setIsResizing] = useState<number | null>(null);
  const [startX, setStartX] = useState(0);
  const [startWidth, setStartWidth] = useState(0);

  const lastRowRef = useRef<HTMLTableRowElement>(null);
  const lastColRef = useRef<HTMLTableCellElement>(null);
  const headerRef = useRef<HTMLTableSectionElement>(null);

  // Initialize with default rows if empty
  useEffect(() => {
    if (!editable) return;
    if (!attrs.columns?.length || !rows.length) {
      const defaultRows: TableRow[] = Array.from({ length: 3 }).map(() => ({
        id: uid('row'),
        values: columns.reduce<Record<string, CellValue>>((acc, col) => {
          acc[col.id] = createDefaultValue(col.type, col.options);
          return acc;
        }, {}),
      }));
      queueMicrotask(() => {
        updateAttributes({
          columns,
          rows: defaultRows,
        });
      });
    }
  }, []);

  const effectiveRows = rows.length ? rows : Array.from({ length: 3 }).map(() => ({
    id: uid('row'),
    values: columns.reduce<Record<string, CellValue>>((acc, col) => {
      acc[col.id] = createDefaultValue(col.type, col.options);
      return acc;
    }, {}),
  }));

  /* ---- Column Operations ---- */

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

    let newOptions = next[i].options;
    if (type === 'select' && (!next[i].options || next[i].options.length === 0)) {
      newOptions = [...DEFAULT_SELECT_OPTIONS];
    } else if (type !== 'select') {
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
    const newCol: ColumnDefinition = { id, name: 'New Column', type: 'text' };
    const nextCols = [...columns.slice(0, index), newCol, ...columns.slice(index)];
    const updRows = effectiveRows.map(r => ({
      ...r,
      values: { ...r.values, [id]: createDefaultValue('text') },
    }));
    updateAttributes({ columns: nextCols, rows: updRows });
  };

  const deleteColumnAt = (index: number) => {
    if (!editable || columns.length <= 1) return;
    const id = columns[index].id;
    const nextCols = columns.filter((_, i) => i !== index);
    const updRows = effectiveRows.map(r => {
      const { [id]: _, ...rest } = r.values;
      return { ...r, values: rest };
    });
    updateAttributes({ columns: nextCols, rows: updRows });
  };

  const moveColumnLeft = (index: number) => {
    if (index === 0) return;
    const next = [...columns];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updateAttributes({ columns: next });
  };

  const moveColumnRight = (index: number) => {
    if (index === columns.length - 1) return;
    const next = [...columns];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updateAttributes({ columns: next });
  };

  /* ---- Column Resizing ---- */

  const handleResizeStart = (e: React.MouseEvent, columnIndex: number) => {
    e.preventDefault();
    setIsResizing(columnIndex);
    setStartX(e.clientX);
    setStartWidth(columns[columnIndex].width || 150);
  };

  const handleResizeMove = (e: MouseEvent) => {
    if (isResizing === null) return;

    const diff = e.clientX - startX;
    const newWidth = Math.max(80, startWidth + diff);

    const nextColumns = [...columns];
    nextColumns[isResizing] = { ...nextColumns[isResizing], width: newWidth };
    updateAttributes({ columns: nextColumns });
  };

  const handleResizeEnd = () => {
    setIsResizing(null);
  };

  useEffect(() => {
    if (isResizing !== null) {
      document.addEventListener('mousemove', handleResizeMove);
      document.addEventListener('mouseup', handleResizeEnd);
      return () => {
        document.removeEventListener('mousemove', handleResizeMove);
        document.removeEventListener('mouseup', handleResizeEnd);
      };
    }
  }, [isResizing, startX, startWidth]);

  /* ---- Row Operations ---- */

  const insertRowAt = (index: number) => {
    if (!editable) return;
    const newRow: TableRow = {
      id: uid('row'),
      values: columns.reduce<Record<string, CellValue>>((acc, col) => {
        acc[col.id] = createDefaultValue(col.type, col.options);
        return acc;
      }, {}),
    };
    const nextRows = [...effectiveRows.slice(0, index), newRow, ...effectiveRows.slice(index)];
    updateAttributes({ rows: nextRows });
  };

  const deleteRowAt = (index: number) => {
    if (!editable || effectiveRows.length <= 1) return;
    const nextRows = effectiveRows.filter((_, i) => i !== index);
    updateAttributes({ rows: nextRows });
  };

  const moveRowUp = (index: number) => {
    if (index === 0) return;
    const next = [...effectiveRows];
    [next[index - 1], next[index]] = [next[index], next[index - 1]];
    updateAttributes({ rows: next });
  };

  const moveRowDown = (index: number) => {
    if (index === effectiveRows.length - 1) return;
    const next = [...effectiveRows];
    [next[index], next[index + 1]] = [next[index + 1], next[index]];
    updateAttributes({ rows: next });
  };

  /* ---- Cell Edit ---- */

  const setCell = (rowId: string, colId: string, value: CellValue) => {
    if (!editable) return;
    const next = effectiveRows.map(r =>
      r.id === rowId ? { ...r, values: { ...r.values, [colId]: value } } : r
    );
    updateAttributes({ rows: next });
  };

  const deleteTable = () => {
    if (!editable || typeof getPos !== 'function') return;
    // Delete the entire table node
    const pos = getPos();
    if (pos !== undefined) {
      editor.chain().focus().deleteRange({ from: pos, to: pos + node.nodeSize }).run();
    }
  };

  return (
    <NodeViewWrapper className={`kt custom-table-ext ${isResizing !== null ? 'resizing' : ''}`} data-type="custom-table">
      {editable && (
        <button
          className="kt__table-delete"
          onClick={deleteTable}
          title="Delete table"
        >
          ×
        </button>
      )}
      <div className="kt__container">
        <div className="kt__table-wrapper">
          {editable && hoverRow !== null && rowActionPosition && (
            <div
              className="kt__row-actions-overlay"
              style={{ top: `${rowActionPosition.top}px` }}
              onMouseEnter={() => {
                if (hideRowActionsTimeoutRef.current) {
                  clearTimeout(hideRowActionsTimeoutRef.current);
                  hideRowActionsTimeoutRef.current = null;
                }
              }}
              onMouseLeave={() => {
                hideRowActionsTimeoutRef.current = setTimeout(() => {
                  setHoverRow(null);
                  setRowActionPosition(null);
                }, 150);
              }}
            >
              <RowActionsMenu
                rowIndex={hoverRow}
                totalRows={effectiveRows.length}
                onInsertAbove={() => insertRowAt(hoverRow)}
                onInsertBelow={() => insertRowAt(hoverRow + 1)}
                onMoveUp={() => moveRowUp(hoverRow)}
                onMoveDown={() => moveRowDown(hoverRow)}
                onDelete={() => deleteRowAt(hoverRow)}
              />
            </div>
          )}
          <div className="kt__scroll">
            <div style={{ position: 'relative', display: 'inline-block' }}>
              <table className="kt__table" ref={tableRef}>
                <thead ref={headerRef}>
                  <tr>
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
                        onInsertBefore={(idx) => insertColumnAt(idx)}
                        onInsertAfter={(idx) => insertColumnAt(idx + 1)}
                        onMoveLeft={moveColumnLeft}
                        onMoveRight={moveColumnRight}
                        totalColumns={columns.length}
                        isHovered={hoveredCell?.col === i || hoverCol === i}
                        onResizeStart={handleResizeStart}
                        isShared={isShared}
                      />
                    ))}
                  </tr>
                </thead>

                <tbody>
                  {effectiveRows.map((row, rIdx) => (
                    <tr
                      key={row.id}
                      className="kt__row"
                      ref={rIdx === effectiveRows.length - 1 ? lastRowRef : null}
                      onMouseEnter={(e) => {
                        if (hideRowActionsTimeoutRef.current) {
                          clearTimeout(hideRowActionsTimeoutRef.current);
                          hideRowActionsTimeoutRef.current = null;
                        }
                        setHoverRow(rIdx);
                        const rect = e.currentTarget.getBoundingClientRect();
                        const tableRect = e.currentTarget.closest('.kt__table')?.getBoundingClientRect();
                        if (tableRect) {
                          setRowActionPosition({ top: rect.top - tableRect.top + rect.height / 2 });
                        }
                      }}
                      onMouseLeave={() => {
                        hideRowActionsTimeoutRef.current = setTimeout(() => {
                          setHoverRow(null);
                          setRowActionPosition(null);
                        }, 150);
                      }}
                    >
                      {columns.map((col, cIdx) => {
                        const val = row.values[col.id] ?? createDefaultValue(col.type, col.options);
                        return (
                          <td
                            key={`${row.id}-${col.id}`}
                            className="kt__td"
                            data-type={col.type}
                            onMouseEnter={() => {
                              setHoveredCell({ row: rIdx, col: cIdx });
                              setHoverCol(cIdx);
                            }}
                            onMouseLeave={() => {
                              setHoveredCell(null);
                              setHoverCol(null);
                            }}
                          >
                            {col.type === 'select' ? (
                              <div className="kt__select-cell">
                                <select
                                  className="kt__select"
                                  value={String(val)}
                                  onChange={(e) => setCell(row.id, col.id, e.target.value)}
                                  disabled={!editable}
                                  style={{
                                    backgroundColor: col.options?.find(o => o.id === val)?.color,
                                    color: '#fff'
                                  }}
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
                            ) : col.type === 'percentage' ? (
                              <DraggableProgressBar
                                value={Number(val) || 0}
                                onChange={(newValue) => setCell(row.id, col.id, newValue)}
                                disabled={!editable}
                              />
                            ) : col.type === 'date' ? (
                              <input
                                type="date"
                                className="kt__input"
                                value={String(val)}
                                onChange={(e) => setCell(row.id, col.id, e.target.value)}
                                disabled={!editable}
                              />
                            ) : col.type === 'person' ? (
                              <div className="kt__select-cell">
                                <select
                                  className="kt__select kt__person-select"
                                  value={String(val)}
                                  onChange={(e) => setCell(row.id, col.id, e.target.value)}
                                  disabled={!editable}
                                >
                                  <option value="">Unassigned</option>
                                  {members.map(m => (
                                    <option key={m.id} value={m.id}>{m.email}</option>
                                  ))}
                                </select>
                              </div>
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
                    </tr>
                  ))}
                </tbody>
              </table>
              {editable && (
                <div className="kt__add-column-sidebar">
                  <button
                    className="kt__add-column-btn"
                    onClick={() => insertColumnAt(columns.length)}
                    title="Add column"
                  >
                    +
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
      {editable && (
        <div className="kt__add-row-bottom">
          <button
            className="kt__add-row-btn-permanent"
            onClick={() => insertRowAt(effectiveRows.length)}
            title="Add row"
          >
            +
          </button>
        </div>
      )}

      {managingTags !== null && managingTags < columns.length && columns[managingTags] && (
        <TagManager
          options={columns[managingTags].options || []}
          onUpdate={(opts) => updateColumnOptions(managingTags, opts)}
          onClose={() => setManagingTags(null)}
        />
      )}
    </NodeViewWrapper>
  );
};

/* ========= TipTap Node Definition ========= */

export const TableExtension = Node.create({
  name: 'table',
  group: 'block',
  atom: true,
  draggable: false,

  addAttributes() {
    return {
      columns: {
        default: [],
        parseHTML: (element) => {
          const data = element.getAttribute('data-columns');
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attributes) => ({
          'data-columns': JSON.stringify(attributes.columns || []),
        }),
      },
      rows: {
        default: [],
        parseHTML: (element) => {
          const data = element.getAttribute('data-rows');
          return data ? JSON.parse(data) : [];
        },
        renderHTML: (attributes) => ({
          'data-rows': JSON.stringify(attributes.rows || []),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="custom-table"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'custom-table' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(TableView);
  },

  addCommands() {
    return {
      insertTable:
        () =>
          ({ commands }: any) => {
            return commands.insertContent({
              type: this.name,
              attrs: {
                columns: [],
                rows: [],
              },
            });
          },
    } as any;
  },
});

export default TableExtension;
