import type { LLMProviderConfig, LLMProviderWireApi } from '../types/chat';

export function inferOpenAICompatibleWireApi(baseUrl?: string): LLMProviderWireApi | null {
  const normalizedBaseUrl = baseUrl?.trim().toLowerCase();
  if (!normalizedBaseUrl) {
    return null;
  }

  // Codex-style gateways commonly expose a /codex base path and speak the Responses API.
  if (normalizedBaseUrl.includes('/codex')) {
    return 'responses';
  }

  return null;
}

export function resolveLLMProviderWireApi(
  provider: Pick<LLMProviderConfig, 'type' | 'wireApi' | 'baseUrl'>,
): LLMProviderWireApi | null {
  if (provider.type !== 'openai-compatible') {
    return null;
  }

  const inferredWireApi = inferOpenAICompatibleWireApi(provider.baseUrl);
  if (inferredWireApi === 'responses') {
    return inferredWireApi;
  }

  return provider.wireApi ?? 'chat-completions';
}
