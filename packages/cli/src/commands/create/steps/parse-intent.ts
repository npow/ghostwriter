import type { Ora } from "ora";
import { callLlmJson } from "@auto-blogger/content-pipeline";
import type { CreateContext, ParsedIntent } from "../types.js";
import {
  INTENT_PARSING_SYSTEM,
  buildIntentParsingPrompt,
} from "../prompts/intent-parsing.js";

export async function parseIntent(
  ctx: CreateContext,
  spinner: Ora
): Promise<ParsedIntent> {
  spinner.start("Parsing intent from description...");

  const { data, cost } = await callLlmJson<ParsedIntent>(
    "sonnet",
    INTENT_PARSING_SYSTEM,
    buildIntentParsingPrompt(ctx.rawDescription),
    { temperature: 0.3 }
  );

  ctx.totalCost += cost;

  // Ensure channelId is valid kebab-case
  data.channelId = data.channelId
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  spinner.succeed(
    `Parsed: "${data.channelName}" (${data.contentType}) — ${data.topic.domain}`
  );

  return data;
}
