// Natural Language Processing for tasks
export interface ParsedTask {
  content: string;
  dueString?: string;
  priority?: number;
}

// Parse natural language into task data
export function parseTaskText(text: string): ParsedTask | null {
  if (!text.trim()) return null;

  const lowerText = text.toLowerCase().trim();

  // Extract title (everything before time/date indicators)
  let content = text;
  const timeIndicators = /\b(at|on|every|tomorrow|today|next|this|due)\b/i;
  const match = text.match(timeIndicators);
  if (match && match.index) {
    content = text.substring(0, match.index).trim();
  }

  // Extract due date string (Todoist understands natural language)
  let dueString: string | undefined;
  if (match && match.index) {
    dueString = text.substring(match.index).trim();
  }

  // Extract priority from keywords
  let priority = 1; // Default priority (p4 in Todoist)
  if (lowerText.includes('urgent') || lowerText.includes('important') || lowerText.includes('!!!')) {
    priority = 4; // p1 - highest
    content = content.replace(/urgent|important|!!!/gi, '').trim();
  } else if (lowerText.includes('high priority') || lowerText.includes('!!')) {
    priority = 3; // p2
    content = content.replace(/high priority|!!/gi, '').trim();
  } else if (lowerText.includes('medium priority') || lowerText.includes('!')) {
    priority = 2; // p3
    content = content.replace(/medium priority|!/gi, '').trim();
  }

  return {
    content: content || 'Untitled Task',
    dueString,
    priority,
  };
}

// Get suggestions for partial input
export function getTaskSuggestions(text: string): string[] {
  const suggestions: string[] = [];
  const lowerText = text.toLowerCase();

  if (lowerText.includes('every') || lowerText.includes('recurring')) {
    suggestions.push(
      'Review notes every monday',
      'Team meeting every friday at 2pm',
      'Weekly report every week'
    );
  } else if (lowerText.includes('tomorrow') || lowerText.includes('today')) {
    suggestions.push(
      'Finish report tomorrow',
      'Call client today at 3pm',
      'Submit proposal tomorrow'
    );
  } else if (lowerText.includes('urgent') || lowerText.includes('important')) {
    suggestions.push(
      'Urgent: Fix bug today',
      'Important: Review PR tomorrow'
    );
  } else {
    suggestions.push(
      'Finish report tomorrow',
      'Team meeting every monday at 10am',
      'Urgent: Review code today',
      'Call client next week'
    );
  }

  return suggestions;
}
