import type { WpComClient } from "./client.js";

interface WpMenu {
  id: number;
  name: string;
}

interface WpMenuItem {
  id: number;
  title: string;
}

interface MenuItemInput {
  title: string;
  type: "page" | "category" | "custom";
  objectSlug?: string;
  url?: string;
}

interface MenuInput {
  name: string;
  location: string;
  items: MenuItemInput[];
}

/**
 * Create a navigation menu with items.
 * Uses the WP REST API menus endpoints (available on WordPress.com).
 */
export async function createMenu(
  client: WpComClient,
  menu: MenuInput
): Promise<{ name: string; id: number }> {
  // Create the menu
  const created = await client.post<WpMenu>("/menus", {
    name: menu.name,
  });

  // Add items to the menu
  for (const item of menu.items) {
    const menuItemBody: Record<string, unknown> = {
      title: item.title,
      menus: created.id,
    };

    if (item.type === "custom" && item.url) {
      menuItemBody.type = "custom";
      menuItemBody.url = item.url;
    } else if (item.type === "page") {
      menuItemBody.type = "post_type";
      menuItemBody.object = "page";
      // Try to resolve the page by slug
      if (item.objectSlug) {
        try {
          const pages = await client.get<Array<{ id: number }>>(
            "/pages",
            { slug: item.objectSlug }
          );
          if (pages.length > 0) {
            menuItemBody.object_id = pages[0].id;
          }
        } catch {
          // Fall through — item will be created without an object_id
        }
      }
    } else if (item.type === "category") {
      menuItemBody.type = "taxonomy";
      menuItemBody.object = "category";
      if (item.objectSlug) {
        try {
          const cats = await client.get<Array<{ id: number }>>(
            "/categories",
            { slug: item.objectSlug }
          );
          if (cats.length > 0) {
            menuItemBody.object_id = cats[0].id;
          }
        } catch {
          // Fall through
        }
      }
    }

    await client.post<WpMenuItem>("/menu-items", menuItemBody);
  }

  // Assign menu to location
  try {
    await client.post("/menu-locations/" + menu.location, {
      menus: created.id,
    });
  } catch {
    // Menu locations endpoint may not be available on all setups
  }

  return { name: menu.name, id: created.id };
}
