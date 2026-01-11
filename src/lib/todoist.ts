'use client';

import { auth, rtdb } from './firebase';
import { ref, get, set } from 'firebase/database';

// Todoist API integration for task management
export interface TodoistTask {
  id: string;
  content: string;
  description?: string;
  due?: {
    date: string;
    datetime?: string;
    string?: string;
    timezone?: string;
    recurring?: boolean;
    is_recurring?: boolean; // Todoist API uses snake_case
  };
  priority: number;
  labels?: string[];
  projectId?: string;
  isCompleted?: boolean;
  createdAt?: string;
}

const TODOIST_API_BASE = 'https://api.todoist.com/rest/v2';

async function getTodoistToken(): Promise<string | null> {
  const user = auth.currentUser;
  if (!user) return null;
  try {
    // Store in same location as AI API key for consistency
    const tokenRef = ref(rtdb, `users/${user.uid}/settings/todoistApiKey`);
    const snapshot = await get(tokenRef);
    return snapshot.exists() ? snapshot.val() : null;
  } catch (error) {
    console.error('Error getting Todoist token:', error);
    return null;
  }
}

export async function storeTodoistToken(token: string): Promise<void> {
  const user = auth.currentUser;
  if (!user) throw new Error('User not authenticated');
  // Store in same location as AI API key for consistency
  const tokenRef = ref(rtdb, `users/${user.uid}/settings/todoistApiKey`);
  await set(tokenRef, token);
}

export async function hasTodoistAccess(): Promise<boolean> {
  const token = await getTodoistToken();
  if (!token) return false;
  try {
    const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    return response.ok;
  } catch {
    return false;
  }
}

export async function getTasks(filter?: string): Promise<TodoistTask[]> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const url = filter
    ? `${TODOIST_API_BASE}/tasks?filter=${encodeURIComponent(filter)}`
    : `${TODOIST_API_BASE}/tasks`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch tasks');
  return response.json();
}

export async function getTask(taskId: string): Promise<TodoistTask> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to fetch task');
  return response.json();
}

export async function createTask(task: {
  content: string;
  description?: string;
  due_string?: string;
  due_date?: string;
  priority?: number;
  labels?: string[];
}): Promise<TodoistTask> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const response = await fetch(`${TODOIST_API_BASE}/tasks`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(task),
  });
  if (!response.ok) {
    const error = await response.text();
    throw new Error(`Failed to create task: ${error}`);
  }
  return response.json();
}

export async function updateTask(
  taskId: string,
  updates: Partial<{
    content: string;
    description: string;
    due_string: string;
    priority: number;
    labels: string[];
  }>
): Promise<TodoistTask> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(updates),
  });
  if (!response.ok) throw new Error('Failed to update task');
  return response.json();
}

export async function completeTask(taskId: string): Promise<void> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}/close`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to complete task');
}

export async function deleteTask(taskId: string): Promise<void> {
  const token = await getTodoistToken();
  if (!token) throw new Error('No Todoist token available');
  const response = await fetch(`${TODOIST_API_BASE}/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) throw new Error('Failed to delete task');
}
