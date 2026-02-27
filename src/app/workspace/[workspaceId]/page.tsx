/**
 * Workspace Page (Server Component Wrapper)
 *
 * This server component provides generateStaticParams for static export
 * and renders the client component.
 *
 * Route: /workspace/[workspaceId]
 */

import { WorkspacePageClient } from "./workspace-page-client";

// Required for static export - tells Next.js which paths to pre-render.
// For static export (ROUTA_BUILD_STATIC=1): return placeholder values
// For Vercel/SSR: return empty array (pages rendered on-demand)
export async function generateStaticParams() {
  if (process.env.ROUTA_BUILD_STATIC === "1") {
    return [{ workspaceId: "__placeholder__" }];
  }
  return [];
}

export default function WorkspacePage() {
  return <WorkspacePageClient />;
}
