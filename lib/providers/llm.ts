import { getLlmConfig } from "./llm-config";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

export class LlmConfigError extends Error {
  constructor(message = "LLM_API_KEY is not configured. Add it to .env.local.") {
    super(message);
    this.name = "LlmConfigError";
  }
}

export function isLlmConfigured() {
  return Boolean(process.env.LLM_API_KEY?.trim());
}

function stripReasoning(raw: string) {
  return raw.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
}

export async function chatCompletion(messages: ChatMessage[], maxTokens = 2000) {
  const config = getLlmConfig();
  if (!config) throw new LlmConfigError();

  const models = [config.model, ...config.fallbacks];
  let lastError = "LLM request failed.";

  for (const model of models) {
    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.7,
        max_tokens: maxTokens,
      }),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = stripReasoning(data.choices?.[0]?.message?.content ?? "");
      if (!content) throw new Error("LLM returned an empty response.");
      return content;
    }

    const detail = await response.text();
    lastError = `LLM request failed (${response.status}): ${detail.slice(0, 400)}`;
    if (response.status !== 404) break;
  }

  throw new Error(lastError);
}

export async function parseJsonArray(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from the LLM.");
  return parsed.map(String).filter(Boolean);
}
