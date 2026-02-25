import { execFile } from "node:child_process";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { promisify } from "node:util";
import type { PlatformContent, PublishResult } from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";

const execFileAsync = promisify(execFile);
const logger = createChildLogger({ module: "publishing:hugo" });

export interface HugoConfig {
  repoPath: string;
  contentDir: string;
  branch: string;
  draft: boolean;
}

/**
 * Publish content to a Hugo git blog.
 * Writes a markdown file with YAML front matter, commits, and pushes.
 */
export async function publishToHugo(
  content: PlatformContent,
  config: HugoConfig
): Promise<PublishResult> {
  const headline =
    (content.metadata?.headline as string) ?? "Untitled Post";
  const tags = (content.metadata?.tags as string[]) ?? [];
  const draft = (content.metadata?.draft as boolean) ?? config.draft;

  logger.info(
    { channelId: content.channelId, headline },
    "Publishing to Hugo"
  );

  try {
    // 1. Pull latest changes
    await git(config.repoPath, [
      "pull",
      "--rebase",
      "origin",
      config.branch,
    ]);

    // 2. Generate slug from headline
    const date = new Date().toISOString().slice(0, 10);
    const slug = generateSlug(headline);
    const filename = `${date}-${slug}.md`;

    // 3. Build Hugo markdown with YAML front matter
    const frontMatter = buildFrontMatter({
      title: headline,
      date: new Date().toISOString(),
      tags,
      draft,
    });
    const fileContent = `${frontMatter}\n${content.content}\n`;

    // 4. Write to content dir
    const contentDirPath = join(config.repoPath, config.contentDir);
    await mkdir(contentDirPath, { recursive: true });
    const filePath = join(contentDirPath, filename);
    await writeFile(filePath, fileContent, "utf-8");

    // 5. Git add
    const relPath = join(config.contentDir, filename);
    await git(config.repoPath, ["add", relPath]);

    // 6. Git commit
    await git(config.repoPath, [
      "commit",
      "-m",
      `Add: ${headline}`,
    ]);

    // 7. Git push
    await git(config.repoPath, ["push", "origin", config.branch]);

    logger.info(
      { channelId: content.channelId, filePath: relPath },
      "Hugo post published"
    );

    return {
      channelId: content.channelId,
      platform: "hugo",
      success: true,
      url: relPath,
      publishedAt: new Date().toISOString(),
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Hugo publish failed");

    return {
      channelId: content.channelId,
      platform: "hugo",
      success: false,
      error: message,
      publishedAt: new Date().toISOString(),
    };
  }
}

/**
 * Run a git command in the given repo directory using execFile (no shell injection risk).
 */
async function git(
  repoPath: string,
  args: string[]
): Promise<string> {
  const { stdout } = await execFileAsync("git", ["-C", repoPath, ...args], {
    timeout: 30_000,
  });
  return stdout.trim();
}

/**
 * Generate a URL-friendly slug from a headline.
 */
function generateSlug(headline: string): string {
  return headline
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 80);
}

/**
 * Build YAML front matter for a Hugo post.
 */
function buildFrontMatter(meta: {
  title: string;
  date: string;
  tags: string[];
  draft: boolean;
}): string {
  const lines = [
    "---",
    `title: "${meta.title.replace(/"/g, '\\"')}"`,
    `date: ${meta.date}`,
    `draft: ${meta.draft}`,
  ];

  if (meta.tags.length > 0) {
    lines.push(`tags:`);
    for (const tag of meta.tags) {
      lines.push(`  - "${tag.replace(/"/g, '\\"')}"`);
    }
  }

  lines.push("---");
  return lines.join("\n");
}
