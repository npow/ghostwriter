import type { Ora } from "ora";
import {
  analyzeUrl,
  mergeStyleProfiles,
  formatStyleProfile,
  type StyleProfile,
} from "@auto-blogger/style-fingerprint";
import type { CreateContext } from "../types.js";

export async function fingerprintStyle(
  ctx: CreateContext,
  spinner: Ora
): Promise<StyleProfile | undefined> {
  const refs = ctx.intent?.styleReferences ?? [];
  if (refs.length === 0) {
    spinner.info("No style references — will generate voice from description only");
    return undefined;
  }

  spinner.start(`Fingerprinting style from ${refs.length} reference(s)...`);

  const profiles: StyleProfile[] = [];

  for (const ref of refs) {
    // Check if it's a URL
    if (isUrl(ref)) {
      try {
        const profile = await analyzeUrl(ref);
        profiles.push(profile);
        spinner.text = `Fingerprinted: ${ref} (${profile.sampleCount} samples)`;
      } catch (err) {
        spinner.text = `Could not analyze ${ref}: ${err instanceof Error ? err.message : String(err)}`;
      }
    } else {
      // It's a name reference (e.g. "Matt Levine") — skip URL resolution
      // The voice generation step will use the name as context
      spinner.text = `Style reference "${ref}" is a name — will use for voice generation`;
    }
  }

  if (profiles.length === 0) {
    spinner.info("No URLs could be fingerprinted — will rely on description for voice");
    return undefined;
  }

  const merged = profiles.length === 1 ? profiles[0] : mergeStyleProfiles(profiles);
  const summary = formatStyleProfile(merged, "compact");
  spinner.succeed(`Style fingerprint: ${summary}`);

  return merged;
}

function isUrl(str: string): boolean {
  try {
    const url = new URL(str.startsWith("http") ? str : `https://${str}`);
    return url.hostname.includes(".");
  } catch {
    return false;
  }
}
