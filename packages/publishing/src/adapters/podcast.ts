import type { PlatformContent, PublishResult } from "@ghostwriter/core";
import { createChildLogger } from "@ghostwriter/core";

const logger = createChildLogger({ module: "publishing:podcast" });

export interface PodcastConfig {
  provider: "buzzsprout" | "transistor";
  apiToken: string;
  podcastId: string;
  elevenLabsApiKey?: string;
}

/**
 * Generate audio via ElevenLabs TTS and publish to podcast host.
 */
export async function publishToPodcast(
  content: PlatformContent,
  config: PodcastConfig
): Promise<PublishResult> {
  logger.info({ channelId: content.channelId }, "Publishing podcast episode");

  try {
    // Step 1: Generate audio via ElevenLabs
    const audioBuffer = await generateAudio(
      content.content,
      (content.metadata?.voiceId as string) ?? "default",
      config.elevenLabsApiKey
    );

    // Step 2: Upload to podcast host
    if (config.provider === "buzzsprout") {
      return await uploadToBuzzsprout(content, config, audioBuffer);
    }

    throw new Error(`Podcast provider "${config.provider}" not yet supported`);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    logger.error({ error: message }, "Podcast publish failed");

    return {
      channelId: content.channelId,
      platform: "podcast",
      success: false,
      error: message,
      publishedAt: new Date().toISOString(),
    };
  }
}

async function generateAudio(
  script: string,
  voiceId: string,
  apiKey?: string
): Promise<Buffer> {
  if (!apiKey) {
    throw new Error("ELEVENLABS_API_KEY is required for podcast generation");
  }

  // Strip [PAUSE] markers and other formatting
  const cleanScript = script
    .replace(/\[PAUSE\]/g, "...")
    .replace(/\[.*?\]/g, "");

  const response = await fetch(
    `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`,
    {
      method: "POST",
      headers: {
        "xi-api-key": apiKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        text: cleanScript,
        model_id: "eleven_multilingual_v2",
        voice_settings: {
          stability: 0.5,
          similarity_boost: 0.75,
        },
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      `ElevenLabs TTS failed: ${response.status} ${response.statusText}`
    );
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
}

async function uploadToBuzzsprout(
  content: PlatformContent,
  config: PodcastConfig,
  audioBuffer: Buffer
): Promise<PublishResult> {
  const title =
    (content.metadata?.headline as string) ?? "Untitled Episode";

  // Buzzsprout API: create episode
  const formData = new FormData();
  formData.append("title", title);
  formData.append("description", content.content.slice(0, 500));
  formData.append("published_at", new Date().toISOString());
  formData.append(
    "audio_file",
    new Blob([audioBuffer], { type: "audio/mpeg" }),
    "episode.mp3"
  );

  const response = await fetch(
    `https://www.buzzsprout.com/api/${config.podcastId}/episodes.json`,
    {
      method: "POST",
      headers: {
        Authorization: `Token token=${config.apiToken}`,
      },
      body: formData,
    }
  );

  if (!response.ok) {
    throw new Error(
      `Buzzsprout upload failed: ${response.status} ${response.statusText}`
    );
  }

  const episode = (await response.json()) as { id: number; audio_url: string };

  return {
    channelId: content.channelId,
    platform: "podcast",
    success: true,
    platformId: String(episode.id),
    url: episode.audio_url,
    publishedAt: new Date().toISOString(),
  };
}
