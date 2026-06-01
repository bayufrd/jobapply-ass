import OpenAI from "openai";
import {
  assertNineRouterConfigured,
  getNineRouterChatModelOrThrow,
  getNineRouterConfig,
  getNineRouterEmbeddingModelOrThrow,
} from "@/lib/ai/9router-config";

let cachedClient: OpenAI | null = null;
let cachedBaseUrl = "";
let cachedApiKey = "";

export function getNineRouterClient() {
  const config = assertNineRouterConfigured();

  if (!cachedClient || cachedBaseUrl !== config.apiBaseUrl || cachedApiKey !== config.apiKey) {
    cachedBaseUrl = config.apiBaseUrl;
    cachedApiKey = config.apiKey;
    cachedClient = new OpenAI({
      apiKey: config.apiKey,
      baseURL: config.apiBaseUrl,
    });
  }

  return cachedClient;
}

export function getNineRouterChatModel() {
  return getNineRouterChatModelOrThrow();
}

export function getNineRouterEmbeddingModel() {
  return getNineRouterEmbeddingModelOrThrow();
}

export function getNineRouterApiBaseUrl() {
  return assertNineRouterConfigured().apiBaseUrl;
}

export function getNineRouterRootUrl() {
  return assertNineRouterConfigured().rootUrl;
}

export function getNineRouterRuntimeConfig() {
  return getNineRouterConfig();
}
