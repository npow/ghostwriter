import type { Ora } from "ora";
import { callLlmJson } from "@auto-blogger/content-pipeline";
import { AI_PHRASE_BLACKLIST } from "@auto-blogger/core";
import { formatStyleProfile } from "@auto-blogger/style-fingerprint";
import type { CreateContext, GeneratedVoice } from "../types.js";
import {
  VOICE_GENERATION_SYSTEM,
  buildVoiceGenerationPrompt,
} from "../prompts/voice-generation.js";

export async function generateVoice(
  ctx: CreateContext,
  spinner: Ora
): Promise<GeneratedVoice> {
  spinner.start("Generating voice persona...");

  const intent = ctx.intent!;

  // Build style profile text for the prompt
  let styleProfileText = "No style profile available — use the tone description.";
  if (ctx.styleProfile) {
    styleProfileText = formatStyleProfile(ctx.styleProfile, "prompt");
  }

  // Include style reference names as additional context
  const nameRefs = intent.styleReferences.filter(
    (ref) => !ref.startsWith("http")
  );
  if (nameRefs.length > 0) {
    styleProfileText += `\n\nThe writing style should be inspired by: ${nameRefs.join(", ")}`;
  }

  // Use a subset of the blacklist for the prompt (top 20 most common)
  const forbiddenSample = AI_PHRASE_BLACKLIST.slice(0, 20);

  const { data, cost } = await callLlmJson<GeneratedVoice>(
    "sonnet",
    VOICE_GENERATION_SYSTEM,
    buildVoiceGenerationPrompt(
      intent.toneDescription,
      intent.topic.domain,
      styleProfileText,
      forbiddenSample
    ),
    { temperature: 0.7 }
  );

  ctx.totalCost += cost;

  // Ensure forbidden list includes the full blacklist
  const existingForbidden = new Set(
    data.vocabulary.forbidden.map((w) => w.toLowerCase())
  );
  for (const phrase of AI_PHRASE_BLACKLIST) {
    if (!existingForbidden.has(phrase.toLowerCase())) {
      data.vocabulary.forbidden.push(phrase);
    }
  }

  spinner.succeed(`Voice: ${data.name} — ${data.tone} tone`);

  return data;
}
