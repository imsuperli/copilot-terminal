import type { ChatMessage } from '../../../../shared/types/chat';

const MAX_CONTEXT_CHARS = 24_000;

function summarizeMessage(message: ChatMessage): string {
  const prefix = message.role === 'assistant'
    ? 'assistant'
    : message.role === 'system'
      ? 'system'
      : message.toolResult
        ? 'tool'
        : 'user';
  const body = message.toolResult?.content || message.content;
  const compact = body.replace(/\s+/g, ' ').trim();
  return `${prefix}: ${compact.slice(0, 360)}`;
}

export class ContextManager {
  private messages: ChatMessage[];

  constructor(seedMessages: ChatMessage[] = []) {
    this.messages = [...seedMessages];
  }

  getMessages(): ChatMessage[] {
    return [...this.messages];
  }

  replaceMessages(messages: ChatMessage[]): void {
    this.messages = [...messages];
  }

  appendMessage(message: ChatMessage): void {
    this.messages.push(message);
  }

  maybeCompact(): string | undefined {
    const totalChars = this.messages.reduce((sum, message) => (
      sum + message.content.length + (message.toolResult?.content.length ?? 0)
    ), 0);

    if (totalChars <= MAX_CONTEXT_CHARS || this.messages.length < 6) {
      return undefined;
    }

    const cutIndex = Math.max(2, Math.floor(this.messages.length / 2));
    const compacted = this.messages.slice(0, cutIndex);
    const remaining = this.messages.slice(cutIndex);
    const summary = [
      '历史上下文摘要：',
      ...compacted.map(summarizeMessage),
    ].join('\n');

    this.messages = [{
      id: `context-summary-${Date.now()}`,
      role: 'system',
      content: summary,
      timestamp: new Date().toISOString(),
    }, ...remaining];

    return summary;
  }
}
