import Anthropic from "@anthropic-ai/sdk";
import { createChildLogger } from "@auto-blogger/core";

const logger = createChildLogger({ module: "content-pipeline:llm" });

let _client: Anthropic | null = null;

function getClient(): Anthropic {
  if (!_client) {
    _client = new Anthropic();
  }
  return _client;
}

export type ModelTier = "opus" | "sonnet";

const MODEL_MAP: Record<ModelTier, string> = {
  opus: "claude-opus-4-6",
  sonnet: "claude-sonnet-4-5-20250929",
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
};

export async function callLlm(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<LlmCallResult> {
  const client = getClient();
  const model = MODEL_MAP[tier];

  logger.debug({ model, systemLength: systemPrompt.length }, "Calling LLM");

  const response = await client.messages.create({
    model,
    max_tokens: options?.maxTokens ?? 8192,
    temperature: options?.temperature ?? 1,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const content = response.content
    .filter((block) => block.type === "text")
    .map((block) => block.text)
    .join("\n");

  const inputTokens = response.usage.input_tokens;
  const outputTokens = response.usage.output_tokens;
  const pricing = PRICING[model] ?? { input: 3, output: 15 };
  const cost =
    (inputTokens * pricing.input + outputTokens * pricing.output) / 1_000_000;

  logger.debug({ model, inputTokens, outputTokens, cost }, "LLM call complete");

  return { content, inputTokens, outputTokens, model, cost };
}

/**
 * Call LLM and parse JSON from the response.
 */
export async function callLlmJson<T>(
  tier: ModelTier,
  systemPrompt: string,
  userPrompt: string,
  options?: { maxTokens?: number; temperature?: number }
): Promise<{ data: T; cost: number; model: string }> {
  const result = await callLlm(tier, systemPrompt, userPrompt, options);

  // Extract JSON from response (handle markdown code blocks)
  const jsonMatch = result.content.match(/```(?:json)?\s*([\s\S]*?)```/);
  const jsonStr = jsonMatch ? jsonMatch[1].trim() : result.content.trim();

  try {
    const data = JSON.parse(jsonStr) as T;
    return { data, cost: result.cost, model: result.model };
  } catch (err) {
    logger.error(
      { response: result.content.slice(0, 500) },
      "Failed to parse JSON from LLM response"
    );
    throw new Error(`Failed to parse LLM JSON response: ${err}`);
  }
}
