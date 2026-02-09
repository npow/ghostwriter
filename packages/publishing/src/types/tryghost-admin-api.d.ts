declare module "@tryghost/admin-api" {
  interface GhostAdminAPIOptions {
    url: string;
    key: string;
    version: string;
  }

  interface PostData {
    title: string;
    html?: string;
    mobiledoc?: string;
    status?: string;
    tags?: Array<{ name: string }>;
  }

  interface Post {
    id: string;
    url: string;
    title: string;
    slug: string;
  }

  interface PostsAPI {
    add(data: PostData, options?: { source?: string }): Promise<Post>;
    edit(data: Partial<PostData> & { id: string }): Promise<Post>;
    browse(options?: Record<string, unknown>): Promise<Post[]>;
  }

  class GhostAdminAPI {
    constructor(options: GhostAdminAPIOptions);
    posts: PostsAPI;
  }

  export = GhostAdminAPI;
}
