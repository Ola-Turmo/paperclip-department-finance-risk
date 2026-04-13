// src/variance/pyod-ensemble-detector.ts
/**
 * PyOD Ensemble Anomaly Detector — TypeScript adapter.
 * Calls Python PyOD wrapper via child_process for ensemble anomaly scoring.
 */

import { spawn } from "child_process";
import { promisify } from "util";
import { join } from "path";

const execFile = promisify(require("child_process").execFile);

export interface PyODResult {
  ensemble_scores: number[];
  component_scores: Record<string, number[]>;
  method: string;
  n_detectors: number;
}

export interface EnsembleAnomalyPoint {
  period: string;
  value: number;
  ensembleScore: number;
  isAnomaly: boolean;
  topDetector: string;
}

/**
 * Run PyOD ensemble anomaly detection.
 * Falls back to TypeScript Z-score if Python is unavailable.
 */
export async function detectEnsembleAnomalies(
  values: Array<{ period: string; value: number }>,
  threshold = 0.65
): Promise<EnsembleAnomalyPoint[]> {
  const pythonScript = join(__dirname, "..", "python", "pyod-wrapper.py");
  const TIMEOUT_MS = 4000;

  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      try { proc.kill(); } catch { /* ignore */ }
      resolve(fallbackDetect(values, threshold));
    }, TIMEOUT_MS);

    const proc = spawn("python3", [pythonScript, JSON.stringify({ values: values.map(v => v.value) })], {
      timeout: 30000,
    });

    let stdout = "";
    let stderr = "";

    proc.stdout.on("data", (d) => { stdout += d.toString(); });
    proc.stderr.on("data", (d) => { stderr += d.toString(); });

    proc.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0 && stdout.trim()) {
        try {
          const result: PyODResult = JSON.parse(stdout.trim());
          const points = values.map((v, i) => {
            const score = result.ensemble_scores[i] ?? 0;
            const topDetector = Object.entries(result.component_scores)
              .sort((a, b) => (b[1][i] ?? 0) - (a[1][i] ?? 0))[0]?.[0] ?? "unknown";
            return {
              period: v.period,
              value: v.value,
              ensembleScore: score,
              isAnomaly: score > threshold,
              topDetector,
            };
          });
          resolve(points);
        } catch {
          resolve(fallbackDetect(values, threshold));
        }
      } else {
        console.warn(`[pyod] fallback: ${stderr || "no python"}`);
        resolve(fallbackDetect(values, threshold));
      }
    });

    proc.on("error", () => {
      clearTimeout(timer);
      resolve(fallbackDetect(values, threshold));
    });
  });
}

/**
 * TypeScript Z-score fallback (no Python required).
 */
function fallbackDetect(
  values: Array<{ period: string; value: number }>,
  threshold: number
): EnsembleAnomalyPoint[] {
  const nums = values.map((v) => v.value);
  const mean = nums.reduce((a, b) => a + b, 0) / nums.length;
  const std = Math.sqrt(nums.reduce((a, b) => a + (b - mean) ** 2, 0) / nums.length) + 1e-10;
  const zScores = nums.map((v) => Math.abs((v - mean) / std));
  const maxZ = Math.max(...zScores);
  const normalized = zScores.map((z) => z / maxZ);
  return values.map((v, i) => ({
    period: v.period,
    value: v.value,
    ensembleScore: normalized[i],
    isAnomaly: normalized[i] > threshold,
    topDetector: "zscore_fallback",
  }));
}