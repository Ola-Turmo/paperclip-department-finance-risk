import { describe, it, expect } from "vitest";
import { detectEnsembleAnomalies } from "../../src/variance/pyod-ensemble-detector.js";

describe("detectEnsembleAnomalies", () => {
  it("returns anomaly points with scores", async () => {
    const values = [
      { period: "2024-01", value: 100 }, { period: "2024-02", value: 102 },
      { period: "2024-03", value: 99 }, { period: "2024-04", value: 101 },
      { period: "2024-05", value: 98 }, { period: "2024-06", value: 300 },
    ];
    const results = await detectEnsembleAnomalies(values, 0.65);
    expect(results.length).toBe(6);
    const spike = results.find(r => r.period === "2024-06");
    expect(spike?.ensembleScore).toBeGreaterThan(0.5);
    expect(spike?.isAnomaly).toBe(true);
  });

  it("returns fallback scores when Python unavailable", async () => {
    const values = [
      { period: "2024-01", value: 100 }, { period: "2024-02", value: 500 },
    ];
    const results = await detectEnsembleAnomalies(values, 0.9);
    expect(results[1].ensembleScore).toBeGreaterThan(0.9);
    expect(results[1].topDetector).toBe("zscore_fallback");
  });
});
