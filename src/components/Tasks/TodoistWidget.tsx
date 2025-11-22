'use client';

import React, { useState, useEffect, useRef } from 'react';
import { FiCheckSquare, FiPlus, FiX, FiTrash2, FiClock, FiAlertCircle, FiCheck, FiRepeat, FiCalendar } from 'react-icons/fi';
import { getTasks, getTask, createTask, completeTask, deleteTask, updateTask, hasTodoistAccess, storeTodoistToken, type TodoistTask } from '@/lib/todoist';
import { useAuth } from '@/context/AuthContext';

interface TodoistWidgetProps {
    onClose?: () => void;
}

type ViewMode = 'today' | 'upcoming' | 'all' | 'custom';

export default function TodoistWidget({ onClose }: TodoistWidgetProps) {
    const { user } = useAuth();
    const [viewMode, setViewMode] = useState<ViewMode>('today');
    const [customDate, setCustomDate] = useState('');
    const [tasks, setTasks] = useState<TodoistTask[]>([]);
    const [loading, setLoading] = useState(false);
    const [showAddTask, setShowAddTask] = useState(false);
    const [error, setError] = useState<string | null>(null);
    const [hasAccess, setHasAccess] = useState(false);
    const [checkingAccess, setCheckingAccess] = useState(true);
    const [todoistToken, setTodoistToken] = useState('');
    const [showTokenInput, setShowTokenInput] = useState(false);

    // Task form fields - separate name and date/time
    const [taskName, setTaskName] = useState('');
    const [taskDateTime, setTaskDateTime] = useState('');
    const [taskPriority, setTaskPriority] = useState(1);

    const initialLoadDone = useRef(false);

    useEffect(() => {
        checkTodoistAccess();
    }, []);

    const checkTodoistAccess = async () => {
        setCheckingAccess(true);
        try {
            const access = await hasTodoistAccess();
            setHasAccess(access);
            // If has access, load tasks WITHOUT showing second loader
            if (access) {
                // Load tasks directly without triggering loading state
                let filter = '';
                if (viewMode === 'today') {
                    filter = 'today | overdue';
                } else if (viewMode === 'upcoming') {
                    filter = '7 days';
                } else if (viewMode === 'custom' && customDate) {
                    filter = customDate;
                }
                const fetchedTasks = await getTasks(filter);
                setTasks(fetchedTasks);
                initialLoadDone.current = true;
            }
        } catch (err) {
            setHasAccess(false);
            console.error('Error checking Todoist access:', err);
        } finally {
            setCheckingAccess(false);
        }
    };

    const handleConnectTodoist = async () => {
        if (!todoistToken.trim()) {
            setError('Please enter your Todoist API token');
            return;
        }

        try {
            await storeTodoistToken(todoistToken);
            await checkTodoistAccess();

            if (hasAccess) {
                setShowTokenInput(false);
                setTodoistToken('');
                loadTasks();
            } else {
                setError('Invalid token. Please check and try again.');
            }
        } catch (err: any) {
            setError(err?.message || 'Failed to connect Todoist');
        }
    };

    useEffect(() => {
        // Skip initial load since checkTodoistAccess already loads
        if (hasAccess && !checkingAccess && initialLoadDone.current) {
            loadTasks();
        }
    }, [viewMode, customDate]);

    const loadTasksInternal = async () => {
        try {
            setLoading(true);
            setError(null);

            let filter = '';
            if (viewMode === 'today') {
                filter = 'today | overdue';
            } else if (viewMode === 'upcoming') {
                filter = '7 days';
            } else if (viewMode === 'custom' && customDate) {
                filter = customDate;
            }

            const fetchedTasks = await getTasks(filter);
            setTasks(fetchedTasks);
        } catch (err) {
            console.error('Error loading tasks:', err);
            setError('Failed to load tasks');
        } finally {
            setLoading(false);
        }
    };

    const loadTasks = () => {
        loadTasksInternal();
    };

    const handleAddTask = async () => {
        if (!taskName.trim()) {
            setError('Please enter a task name');
            return;
        }

        const taskNameValue = taskName.trim();
        const taskDateTimeValue = taskDateTime.trim();
        const taskPriorityValue = taskPriority;

        // Reset form immediately for better UX
        setTaskName('');
        setTaskDateTime('');
        setTaskPriority(1);
        setShowAddTask(false);
        setError(null);

        try {
            // Determine due date
            let dueString = taskDateTimeValue;

            if (!dueString && viewMode === 'custom' && customDate) {
                dueString = customDate;
            } else if (!dueString && viewMode === 'today') {
                dueString = 'today';
            }

            // Create task
            await createTask({
                content: taskNameValue,
                due_string: dueString || undefined,
                priority: taskPriorityValue,
            });

            // Reload tasks after creation
            await loadTasksInternal();
        } catch (err: any) {
            console.error('Error creating task:', err);
            const errorMsg = err?.message || 'Failed to create task';
            setError(errorMsg.includes('due_string')
                ? 'Invalid date format. Try: tomorrow, every monday, every 2nd wed'
                : errorMsg);

        }
    };

    const handleCompleteTask = async (taskId: string) => {
        // Find the task to check if it's recurring
        const task = tasks.find(t => t.id === taskId);
        const isRecurring = task?.due?.recurring || task?.due?.is_recurring;
        const taskName = task?.content;

        // console.log('Completing task:', { taskId, taskName, isRecurring, due: task?.due });

        // Optimistic UI: Remove immediately
        setTasks(prev => prev.filter(t => t.id !== taskId));

        try {
            await completeTask(taskId);
            // console.log('Task completed successfully');

            // If recurring, fetch the task again to get next occurrence
            if (isRecurring) {
                // console.log('Task is recurring, fetching updated task and task list in parallel...');

                // Prepare filter for task list
                let filter = '';
                if (viewMode === 'today') {
                    filter = 'today | overdue';
                } else if (viewMode === 'upcoming') {
                    filter = '7 days';
                } else if (viewMode === 'custom' && customDate) {
                    filter = customDate;
                }

                // Fetch both in parallel for speed
                const [updatedTask, updatedTasks] = await Promise.all([
                    getTask(taskId),
                    getTasks(filter)
                ]);

                // console.log('Updated task with next occurrence:', updatedTask);
                setTasks(updatedTasks);

                if (updatedTask?.due?.date) {
                    // Format the date nicely
                    const nextDate = new Date(updatedTask.due.date);
                    const formattedDate = nextDate.toLocaleDateString('en-US', {
                        month: 'short',
                        day: 'numeric',
                        year: 'numeric'
                    });
                    const message = `Task completed! Next occurrence: ${formattedDate}`;
                    // console.log('Setting success message:', message);
                    setError(message);
                    setTimeout(() => setError(null), 5000);
                } else {
                    const message = `Task completed!`;
                    // console.log('Setting success message (no due date):', message);
                    setError(message);
                    setTimeout(() => setError(null), 3000);
                }
            } else {
                // console.log('Task is not recurring, no message to show');
            }
        } catch (err) {
            console.error('Error completing task:', err);
            setError('Failed to complete task');
            // Reload on error to restore task
            loadTasks();
        }
    };

    const handleDeleteTask = async (taskId: string) => {
        if (!confirm('Delete this task?')) return;

        // Optimistic UI: Remove immediately
        setTasks(prev => prev.filter(t => t.id !== taskId));

        try {
            await deleteTask(taskId);
        } catch (err) {
            console.error('Error deleting task:', err);
            setError('Failed to delete task');
            // Reload on error to restore task
            loadTasks();
        }
    };

    if (checkingAccess) {
        return (
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-[420px] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <FiCheckSquare className="text-indigo-600" size={20} />
                        <h3 className="font-semibold text-gray-900">Tasks</h3>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <FiX size={20} />
                        </button>
                    )}
                </div>
                <div className="flex items-center justify-center p-12">
                    <div className="animate-spin rounded-full h-8 w-8 border-2 border-indigo-500 border-t-transparent" />
                </div>
            </div>
        );
    }

    if (!hasAccess) {
        return (
            <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-[420px] flex flex-col">
                <div className="flex items-center justify-between p-4 border-b border-gray-200">
                    <div className="flex items-center gap-3">
                        <FiCheckSquare className="text-indigo-600" size={20} />
                        <h3 className="font-semibold text-gray-900">Tasks</h3>
                    </div>
                    {onClose && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <FiX size={20} />
                        </button>
                    )}
                </div>

                <div className="p-6 flex flex-col items-center text-center space-y-4">
                    <div className="w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center">
                        <FiCheckSquare className="text-indigo-600" size={32} />
                    </div>

                    <div>
                        <h4 className="text-lg font-semibold text-gray-900 mb-2">
                            Connect Todoist
                        </h4>
                        <p className="text-sm text-gray-600 max-w-sm">
                            Enter your Todoist API token to manage tasks.
                        </p>
                    </div>

                    {error && (
                        <div className="w-full p-3 bg-red-50 border border-red-200 rounded-lg flex items-start gap-2">
                            <FiAlertCircle className="text-red-600 flex-shrink-0 mt-0.5" size={16} />
                            <p className="text-sm text-red-700">{error}</p>
                        </div>
                    )}

                    {!showTokenInput ? (
                        <button
                            onClick={() => setShowTokenInput(true)}
                            className="w-full px-6 py-3 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors shadow-sm font-medium"
                        >
                            Connect Todoist Account
                        </button>
                    ) : (
                        <div className="w-full space-y-3">
                            <input
                                type="text"
                                value={todoistToken}
                                onChange={(e) => setTodoistToken(e.target.value)}
                                placeholder="Enter your Todoist API token"
                                className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                            />
                            <div className="flex gap-2">
                                <button
                                    onClick={handleConnectTodoist}
                                    className="flex-1 px-4 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                                >
                                    Connect
                                </button>
                                <button
                                    onClick={() => {
                                        setShowTokenInput(false);
                                        setTodoistToken('');
                                        setError(null);
                                    }}
                                    className="px-4 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                                >
                                    Cancel
                                </button>
                            </div>
                        </div>
                    )}

                    <div className="text-xs text-gray-500 max-w-sm space-y-2">
                        <p>Get your API token from:</p>
                        <a
                            href="https://todoist.com/app/settings/integrations/developer"
                            target="_blank"
                            rel="noopener noreferrer"
                            className="text-indigo-600 hover:text-indigo-700 underline"
                        >
                            Todoist Settings → Integrations → Developer
                        </a>
                        <p className="text-xs text-gray-400 mt-2">
                            (Stored securely with your Google AI Studio API key)
                        </p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="bg-white rounded-lg shadow-2xl border border-gray-200 w-[480px] max-h-[650px] flex flex-col">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b border-gray-200">
                <div className="flex items-center gap-3">
                    <FiCheckSquare className="text-indigo-600" size={20} />
                    <h3 className="font-semibold text-gray-900">Tasks</h3>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={viewMode}
                        onChange={(e) => {
                            const mode = e.target.value as ViewMode;
                            setViewMode(mode);
                            if (mode === 'custom' && !customDate) {
                                setCustomDate(new Date().toISOString().split('T')[0]);
                            }
                        }}
                        className="px-3 py-1 text-xs font-medium text-gray-700 bg-gray-100 rounded hover:bg-gray-200 border-none"
                    >
                        <option value="today">Today</option>
                        <option value="upcoming">Upcoming</option>
                        <option value="custom">Custom Date</option>
                        <option value="all">All</option>
                    </select>
                    {onClose && (
                        <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
                            <FiX size={20} />
                        </button>
                    )}
                </div>
            </div>

            {viewMode === 'custom' && (
                <div className="px-4 py-3 border-b border-gray-200 bg-gray-50">
                    <div className="flex items-center gap-2">
                        <FiCalendar className="text-gray-500" size={16} />
                        <input
                            type="date"
                            value={customDate}
                            onChange={(e) => setCustomDate(e.target.value)}
                            className="flex-1 px-3 py-1.5 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        />
                    </div>
                </div>
            )}

            {error && (
                <div className={`mx-3 mt-3 p-2 rounded text-xs flex items-start gap-2 ${error.includes('Task completed')
                    ? 'bg-green-50 border border-green-200 text-green-700'
                    : 'bg-red-50 border border-red-200 text-red-700'
                    }`}>
                    {error.includes('Task completed') ? (
                        <FiCheck className="flex-shrink-0 mt-0.5" size={14} />
                    ) : (
                        <FiAlertCircle className="flex-shrink-0 mt-0.5" size={14} />
                    )}
                    <span>{error}</span>
                </div>
            )}

            <div className="flex-1 overflow-y-auto p-3">
                {loading ? (
                    <div className="flex items-center justify-center h-32">
                        <div className="animate-spin rounded-full h-6 w-6 border-2 border-indigo-500 border-t-transparent" />
                    </div>
                ) : tasks.length === 0 ? (
                    <div className="text-center py-8 text-gray-500 text-sm">
                        No tasks for {viewMode === 'custom' ? customDate : viewMode === 'today' ? 'today' : viewMode}
                    </div>
                ) : (
                    <div className="space-y-2">
                        {tasks.map(task => (
                            <TaskItem
                                key={task.id}
                                task={task}
                                onComplete={handleCompleteTask}
                                onDelete={handleDeleteTask}
                                onUpdate={loadTasks}
                            />
                        ))}
                    </div>
                )}
            </div>

            <div className="border-t border-gray-200 p-3">
                {!showAddTask ? (
                    <button
                        onClick={() => setShowAddTask(true)}
                        className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700 transition-colors"
                    >
                        <FiPlus size={16} />
                        <span className="text-sm font-medium">Add Task</span>
                    </button>
                ) : (
                    <div className="space-y-3">
                        <div className="flex gap-2">
                            <input
                                type="text"
                                value={taskName}
                                onChange={(e) => setTaskName(e.target.value)}
                                placeholder="Task name"
                                className="flex-1 px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === 'Enter' && !e.shiftKey) {
                                        e.preventDefault();
                                        handleAddTask();
                                    }
                                }}
                            />
                            <select
                                value={taskPriority}
                                onChange={(e) => setTaskPriority(Number(e.target.value))}
                                className="px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                                title="Priority"
                            >
                                <option value={1}>P4</option>
                                <option value={2}>P3</option>
                                <option value={3}>P2</option>
                                <option value={4}>P1</option>
                            </select>
                        </div>

                        <input
                            type="text"
                            value={taskDateTime}
                            onChange={(e) => setTaskDateTime(e.target.value)}
                            placeholder="e.g., tomorrow, every monday, every 2nd wed"
                            className="w-full px-3 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleAddTask();
                                }
                            }}
                        />

                        <div className="flex gap-2">
                            <button
                                onClick={handleAddTask}
                                className="flex-1 px-3 py-2 bg-indigo-600 text-white text-sm rounded-lg hover:bg-indigo-700"
                            >
                                Add Task
                            </button>
                            <button
                                onClick={() => {
                                    setShowAddTask(false);
                                    setTaskName('');
                                    setTaskDateTime('');
                                    setTaskPriority(1);
                                }}
                                className="px-3 py-2 bg-gray-100 text-gray-700 text-sm rounded-lg hover:bg-gray-200"
                            >
                                Cancel
                            </button>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}

