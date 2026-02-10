import { config } from "dotenv";
import { resolve } from "node:path";

// Load .env from project root
config({ path: resolve(process.cwd(), ".env") });

export function requireEnv(key: string): string {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Required environment variable ${key} is not set`);
  }
  return value;
}

export function optionalEnv(key: string, fallback: string): string {
  return process.env[key] ?? fallback;
}

export const env = {
  get anthropicApiKey() {
    return requireEnv("ANTHROPIC_API_KEY");
  },
  get databaseUrl() {
    return requireEnv("DATABASE_URL");
  },
  get redisUrl() {
    return optionalEnv("REDIS_URL", "redis://localhost:6379");
  },
  get temporalAddress() {
    return optionalEnv("TEMPORAL_ADDRESS", "localhost:7233");
  },
  get temporalNamespace() {
    return optionalEnv("TEMPORAL_NAMESPACE", "auto-blogger");
  },
  get ghostUrl() {
    return process.env.GHOST_URL;
  },
  get ghostAdminApiKey() {
    return process.env.GHOST_ADMIN_API_KEY;
  },
  get twitterApiKey() {
    return process.env.TWITTER_API_KEY;
  },
  get twitterApiSecret() {
    return process.env.TWITTER_API_SECRET;
  },
  get twitterAccessToken() {
    return process.env.TWITTER_ACCESS_TOKEN;
  },
  get twitterAccessSecret() {
    return process.env.TWITTER_ACCESS_SECRET;
  },
  get elevenLabsApiKey() {
    return process.env.ELEVENLABS_API_KEY;
  },
  get polygonApiKey() {
    return process.env.POLYGON_API_KEY;
  },
  get spoonacularApiKey() {
    return process.env.SPOONACULAR_API_KEY;
  },
  get buzzsproutApiToken() {
    return process.env.BUZZSPROUT_API_TOKEN;
  },
  get buzzsproutPodcastId() {
    return process.env.BUZZSPROUT_PODCAST_ID;
  },
  get wordpressUrl() {
    return process.env.WORDPRESS_URL;
  },
  get wordpressUsername() {
    return process.env.WORDPRESS_USERNAME;
  },
  get wordpressPassword() {
    return process.env.WORDPRESS_APP_PASSWORD;
  },
};
