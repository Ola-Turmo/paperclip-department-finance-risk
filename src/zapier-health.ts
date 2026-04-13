/**
 * Zapier-based Connector Health Checks
 *
 * Replaces the Math.random() simulation in performRuntimeHealthCheck()
 * with real Zapier API health checks for available integrations.
 *
 * Available connections:
 *   gmail    → GoogleMailV2CLIAPI  (connection 63153551)
 *   discord  → DiscordCLIAPI       (63153641)
 *   youtube  → YouTubeV4CLIAPI     (63236551)
 *   grok     → App220766CLIAPI     (63153996)
 *   github   → GitHubCLIAPI        (63156867)
 *   others   → no connection → returns { checked: false }
 *
 * Auth failures → status "error" (permanent)
 * Other errors  → status "degraded" (transient)
 */

import { spawn } from "child_process";
import { statSync } from "fs";
import type { ConnectorHealthStatus } from "./connector-health.js";

// ── Binary resolution ─────────────────────────────────────────────────────
const ZAPIER_BIN = (() => {
  try {
    // Try system path first (fastest — no npx overhead)
    const sysPath = "/usr/bin/zapier-sdk";
    statSync(sysPath);
    return sysPath;
  } catch {
    // Fall back to npx resolution
    try {
      const out = require("child_process")
        .execSync("npx --yes zapier-sdk 2>/dev/null || which zapier-sdk", { timeout: 10_000 })
        .toString()
        .trim()
        .split("\n")
        .at(-1);
      return out || "zapier-sdk";
    } catch {
      return "zapier-sdk";
    }
  }
})();

// ── Result cache ──────────────────────────────────────────────────────────
interface CachedResult {
 result: ZapierHealthResult;
 expiresAt: number; // Unix ms
}

const healthCache = new Map<string, CachedResult>();
const CACHE_TTL_MS = 60_000; // 60 seconds

function getCached(toolkitId: string): ZapierHealthResult | null {
  const cached = healthCache.get(toolkitId);
  if (!cached) return null;
  if (Date.now() > cached.expiresAt) {
    healthCache.delete(toolkitId);
    return null;
  }
  return cached.result;
}

function setCached(toolkitId: string, result: ZapierHealthResult): void {
  // Evict if cache is too large (max 50 entries)
  if (healthCache.size >= 50) {
    // Remove oldest 10
    const oldest = Array.from(healthCache.entries())
      .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
      .slice(0, 10);
    oldest.forEach(([k]) => healthCache.delete(k));
  }
  healthCache.set(toolkitId, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// ── Connection registry ────────────────────────────────────────────────────
const ZAPIER_CONNECTIONS: Record<string, { app: string; label: string }> = {
  "63153551": { app: "GoogleMailV2CLIAPI",  label: "Gmail" },
  "63153517": { app: "GoogleMailV2CLIAPI",  label: "Gmail (ola.turmo)" },
  "63153572": { app: "GoogleDriveCLIAPI",   label: "GoogleDrive" },
  "63153641": { app: "DiscordCLIAPI",        label: "Discord" },
  "63156867": { app: "GitHubCLIAPI",          label: "GitHub" },
  "63236551": { app: "YouTubeV4CLIAPI",      label: "YouTube" },
  "63153996": { app: "App220766CLIAPI",      label: "Grok" },
  "63153937": { app: "GoogleMakerSuiteCLIAPI", label: "Google AI Studio" },
};

// ── Toolkit → Zapier action mapping ──────────────────────────────────────
const TOOLKIT_ZAPIER_MAP: Record<string, {
  connectionId: string;
  action: string;
  actionType: "read" | "search" | "write";
  params: string;
}> = {
  gmail: {
    connectionId: "63153551",
    action: "message",
    actionType: "search",
    params: '{"query": "in:inbox", "querystring": {"maxResults": 1}}',
  },
  discord: {
    connectionId: "63153641",
    action: "list_text_channels",
    actionType: "read",
    params: "{}",
  },
  youtube: {
    connectionId: "63236551",
    action: "channel_by_user",
    actionType: "read",
    params: '{"username": "outlierai"}',
  },
  grok: {
    connectionId: "63153996",
    action: "list_text_models",
    actionType: "read",
    params: "{}",
  },
  github: {
    connectionId: "63156867",
    action: "organization",
    actionType: "read",
    params: '{"org": "Paperclip-UOS"}',
  },
};

// ── Low-level Zapier spawn ─────────────────────────────────────────────────
function runZapierAction(
  app: string,
  actionType: "read" | "search" | "write",
  action: string,
  connectionId: string,
  params: string
): Promise<{ ok: boolean; error?: string }> {
  return new Promise((resolve) => {
    const proc = spawn(ZAPIER_BIN, [
      "run-action",
      app, actionType, action,
      "--connection-id", connectionId,
      "--inputs", params,
      "--json",
    ]);

    let stdout = "";
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* noop */ }
      resolve({ ok: false, error: "Timeout after 12s" });
    }, 12_000);

    proc.stdout.on("data", (d) => { stdout += d.toString(); });

    proc.on("close", () => {
      clearTimeout(timer);
      try {
        const j = JSON.parse(stdout);
        if (j.errors && j.errors.length > 0) {
          resolve({ ok: false, error: j.errors[0].message });
        } else {
          resolve({ ok: true });
        }
      } catch {
        resolve({ ok: false, error: stdout.trim() || "empty response" });
      }
    });

    proc.on("error", (err) => {
      clearTimeout(timer);
      resolve({ ok: false, error: err.message });
    });
  });
}

// ── Public API ─────────────────────────────────────────────────────────────

export type ZapierHealthResult =
  | { checked: true; status: ConnectorHealthStatus; error?: string }
  | { checked: false; reason: "no_zapier_connection" };

/**
 * Check the health of a single toolkit via Zapier.
 * Returns { checked: false } if no Zapier connection exists for this toolkit,
 * in which case the caller should preserve the existing state.
 *
 * Results are cached for 60 seconds to avoid redundant Zapier spawns.
 */
export async function checkToolkitHealth(
  toolkitId: string
): Promise<ZapierHealthResult> {
  // Fast path: no Zapier connection for this toolkit
  if (!TOOLKIT_ZAPIER_MAP[toolkitId]) {
    return { checked: false, reason: "no_zapier_connection" };
  }

  // Cache hit
  const cached = getCached(toolkitId);
  if (cached) return cached;

  const config = TOOLKIT_ZAPIER_MAP[toolkitId]!;
  const conn = ZAPIER_CONNECTIONS[config.connectionId];

  const result = await runZapierAction(
    conn.app,
    config.actionType,
    config.action,
    config.connectionId,
    config.params
  );

  let healthResult: ZapierHealthResult;
  if (!result.ok) {
    const errMsg = result.error ?? "unknown";
    // Auth/credential errors = permanent "error" status
    const isAuthError = /unauthorized|invalid.*token|authentication|credentials|refresh/i.test(errMsg);
    healthResult = {
      checked: true,
      status: isAuthError ? "error" : "degraded",
      error: errMsg,
    };
  } else {
    healthResult = { checked: true, status: "ok" };
  }

  setCached(toolkitId, healthResult);
  return healthResult;
}

/**
 * Clear the health cache (useful for forced re-checks).
 */
export function clearHealthCache(): void {
  healthCache.clear();
}
