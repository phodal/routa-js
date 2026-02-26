/**
 * Workspace Session Page (Server Component Wrapper)
 *
 * This server component provides generateStaticParams for static export
 * and renders the client component.
 *
 * Route: /[workspaceId]/[sessionId]
 */

import { SessionPageClient } from "./session-page-client";

// Required for static export - tells Next.js which paths to pre-render.
// Empty array = no pre-rendering at build time, pages are generated on-demand.
// For nested routes, we return objects with all dynamic segment keys.
export async function generateStaticParams(): Promise<{ workspaceId: string; sessionId: string }[]> {
  return [];
}

export default function WorkspaceSessionPage() {
  return <SessionPageClient />;
}

