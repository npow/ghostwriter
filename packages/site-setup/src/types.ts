export interface SiteSetupPlan {
  platform: "wordpress-com";
  siteId: string;
  siteIdentity?: {
    title: string;
    tagline: string;
  };
  categories: Array<{ name: string; slug: string; description?: string }>;
  tags: Array<{ name: string; slug: string }>;
  pages: Array<{
    title: string;
    slug: string;
    content: string;
    status: "publish" | "draft";
  }>;
  menus?: Array<{
    name: string;
    location: string;
    items: Array<{
      title: string;
      type: "page" | "category" | "custom";
      objectSlug?: string;
      url?: string;
    }>;
  }>;
}

export interface SiteSetupResult {
  categories: Array<{ name: string; id: number; created: boolean }>;
  tags: Array<{ name: string; id: number; created: boolean }>;
  pages: Array<{ title: string; id: number; url: string }>;
  settings: { applied: boolean; changes: string[] };
  menus: Array<{ name: string; id: number }>;
  errors: string[];
}
