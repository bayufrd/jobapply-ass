const CONFIG_ERROR_MESSAGE =
  "Konfigurasi 9router belum lengkap. Pastikan NINEROUTER_URL dan NINEROUTER_KEY sudah diisi di file .env.";

const MODEL_ERROR_MESSAGE =
  "Model 9router belum dipilih. Isi NINEROUTER_CHAT_MODEL atau NINE_ROUTER_CHAT_MODEL di file .env.";

type NineRouterConfig = {
  rootUrl: string;
  apiBaseUrl: string;
  apiKey: string;
  chatModel: string;
  embeddingModel: string;
  isConfigured: boolean;
  missingFields: string[];
};

function firstEnvValue(...keys: string[]) {
  for (const key of keys) {
    const value = process.env[key]?.trim();

    if (value) {
      return value;
    }
  }

  return "";
}

function stripTrailingSlashes(value: string) {
  return value.replace(/\/+$/, "");
}

function normalizeRootUrl(baseUrl: string) {
  const sanitized = stripTrailingSlashes(baseUrl.trim());

  if (sanitized.toLowerCase().endsWith("/v1")) {
    return sanitized.slice(0, -3);
  }

  return sanitized;
}

export function getNineRouterConfig(): NineRouterConfig {
  const rawUrl = firstEnvValue("NINEROUTER_URL", "NINE_ROUTER_BASE_URL");
  const apiKey = firstEnvValue("NINEROUTER_KEY", "NINE_ROUTER_API_KEY");
  const chatModel = firstEnvValue("NINEROUTER_CHAT_MODEL", "NINE_ROUTER_CHAT_MODEL");
  const embeddingModel = firstEnvValue(
    "NINEROUTER_EMBEDDING_MODEL",
    "NINE_ROUTER_EMBEDDING_MODEL",
  );

  const missingFields: string[] = [];

  if (!rawUrl) {
    missingFields.push("NINEROUTER_URL");
  }

  if (!apiKey) {
    missingFields.push("NINEROUTER_KEY");
  }

  if (!chatModel) {
    missingFields.push("NINEROUTER_CHAT_MODEL");
  }

  const rootUrl = rawUrl ? normalizeRootUrl(rawUrl) : "";
  const apiBaseUrl = rootUrl ? `${rootUrl}/v1` : "";

  return {
    rootUrl,
    apiBaseUrl,
    apiKey,
    chatModel,
    embeddingModel,
    isConfigured: missingFields.length === 0,
    missingFields,
  };
}

export function assertNineRouterConfigured() {
  const config = getNineRouterConfig();

  if (!config.rootUrl || !config.apiKey) {
    throw new Error(CONFIG_ERROR_MESSAGE);
  }

  return config;
}

export function getNineRouterChatModelOrThrow() {
  const { chatModel } = getNineRouterConfig();

  if (!chatModel) {
    throw new Error(MODEL_ERROR_MESSAGE);
  }

  return chatModel;
}

export function getNineRouterEmbeddingModelOrThrow() {
  const { embeddingModel } = getNineRouterConfig();

  if (!embeddingModel) {
    throw new Error(
      "Model embedding 9router belum dipilih. Isi NINEROUTER_EMBEDDING_MODEL atau NINE_ROUTER_EMBEDDING_MODEL di file .env.",
    );
  }

  return embeddingModel;
}

export { CONFIG_ERROR_MESSAGE as NINE_ROUTER_CONFIG_ERROR_MESSAGE, MODEL_ERROR_MESSAGE as NINE_ROUTER_MODEL_ERROR_MESSAGE };
