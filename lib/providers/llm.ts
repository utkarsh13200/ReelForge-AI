import { getLlmConfig } from "./llm-config";

type ChatMessage = { role: "system" | "user" | "assistant"; content: string };

type LlmChoiceMessage = {
  content?: string | Array<{ type?: string; text?: string }>;
  reasoning?: string;
};

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
  return raw
    .replace(/<think>[\s\S]*?<\/think>/gi, "")
    .replace(/<reasoning>[\s\S]*?<\/reasoning>/gi, "")
    .trim();
}

function extractMessageText(message: LlmChoiceMessage | undefined): string {
  if (!message) return "";
  const raw = message.content;
  let text = "";
  if (typeof raw === "string") {
    text = raw;
  } else if (Array.isArray(raw)) {
    text = raw
      .map((part) => (typeof part?.text === "string" ? part.text : ""))
      .join("");
  }
  const stripped = stripReasoning(text);
  if (stripped) return stripped;
  // Some providers put the whole answer inside think tags with nothing after.
  if (text.trim()) {
    const unwrapped = text
      .replace(/<\/?think>/gi, "")
      .replace(/<\/?reasoning>/gi, "")
      .trim();
    if (unwrapped) return unwrapped;
  }
  return "";
}

function isReasoningModel(model: string) {
  return /gpt-oss|qwen3|reasoning|o1|o3|o4/i.test(model);
}

export async function chatCompletion(messages: ChatMessage[], maxTokens = 2000) {
  const config = getLlmConfig();
  if (!config) throw new LlmConfigError();

  const models = [config.model, ...config.fallbacks];
  let lastError = "LLM request failed.";

  for (const model of models) {
    const reasoning = isReasoningModel(model);
    // Reasoning models spend completion budget on hidden thought tokens first.
    // Groq's gpt-oss often returns HTTP 200 with empty content when the budget is too small.
    const tokenBudget = reasoning ? Math.max(maxTokens, 4096) : maxTokens;
    const body: Record<string, unknown> = {
      model,
      messages,
      temperature: 0.7,
      max_tokens: tokenBudget,
      max_completion_tokens: tokenBudget,
    };
    if (reasoning) {
      // Prefer the final answer only — avoids empty `content` when reasoning fills the budget.
      body.include_reasoning = false;
      body.reasoning_effort = "low";
    }

    const response = await fetch(`${config.baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
    });

    if (response.ok) {
      const data = (await response.json()) as {
        choices?: Array<{
          message?: LlmChoiceMessage;
          finish_reason?: string;
        }>;
      };
      const choice = data.choices?.[0];
      const content = extractMessageText(choice?.message);
      if (content) return content;

      lastError =
        choice?.finish_reason === "length"
          ? `LLM used all tokens on reasoning (${model}). Trying another model…`
          : `LLM returned an empty response (${model}).`;
      // Try the next fallback instead of failing the whole job on one reasoning model.
      continue;
    }

    const detail = await response.text();
    lastError = `LLM request failed (${response.status}): ${detail.slice(0, 400)}`;
    // Unknown params (include_reasoning) on non-Groq hosts — retry without extras once.
    if (response.status === 400 && /include_reasoning|reasoning_effort|max_completion/i.test(detail)) {
      const plain = await fetch(`${config.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages,
          temperature: 0.7,
          max_tokens: tokenBudget,
        }),
      });
      if (plain.ok) {
        const data = (await plain.json()) as {
          choices?: Array<{ message?: LlmChoiceMessage }>;
        };
        const content = extractMessageText(data.choices?.[0]?.message);
        if (content) return content;
      }
    }
    if (response.status !== 404 && response.status !== 400) break;
  }

  throw new Error(lastError || "LLM returned an empty response.");
}

export async function parseJsonArray(raw: string) {
  const cleaned = raw.replace(/```json|```/g, "").trim();
  const parsed = JSON.parse(cleaned) as unknown;
  if (!Array.isArray(parsed)) throw new Error("Expected a JSON array from the LLM.");
  return parsed.map(String).filter(Boolean);
}
