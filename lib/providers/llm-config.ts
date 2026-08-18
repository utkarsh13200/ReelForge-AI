/**
 * Resolve LLM API base URL and default model from env + key prefix.
 */
export function getLlmConfig() {
  const apiKey = process.env.LLM_API_KEY?.trim() ?? "";
  if (!apiKey) return null;

  let baseUrl = process.env.LLM_API_BASE_URL?.trim();
  let model = process.env.LLM_MODEL?.trim();

  if (!baseUrl) {
    if (apiKey.startsWith("gsk_")) {
      baseUrl = "https://api.groq.com/openai/v1";
    } else {
      baseUrl = "https://api.openai.com/v1";
    }
  }

  const onGroq = apiKey.startsWith("gsk_") || baseUrl.includes("groq.com");

  /** Groq retired llama-3.3-70b-versatile on this account — these still work. */
  const groqFallbacks = [
    "openai/gpt-oss-20b",
    "qwen/qwen3.6-27b",
    "openai/gpt-oss-120b",
    "groq/compound-mini",
  ];

  if (!model || (onGroq && (model.startsWith("gpt-") || model.startsWith("llama-")))) {
    model = onGroq ? groqFallbacks[0] : "gpt-4o-mini";
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    fallbacks: onGroq ? groqFallbacks.filter((item) => item !== model) : [],
  };
}