function TaskItem({
    task,
    onComplete,
    onDelete,
    onUpdate
}: {
    task: TodoistTask;
    onComplete: (id: string) => void;
    onDelete: (id: string) => void;
    onUpdate: () => void;
}) {
    const [isCompleting, setIsCompleting] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editName, setEditName] = useState(task.content);
    const [editPriority, setEditPriority] = useState(task.priority);

    const priorityLabels = {
        4: { label: 'P1', color: 'bg-red-500 hover:bg-red-600' },
        3: { label: 'P2', color: 'bg-orange-500 hover:bg-orange-600' },
        2: { label: 'P3', color: 'bg-blue-500 hover:bg-blue-600' },
        1: { label: 'P4', color: 'bg-gray-400 hover:bg-gray-500' },
    };

    const priority = priorityLabels[task.priority as keyof typeof priorityLabels] || priorityLabels[1];

    const handleComplete = async () => {
        setIsCompleting(true);
        await onComplete(task.id);
    };

    const handleSaveEdit = async () => {
        try {
            await updateTask(task.id, {
                content: editName,
                priority: editPriority,
            });
            setIsEditing(false);
            onUpdate();
        } catch (err) {
            console.error('Error updating task:', err);
        }
    };

    const cyclePriority = async (e: React.MouseEvent) => {
        e.stopPropagation();
        const newPriority = task.priority === 4 ? 1 : (task.priority + 1);
        try {
            await updateTask(task.id, { priority: newPriority });
            onUpdate();
        } catch (err) {
            console.error('Error updating priority:', err);
        }
    };

    if (isEditing) {
        return (
            <div className="p-3 rounded-lg border border-indigo-300 bg-indigo-50 hover:shadow-sm transition-all">
                <div className="space-y-2">
                    <div className="flex gap-2">
                        <input
                            type="text"
                            value={editName}
                            onChange={(e) => setEditName(e.target.value)}
                            className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            autoFocus
                        />
                        <select
                            value={editPriority}
                            onChange={(e) => setEditPriority(Number(e.target.value))}
                            className="px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-2 focus:ring-indigo-500"
                        >
                            <option value={1}>P4</option>
                            <option value={2}>P3</option>
                            <option value={3}>P2</option>
                            <option value={4}>P1</option>
                        </select>
                    </div>
                    <div className="flex gap-2">
                        <button
                            onClick={handleSaveEdit}
                            className="flex-1 px-2 py-1 bg-indigo-600 text-white text-xs rounded hover:bg-indigo-700"
                        >
                            Save
                        </button>
                        <button
                            onClick={() => {
                                setIsEditing(false);
                                setEditName(task.content);
                                setEditPriority(task.priority);
                            }}
                            className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                        >
                            Cancel
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div
            className={`p-3 rounded-lg border border-gray-200 bg-white hover:shadow-sm transition-all group ${isCompleting ? 'opacity-50' : ''}`}
            onClick={() => setIsEditing(true)}
        >
            <div className="flex items-start gap-3">
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        handleComplete();
                    }}
                    disabled={isCompleting}
                    className="mt-0.5 flex-shrink-0 w-5 h-5 rounded border-2 border-current flex items-center justify-center hover:bg-indigo-50 transition-all duration-200 text-indigo-600 disabled:opacity-50"
                    title="Complete task"
                >
                    {isCompleting && <div className="w-3 h-3 border-2 border-indigo-600 border-t-transparent rounded-full animate-spin" />}
                    {!isCompleting && <FiCheck size={14} className="opacity-0 group-hover:opacity-100 transition-opacity" />}
                </button>

                <div className="flex-1 min-w-0">
                    <div className="font-medium text-sm text-gray-900">
                        {task.content}
                    </div>
                    {task.due && (
                        <div className="flex items-center gap-3 mt-1 text-xs text-gray-600">
                            <div className="flex items-center gap-1">
                                <FiCalendar size={12} />
                                {task.due.string || task.due.date}
                            </div>
                            {task.due.recurring && (
                                <div className="flex items-center gap-1">
                                    <FiRepeat size={12} />
                                    Recurring
                                </div>
                            )}
                        </div>
                    )}
                </div>

                <div className="flex items-center gap-1">
                    <button
                        onClick={cyclePriority}
                        className={`px-2 py-0.5 text-xs font-medium text-white rounded ${priority.color} transition-colors`}
                        title="Click to change priority"
                    >
                        {priority.label}
                    </button>
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            onDelete(task.id);
                        }}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:bg-red-100 rounded transition-all text-red-600"
                        title="Delete task"
                    >
                        <FiTrash2 size={14} />
                    </button>
                </div>
            </div>
        </div>
    );
}
