// Custom LLM provider registry: metadata lives in localStorage (non-secret),
// each provider's API key lives client-side only, under its own storage key.
export type ProviderType = 'openai_compatible' | 'claude_compatible';

export interface ProviderConfig {
  id: string;
  name: string;
  type: ProviderType;
  baseUrl: string;
}

const PROVIDERS_KEY = 'chatbranch_providers';
const providerKeyStorageKey = (id: string) => `chatbranch_provider_key_${id}`;

export function loadProviders(): ProviderConfig[] {
  try {
    const raw = localStorage.getItem(PROVIDERS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (e) {
    return [];
  }
}

export function saveProviders(providers: ProviderConfig[]): void {
  try {
    localStorage.setItem(PROVIDERS_KEY, JSON.stringify(providers));
  } catch (e) {
    // ignore
  }
}

export function getProviderKey(id: string): string {
  const key = providerKeyStorageKey(id);
  return sessionStorage.getItem(key) || localStorage.getItem(key) || '';
}

export function setProviderKey(id: string, apiKey: string, persist: boolean): void {
  const key = providerKeyStorageKey(id);
  if (!apiKey) {
    sessionStorage.removeItem(key);
    localStorage.removeItem(key);
    return;
  }
  if (persist) {
    localStorage.setItem(key, apiKey);
    sessionStorage.removeItem(key);
  } else {
    sessionStorage.setItem(key, apiKey);
    localStorage.removeItem(key);
  }
}

export function clearProviderKey(id: string): void {
  const key = providerKeyStorageKey(id);
  sessionStorage.removeItem(key);
  localStorage.removeItem(key);
}

// A custom-provider model is encoded as "{providerId}::{modelName}".
export function isCustomProviderModel(model: string): boolean {
  return typeof model === 'string' && model.includes('::');
}

export function buildCustomProviderModel(providerId: string, modelName: string): string {
  return `${providerId}::${modelName}`;
}

export interface ResolvedModelFields {
  llm_model: string;
  provider_type?: ProviderType;
  provider_base_url?: string;
  client_api_key?: string;
}

/**
 * Resolves the fields to send with an LLM request for the given selected model string.
 * Falls back to the existing OpenRouter client-key behavior for plain (non-custom-provider) models.
 */
export function resolveModelRequestFields(model: string): ResolvedModelFields {
  if (isCustomProviderModel(model)) {
    const [providerId, ...rest] = model.split('::');
    const modelName = rest.join('::');
    const provider = loadProviders().find(p => p.id === providerId);
    if (provider) {
      return {
        llm_model: modelName,
        provider_type: provider.type,
        provider_base_url: provider.baseUrl,
        client_api_key: getProviderKey(provider.id) || undefined
      };
    }
  }

  const clientKey = sessionStorage.getItem('chatbranch_api_key') || localStorage.getItem('chatbranch_api_key') || undefined;
  return { llm_model: model, client_api_key: clientKey };
}
