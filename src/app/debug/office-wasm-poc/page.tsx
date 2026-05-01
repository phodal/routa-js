/**
 * Debug / Office WASM POC - /debug/office-wasm-poc
 */

import { Suspense } from "react";

import { OfficeWasmPocPageClient } from "./page-client";

export default function OfficeWasmPocPage() {
  return (
    <Suspense fallback={<main style={{ padding: 24, fontFamily: "monospace" }}>Loading Office WASM POC...</main>}>
      <OfficeWasmPocPageClient />
    </Suspense>
  );
}
