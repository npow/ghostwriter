import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Ora } from "ora";
import { callLlm } from "@auto-blogger/content-pipeline";
import { getChannelsDir } from "@auto-blogger/core";
import type { CreateContext } from "../types.js";
import {
  EXAMPLE_ARTICLE_SYSTEM,
  buildExampleArticlePrompt,
} from "../prompts/example-article.js";

export async function generateExample(
  ctx: CreateContext,
  spinner: Ora
): Promise<void> {
  spinner.start("Generating sample article...");

  const intent = ctx.intent!;
  const voice = ctx.voice!;

  const result = await callLlm(
    "sonnet",
    EXAMPLE_ARTICLE_SYSTEM,
    buildExampleArticlePrompt(
      intent.channelName,
      intent.contentType,
      intent.topic.focus,
      voice.name,
      voice.persona,
      voice.verbalTics ?? [],
      voice.vocabulary.preferred,
      voice.vocabulary.forbidden.slice(0, 30), // Don't overwhelm the prompt
      voice.tone
    ),
    { temperature: 0.8, maxTokens: 2048 }
  );

  ctx.totalCost += result.cost;

  if (ctx.options.dryRun) {
    spinner.succeed(
      `Sample article generated (${result.content.split(/\s+/).length} words, dry run — not writing)`
    );
    return;
  }

  const channelsDir = getChannelsDir();
  const examplePath = join(
    channelsDir,
    intent.channelId,
    "examples",
    "sample-1.md"
  );

  await writeFile(examplePath, result.content, "utf-8");

  const wordCount = result.content.split(/\s+/).length;
  spinner.succeed(
    `Sample article: ${wordCount} words → channels/${intent.channelId}/examples/sample-1.md`
  );
}
