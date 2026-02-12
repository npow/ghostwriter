import type { Ora } from "ora";
import { WpComClient } from "@auto-blogger/site-setup";
import type { CreateContext } from "../types.js";

interface UserMe {
  name: string;
  slug: string;
  roles: string[];
  capabilities: Record<string, boolean>;
}

export async function validateSiteAccess(
  ctx: CreateContext,
  spinner: Ora
): Promise<void> {
  const conn = ctx.connection!;
  const siteLabel = conn.url ?? conn.id;

  spinner.start(`Verifying access to ${siteLabel}...`);

  const client = WpComClient.fromConnection(conn);

  let user: UserMe;
  try {
    user = await client.get<UserMe>("/users/me?context=edit");
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    if (msg.includes("401") || msg.includes("403")) {
      throw new Error(
        `Could not access ${siteLabel} — check your credentials (${conn.id})`
      );
    }
    throw new Error(`Could not access ${siteLabel}: ${msg}`);
  }

  if (!user.capabilities?.publish_posts) {
    const role = user.roles?.[0] ?? "unknown role";
    throw new Error(
      `User "${user.name}" (${role}) does not have publish permission on ${siteLabel}`
    );
  }

  const role = user.roles?.[0] ?? "unknown role";
  spinner.succeed(`Verified access as "${user.name}" (${role})`);
}
