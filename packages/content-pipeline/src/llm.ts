import Anthropic from "@anthropic-ai/sdk";
import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "content-pipeline:llm" });

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic({
      apiKey: process.env.ANTHROPIC_API_KEY || "unused",
    });
  }
  return _client;
}

export type ModelTier = "opus" | "sonnet";

type Provider = "anthropic" | "gemini";

const MODEL_MAP: Record<ModelTier, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
};

const GEMINI_MODEL_MAP: Record<ModelTier, string> = {
  sonnet: "gemini-2.0-flash",
  opus: "gemini-2.5-pro",
};

export interface LlmCallResult {
  content: string;
  inputTokens: number;
  outputTokens: number;
  model: string;
  cost: number;
}

// Rough pricing per 1M tokens (input/output)
const PRICING: Record<string, { input: number; output: number }> = {
  "claude-opus-4-6": { input: 15, output: 75 },
  "claude-sonnet-4-5-20250929": { input: 3, output: 15 },
  "gemini-2.0-flash": { input: 0.1, output: 0.4 },
  "gemini-2.5-pro": { input: 1.25, output: 5 },
};

function detectProvider(): Provider {
  if (process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_BASE_URL) return "anthropic";
  if (process.env.GEMINI_API_KEY) return "gemini";
  throw new Error(
    "No LLM provider found. Set ANTHROPIC_API_KEY, ANTHROPIC_BASE_URL, or GEMINI_API_KEY."
  );
}

async function callGemini(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<LlmCallResult> {
  const apiKey = process.env.GEMINI_API_KEY!;
  const model = GEMINI_MODEL_MAP[tier];
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  logger.debug({ model, systemLength: systemPrompt.length }, "Calling Gemini");

  const body = {
    system_instruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: "user", parts: [{ text: userPrompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 1,
      maxOutputTokens: options?.maxTokens ?? 8192,
    },
  };

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${text}`);
  }

  const data = (await response.json()) as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> };
    }>;
    usageMetadata?: {
      promptTokenCount?: number;
      candidatesTokenCount?: number;
    };
  };

  const content =
    data.candidates?.[0]?.content?.parts
      ?.map((p) => p.text ?? "")
      .join("\n") ?? "";

  const inputTokens = data.usageMetadata?.promptTokenCount ?? 0;
  const outputTokens = data.usageMetadata?.candidatesTokenCount ?? 0;
  const pricing = PRICING[model] ?? { input: 1, output: 5 };
  const cost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  logger.debug({ model, inputTokens, outputTokens, cost }, "Gemini call complete");

  return { content, inputTokens, outputTokens, model, cost };
}

export async function callLlm(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number; prefill?: string }
): Promise<LlmCallResult> {
  const provider = detectProvider();

  if (provider === "gemini") {
    return callGemini(tier, systemPrompt, userPrompt, options);
  }

  const client = getClient();
  const model = MODEL_MAP[tier];

  logger.debug({ model, systemLength: systemPrompt.length }, "Calling LLM");

  const messages: Array<{ role: "user" | "assistant"; content: string }> = [
    { role: "user", content: userPrompt },
  ];

  // Prefill forces the model to continue from a specific starting point
  if (options?.prefill) {
    messages.push({ role: "assistant", content: options.prefill });
  }

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens ?? 8192,
    temperature: options?.temperature ?? 1,
    system: systemPrompt,
    messages,
  });

  const rawContent = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  // Prepend the prefill to reconstruct the full response
  const content = options?.prefill ? options.prefill + rawContent : rawContent;

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const pricing = PRICING[model] ?? { input: 3, output: 15 };
  const cost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  logger.debug({ model, inputTokens, outputTokens, cost }, "LLM call complete");

  return { content, inputTokens, outputTokens, model, cost };
}

/**
 * Parse JSON, handling trailing non-JSON content that LLMs sometimes append.
 * If strict JSON.parse fails, extract just the JSON object by tracking brace depth.
 */
function parseJsonPermissive(str: string): unknown {
  try {
    return JSON.parse(str);
  } catch (err) {
    // Try to find the end of the JSON object by tracking brace depth
    if (str.startsWith("{")) {
      let depth = 0;
      let inString = false;
      let escaped = false;
      for (let i = 0; i < str.length; i++) {
        const ch = str[i];
        if (escaped) {
          escaped = false;
          continue;
        }
        if (ch === "\\") {
          escaped = true;
          continue;
        }
        if (ch === '"') {
          inString = !inString;
          continue;
        }
        if (inString) continue;
        if (ch === "{") depth++;
        else if (ch === "}") {
          depth--;
          if (depth === 0) {
            const truncated = str.slice(0, i + 1);
            return JSON.parse(truncated);
          }
        }
      }
    }
    throw err;
  }
}

/**
 * If the parsed JSON is an object with a single key whose value is also an object,
 * unwrap it. LLMs often wrap responses in a container like {"research_brief": {...}}.
 */
function unwrapSingleKeyObject(data: unknown): unknown {
  if (data && typeof data === "object" && !Array.isArray(data)) {
    const keys = Object.keys(data as Record<string, unknown>);
    if (keys.length === 1) {
      const inner = (data as Record<string, unknown>)[keys[0]];
      if (inner && typeof inner === "object" && !Array.isArray(inner)) {
        return inner;
      }
    }
  }
  return data;
}

/**
 * Call LLM and parse JSON from the response.
 * Retries up to 2 times on empty content or JSON parse failures.
 */
export async function callLlmJson<T>(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<{ data: T; cost: number; model: string }> {
  const maxRetries = 2;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const result = await callLlm(tier, systemPrompt, userPrompt, {
      ...options,
      prefill: "{",
    });

    // Retry on empty content
    if (!result.content.trim()) {
      if (attempt < maxRetries) {
        logger.warn(
          { attempt: attempt + 1, maxRetries },
          "LLM returned empty content, retrying"
        );
        continue;
      }
      throw new Error("LLM returned empty content after all retries");
    }

    // Extract JSON from response (handle markdown code blocks)
    const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
    const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.content.trim();

    logger.info(
      { attempt: attempt + 1, rawLength: result.content.length, jsonLength: jsonStr.length, usedCodeBlock: !!jsonMatch, preview: jsonStr.slice(0, 300) },
      "Extracted JSON from LLM response"
    );

    try {
      let data = parseJsonPermissive(jsonStr);
      // Unwrap if the LLM nested the response under a single key
      data = unwrapSingleKeyObject(data);
      return { data: data as T, cost: result.cost, model: result.model };
    } catch (err) {
      if (attempt < maxRetries) {
        logger.warn(
          { attempt: attempt + 1, maxRetries, parseError: String(err) },
          "Failed to parse JSON from LLM response, retrying"
        );
        continue;
      }
      logger.error(
        { response: result.content.slice(0, 500) },
        "Failed to parse JSON from LLM response after all retries"
      );
      throw new Error(`Failed to parse LLM JSON response: ${err}`);
    }
  }

  // Unreachable, but TypeScript needs it
  throw new Error("callLlmJson: unexpected exit from retry loop");
}
