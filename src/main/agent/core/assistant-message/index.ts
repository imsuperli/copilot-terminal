export interface ParsedAssistantSections {
  reasoning: string;
  response: string;
}

const THINKING_TAGS = ['thinking', 'reasoning', 'analysis'];

function stripTaggedSections(content: string): string {
  return THINKING_TAGS.reduce((current, tag) => (
    current.replace(new RegExp(`<${tag}>[\\s\\S]*?<\\/${tag}>`, 'gi'), '')
  ), content);
}

function collectTaggedSections(content: string): string {
  const sections: string[] = [];

  for (const tag of THINKING_TAGS) {
    const pattern = new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`, 'gi');
    let match: RegExpExecArray | null;
    while ((match = pattern.exec(content)) !== null) {
      const value = match[1]?.trim();
      if (value) {
        sections.push(value);
      }
    }
  }

  return sections.join('\n\n').trim();
}

export function parseAssistantSections(content: string): ParsedAssistantSections {
  const reasoning = collectTaggedSections(content);
  const response = stripTaggedSections(content).trim();

  return {
    reasoning,
    response,
  };
}
