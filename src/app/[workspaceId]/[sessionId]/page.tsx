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
// Use placeholder values since actual paths are determined at runtime.
export async function generateStaticParams() {
  return [{ workspaceId: "__placeholder__", sessionId: "__placeholder__" }];
}

// Required for static export - only paths in generateStaticParams are valid
export const dynamicParams = false;

export default function WorkspaceSessionPage() {
  return <SessionPageClient />;
}

