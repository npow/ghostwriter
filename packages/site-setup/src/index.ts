export { WpComClient } from "./wordpress-com/client.js";
export { ensureCategories } from "./wordpress-com/categories.js";
export { ensureTags } from "./wordpress-com/tags.js";
export { ensurePages } from "./wordpress-com/pages.js";
export { updateSiteSettings } from "./wordpress-com/settings.js";
export { createMenu } from "./wordpress-com/menus.js";
export { uploadMedia } from "./wordpress-com/media.js";
export type { SiteSetupPlan, SiteSetupResult } from "./types.js";
export {
  buildAuthorizeUrl,
  exchangeCodeForToken,
  fetchCurrentUser,
  fetchUserSites,
  startCallbackServer,
  generateState,
  findAvailablePort,
  type WpComOAuthConfig,
  type WpComTokenResponse,
  type WpComUser,
  type WpComSite,
} from "./wordpress-com/oauth.js";

import type { ConnectionEntry } from "@auto-blogger/core";
import type { SiteSetupPlan, SiteSetupResult } from "./types.js";
import { WpComClient } from "./wordpress-com/client.js";
import { ensureCategories } from "./wordpress-com/categories.js";
import { ensureTags } from "./wordpress-com/tags.js";
import { ensurePages } from "./wordpress-com/pages.js";
import { updateSiteSettings } from "./wordpress-com/settings.js";
import { createMenu } from "./wordpress-com/menus.js";

/**
 * Execute a full site setup plan against a WordPress.com (or self-hosted) site.
 * Creates categories, tags, pages, sets site identity, and builds menus.
 */
export async function executeSiteSetup(
  plan: SiteSetupPlan,
  connection: ConnectionEntry
): Promise<SiteSetupResult> {
  const client = WpComClient.fromConnection(connection);

  const result: SiteSetupResult = {
    categories: [],
    tags: [],
    pages: [],
    settings: { applied: false, changes: [] },
    menus: [],
    errors: [],
  };

  // 1. Site identity (title, tagline)
  if (plan.siteIdentity) {
    try {
      result.settings = await updateSiteSettings(client, plan.siteIdentity);
    } catch (err) {
      result.errors.push(
        `Settings: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 2. Categories
  if (plan.categories.length > 0) {
    try {
      result.categories = await ensureCategories(client, plan.categories);
    } catch (err) {
      result.errors.push(
        `Categories: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 3. Tags
  if (plan.tags.length > 0) {
    try {
      result.tags = await ensureTags(client, plan.tags);
    } catch (err) {
      result.errors.push(
        `Tags: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 4. Pages
  if (plan.pages.length > 0) {
    try {
      result.pages = await ensurePages(client, plan.pages);
    } catch (err) {
      result.errors.push(
        `Pages: ${err instanceof Error ? err.message : String(err)}`
      );
    }
  }

  // 5. Menus
  if (plan.menus && plan.menus.length > 0) {
    for (const menu of plan.menus) {
      try {
        const created = await createMenu(client, menu);
        result.menus.push(created);
      } catch (err) {
        result.errors.push(
          `Menu "${menu.name}": ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}
