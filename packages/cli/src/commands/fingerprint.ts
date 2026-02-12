import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import {
  analyzeStyle,
  analyzeUrl,
  formatStyleProfile,
} from "@auto-blogger/style-fingerprint";
import type { FormatMode } from "@auto-blogger/style-fingerprint";

export async function fingerprintCommand(
  input: string,
  options: { output?: string }
): Promise<void> {
  const mode = (options.output ?? "prompt") as FormatMode | "json";
  const isUrl = input.startsWith("http://") || input.startsWith("https://");

  try {
    let profile;

    if (isUrl) {
      console.log(`Fetching ${input}...`);
      profile = await analyzeUrl(input);
    } else {
      const filePath = resolve(input);
      const text = readFileSync(filePath, "utf-8");
      profile = analyzeStyle([text]);
    }

    if (mode === "json") {
      console.log(JSON.stringify(profile, null, 2));
    } else {
      console.log(formatStyleProfile(profile, mode as FormatMode));
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Error: ${message}`);
    process.exitCode = 1;
  }
}
