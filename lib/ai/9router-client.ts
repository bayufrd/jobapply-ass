import OpenAI from "openai";

let cachedClient: OpenAI | null = null;

function getBaseUrl() {
  const baseUrl = process.env.NINE_ROUTER_BASE_URL?.trim();

  if (!baseUrl) {
    throw new Error("NINE_ROUTER_BASE_URL is not configured.");
  }

  return baseUrl;
}

function getApiKey() {
  const apiKey = process.env.NINE_ROUTER_API_KEY?.trim();

  if (!apiKey) {
    throw new Error("NINE_ROUTER_API_KEY is not configured.");
  }

  return apiKey;
}

export function getNineRouterClient() {
  if (!cachedClient) {
    cachedClient = new OpenAI({
      apiKey: getApiKey(),
      baseURL: getBaseUrl(),
    });
  }

  return cachedClient;
}

export function getNineRouterChatModel() {
  const model = process.env.NINE_ROUTER_CHAT_MODEL?.trim();

  if (!model) {
    throw new Error("NINE_ROUTER_CHAT_MODEL is not configured.");
  }

  return model;
}

export function getNineRouterEmbeddingModel() {
  return process.env.NINE_ROUTER_EMBEDDING_MODEL?.trim() || "";
}
