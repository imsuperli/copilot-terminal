import type { AgentTaskSnapshot } from '../../shared/types/agent';
import type { TaskPlanItem } from '../../shared/types/task';

function normalizePlanText(value: string): string {
  return value.replace(/^\s*[-*]\s*/, '').replace(/^\s*\d+[.)]\s*/, '').trim();
}

function extractChecklistLines(value: string): string[] {
  return value
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^([-*]|\d+[.)])\s+/.test(line))
    .map(normalizePlanText)
    .filter(Boolean);
}

export function extractTaskPlan(input: {
  assistantMessages: string[];
  agent?: AgentTaskSnapshot;
}): { items: TaskPlanItem[]; source?: string; updatedAt?: string } {
  const items: TaskPlanItem[] = [];
  const seen = new Set<string>();

  for (const message of input.assistantMessages) {
    for (const line of extractChecklistLines(message)) {
      if (seen.has(line)) {
        continue;
      }
      seen.add(line);
      items.push({
        id: `plan-${items.length + 1}`,
        text: line,
        status: 'pending',
        source: 'assistant-message',
        order: items.length,
      });
    }
  }

  const updatedAt = input.agent?.updatedAt;
  if (input.agent?.status === 'completed' && items.length > 0) {
    items[items.length - 1] = {
      ...items[items.length - 1],
      status: 'completed',
      updatedAt,
    };
  } else if (input.agent?.status === 'running' && items.length > 0) {
    items[0] = {
      ...items[0],
      status: 'running',
      updatedAt,
    };
  }

  return {
    items,
    source: items.length > 0 ? 'assistant-message' : undefined,
    updatedAt,
  };
}
