import { v4 as uuidv4 } from 'uuid';
import type { AgentInteractionType } from '../../../../shared/types/agentTimeline';

export interface InteractionRequest {
  interactionId: string;
  commandId: string;
  interactionType: AgentInteractionType;
  prompt: string;
  options?: string[];
  submitLabel?: string;
  secret?: boolean;
}

const QUICK_PATTERNS: Array<{
  pattern: RegExp;
  interactionType: AgentInteractionType;
  submitLabel?: string;
  secret?: boolean;
}> = [
  { pattern: /\[sudo\]\s*password\s+for[^\n]*$/i, interactionType: 'password', secret: true },
  { pattern: /password\s*:[^\n]*$/i, interactionType: 'password', secret: true },
  { pattern: /passphrase\s*:[^\n]*$/i, interactionType: 'password', secret: true },
  { pattern: /\[Y\/n\][^\n]*$/i, interactionType: 'confirm', submitLabel: 'Confirm' },
  { pattern: /\[y\/N\][^\n]*$/i, interactionType: 'confirm', submitLabel: 'Confirm' },
  { pattern: /\(yes\/no\)[^\n]*$/i, interactionType: 'confirm', submitLabel: 'Confirm' },
  { pattern: /press enter[^\n]*$/i, interactionType: 'enter', submitLabel: 'Continue' },
  { pattern: /press any key[^\n]*$/i, interactionType: 'enter', submitLabel: 'Continue' },
  { pattern: /--More--\s*$/i, interactionType: 'pager', submitLabel: 'Send key' },
  { pattern: /\(END\)\s*$/i, interactionType: 'pager', submitLabel: 'Send key' },
];

function stripAnsi(text: string): string {
  return text
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\x1B\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\r/g, '');
}

export class InteractionDetector {
  private buffer = '';
  private lastFingerprint = '';

  feed(commandId: string, chunk: string): InteractionRequest | null {
    this.buffer = `${this.buffer}${stripAnsi(chunk)}`.slice(-4000);
    const candidate = this.buffer.split('\n').slice(-3).join('\n').trim();

    if (!candidate) {
      return null;
    }

    for (const rule of QUICK_PATTERNS) {
      if (!rule.pattern.test(candidate)) {
        continue;
      }

      const fingerprint = `${rule.interactionType}:${candidate}`;
      if (fingerprint === this.lastFingerprint) {
        return null;
      }

      this.lastFingerprint = fingerprint;
      return {
        interactionId: uuidv4(),
        commandId,
        interactionType: rule.interactionType,
        prompt: candidate,
        submitLabel: rule.submitLabel,
        secret: rule.secret,
      };
    }

    return null;
  }

  clearPromptCache(): void {
    this.lastFingerprint = '';
  }
}
