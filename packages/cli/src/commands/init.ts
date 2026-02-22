import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getChannelsDir } from "@ghostwriter/core";
import chalk from "chalk";

const TEMPLATE_CONFIG = `id: {CHANNEL_ID}
name: "{CHANNEL_NAME}"
contentType: article

topic:
  domain: your-domain
  focus: "What this channel covers"
  keywords:
    - keyword1
    - keyword2
  constraints: "Any constraints on content"

dataSources:
  - type: rss
    url: https://example.com/feed.xml
    maxItems: 10

voice:
  name: "Your Writer Name"
  persona: "Brief description of the writer's personality and style"
  age: 35
  backstory: "How they got into this topic"
  opinions:
    - "A strong opinion they hold"
  verbalTics:
    - "A catchphrase or verbal habit"
  exampleContent:
    - ./examples/sample-1.md
  vocabulary:
    preferred:
      - word1
      - word2
    forbidden:
      - "it's important to note"
      - "delve"
  tone: conversational

publishTargets:
  - platform: wordpress
    id: wordpress-com
  - platform: twitter
    format: thread
    maxTweets: 10

schedule:
  cron: "0 10 * * MON"
  timezone: America/New_York
  enabled: true

qualityGate:
  minScores:
    structure: 7
    readability: 7
    voiceMatch: 7
    factualAccuracy: 7
    sourceCoverage: 7
    hookStrength: 7
    engagementPotential: 7
    naturalness: 7
    perplexityVariance: 7
  maxRevisions: 3

targetWordCount: 1500
batchApi: false
`;

const SAMPLE_CONTENT = `# Sample Article Title

Here's an example of the writing style you want this channel to replicate.

Write 3-5 sample articles that demonstrate your preferred voice, tone, and structure. The style fingerprinting system will analyze these to extract quantitative features like:

- Sentence length distribution
- Paragraph variation
- Vocabulary richness
- Use of questions, contractions, first/second person
- Opening and closing styles

The more representative your examples, the better the generated content will match your desired style.

## Tips for Good Examples

Mix up your examples. Include some shorter pieces and some longer ones. Show the range of your style — serious and light, data-heavy and opinion-heavy.

Don't overthink it. Just write naturally in the voice you want the AI to replicate.
`;

export async function initCommand(channelName: string) {
  const channelId = channelName
    .toLowerCase()
    .replace(/[^a-z0-9-]/g, "-")
    .replace(/-+/g, "-");
  const channelsDir = getChannelsDir();
  const channelDir = join(channelsDir, channelId);
  const examplesDir = join(channelDir, "examples");

  console.log(chalk.blue(`\nInitializing channel: ${channelId}\n`));

  // Create directories
  await mkdir(examplesDir, { recursive: true });

  // Write config template
  const config = TEMPLATE_CONFIG.replace(/{CHANNEL_ID}/g, channelId).replace(
    /{CHANNEL_NAME}/g,
    channelName
  );
  await writeFile(join(channelDir, "config.yml"), config, "utf-8");

  // Write example content
  await writeFile(
    join(examplesDir, "sample-1.md"),
    SAMPLE_CONTENT,
    "utf-8"
  );

  console.log(chalk.green("  Created:"));
  console.log(`    ${join(channelDir, "config.yml")}`);
  console.log(`    ${join(examplesDir, "sample-1.md")}`);
  console.log();
  console.log(chalk.yellow("  Next steps:"));
  console.log(`    1. Edit ${join(channelDir, "config.yml")} with your settings`);
  console.log(
    `    2. Add example content to ${examplesDir}/`
  );
  console.log(`    3. Run: ghostwriter validate ${channelId}`);
  console.log(`    4. Run: ghostwriter run ${channelId} --dry-run`);
  console.log();
}
