export type LogLevel = "debug" | "info" | "warn" | "error";

declare global {
  interface Window {
    __TAURI__?: {
      core?: {
        invoke?: (command: string, payload?: Record<string, unknown>) => Promise<unknown>;
      };
    };
    __TAURI_INTERNALS__?: unknown;
    __ROUTA_DEBUG__?: boolean;
  }
}

function nowIso(): string {
  return new Date().toISOString();
}

export function isTauriRuntime(): boolean {
  return typeof window !== "undefined" && !!(window.__TAURI__ || window.__TAURI_INTERNALS__);
}

export function isHttpLikeRuntime(): boolean {
  if (typeof window === "undefined") return false;
  return window.location.protocol === "http:" || window.location.protocol === "https:";
}

export function isDesktopStaticRuntime(): boolean {
  return isTauriRuntime() && !isHttpLikeRuntime();
}

export function isDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  if (window.__ROUTA_DEBUG__ === true) return true;
  try {
    return localStorage.getItem("routa.debug") === "1";
  } catch {
    return false;
  }
}

export function toErrorMessage(err: unknown): string {
  if (err instanceof Error && err.message) return err.message;
  return String(err);
}

async function emitToTauriLog(level: LogLevel, scope: string, message: string): Promise<void> {
  if (!isTauriRuntime()) return;
  try {
    await window.__TAURI__?.core?.invoke?.("log_frontend", { level, scope, message });
  } catch {
    // Ignore failures; console logging still works.
  }
}

export function logRuntime(level: LogLevel, scope: string, message: string, meta?: unknown): void {
  const line = `[${nowIso()}][${scope}] ${message}`;
  const shouldPrintDebug = level !== "debug" || isDebugEnabled();

  if (shouldPrintDebug) {
    if (level === "error") console.error(line, meta ?? "");
    else if (level === "warn") console.warn(line, meta ?? "");
    else console.log(line, meta ?? "");
  }

  void emitToTauriLog(level, scope, `${message}${meta ? ` ${JSON.stringify(meta)}` : ""}`);
}

export function desktopStaticApiError(feature: string): Error {
  return new Error(
    `[${feature}] 当前为 Tauri 静态资源运行模式，/api 后端不可用。` +
      `请使用 \`npm run dev\` + \`npm run tauri dev\` 调试，或为桌面版提供内置/本地 API 服务。`
  );
}
