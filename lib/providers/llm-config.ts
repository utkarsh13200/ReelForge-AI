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

  /**
   * Prefer non-reasoning chat models first — gpt-oss often returns empty `content`
   * after spending the token budget on hidden reasoning.
   */
  const groqFallbacks = [
    "llama-3.1-8b-instant",
    "llama-3.3-70b-versatile",
    "meta-llama/llama-4-scout-17b-16e-instruct",
    "qwen/qwen3-32b",
    "openai/gpt-oss-20b",
    "groq/compound-mini",
  ];

  // OpenAI-style model ids (gpt-4o-mini) do not work on Groq.
  if (!model || (onGroq && /^gpt-/.test(model))) {
    model = onGroq ? groqFallbacks[0] : "gpt-4o-mini";
  }

  // Old .env.example default — gpt-oss often returns empty content on short budgets.
  if (onGroq && /gpt-oss/i.test(model)) {
    model = groqFallbacks[0];
  }

  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/$/, ""),
    model,
    fallbacks: onGroq ? groqFallbacks.filter((item) => item !== model) : [],
  };
}
