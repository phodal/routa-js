/**
 * Workspace Page (Server Component Wrapper)
 *
 * This server component provides generateStaticParams for static export
 * and renders the client component.
 *
 * Route: /[workspaceId]
 */

import { WorkspacePageClient } from "./workspace-page-client";

// Required for static export - tells Next.js which paths to pre-render.
// Empty array = no pre-rendering at build time, pages are generated on-demand.
export async function generateStaticParams(): Promise<{ workspaceId: string }[]> {
  return [];
}

export default function WorkspacePage() {
  return <WorkspacePageClient />;
}

