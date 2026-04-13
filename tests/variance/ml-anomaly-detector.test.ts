import { describe, it, expect } from "vitest";
import { MLAnomalyDetector } from "../../src/variance/ml-anomaly-detector.js";

describe("MLAnomalyDetector", () => {
  const detector = new MLAnomalyDetector();

  it("detects spike anomalies", () => {
    const values = Array.from({ length: 20 }, (_, i) => ({ period: `2024-${String(i+1).padStart(2,"0")}`, value: 100 + Math.random() * 10 }));
    values.push({ period: "2024-21", value: 500 }); // spike
    const results = detector.detect({ values });
    const spike = results.find(r => r.period === "2024-21");
    expect(spike?.type).toBe("spike");
    expect(spike?.anomalyScore).toBeGreaterThan(0.5);
  });

  it("returns empty for short series", () => {
    const values = [{ period: "2024-01", value: 100 }];
    const results = detector.detect({ values });
    expect(results.length).toBe(0);
  });

  it("handles drop anomalies", () => {
    const values = Array.from({ length: 20 }, (_, i) => ({ period: `2024-${String(i+1).padStart(2,"0")}`, value: 200 }));
    values.push({ period: "2024-21", value: 10 }); // drop
    const results = detector.detect({ values });
    const drop = results.find(r => r.period === "2024-21");
    expect(["drop", "trend_deviation"]).toContain(drop?.type);
  });
});
