'use client';

import { useEffect, useState } from 'react';

/**
 * Custom 404 page for Next.js static export with dynamic routes.
 *
 * In static export mode, Next.js cannot handle dynamic routes like /workspace/[id]/sessions/[sessionId]
 * at build time. This page acts as a fallback that performs client-side routing.
 *
 * When a user navigates to a dynamic route:
 * 1. The Rust backend serves this 404.html page
 * 2. This component reads the current URL
 * 3. It forces a full page reload to let Next.js client-side router take over
 */
export default function NotFound() {
  const [debug, setDebug] = useState('');

  useEffect(() => {
    // Get the actual path from the browser
    const actualPath = window.location.pathname;

    setDebug(`Current path: ${actualPath}`);
    console.log(`[NotFound] Current path: ${actualPath}`);
    console.log(`[NotFound] window.location:`, window.location.href);

    // If we're on a dynamic route (not the root 404), force a reload
    // This will make Next.js client-side router handle the route
    if (actualPath !== '/404' && actualPath !== '/not-found' && actualPath !== '/_not-found') {
      console.log(`[NotFound] Forcing reload for dynamic route: ${actualPath}`);

      // Use a small delay to ensure the page is fully loaded
      setTimeout(() => {
        // Force a full page reload - this will trigger Next.js client-side routing
        window.location.href = actualPath + window.location.search + window.location.hash;
      }, 100);
    } else {
      console.log(`[NotFound] This is a real 404 page`);
    }
  }, []);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-[#0f1117]">
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">404</h1>
        <p className="text-gray-600 dark:text-gray-400">Loading...</p>
        {debug && (
          <p className="text-xs text-gray-500 dark:text-gray-600 mt-4 font-mono">{debug}</p>
        )}
      </div>
    </div>
  );
}

