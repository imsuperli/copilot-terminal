import { describe, expect, it } from 'vitest';
import {
  inferOpenAICompatibleWireApi,
  resolveLLMProviderWireApi,
} from '../chatProvider';

describe('chatProvider utils', () => {
  it('infers the responses API for codex-style gateways', () => {
    expect(inferOpenAICompatibleWireApi('https://api.example.com/api/codex/backend-api/codex'))
      .toBe('responses');
  });

  it('prefers the inferred responses API over a stale chat-completions setting', () => {
    expect(resolveLLMProviderWireApi({
      type: 'openai-compatible',
      baseUrl: 'https://api.example.com/api/codex/backend-api/codex',
      wireApi: 'chat-completions',
    })).toBe('responses');
  });
});
