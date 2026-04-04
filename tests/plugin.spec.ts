import { describe, expect, it } from "vitest";
import { createTestHarness } from "@paperclipai/plugin-sdk/testing";
import manifest from "../src/manifest.js";
import plugin from "../src/worker.js";

describe("plugin scaffold", () => {
  it("registers data, actions, and event handling", async () => {
    const harness = createTestHarness({ manifest, capabilities: [...manifest.capabilities, "events.emit"] });
    await plugin.definition.setup(harness.ctx);

    await harness.emit("issue.created", { issueId: "iss_1" }, { entityId: "iss_1", entityType: "issue" });
    expect(harness.getState({ scopeKind: "issue", scopeId: "iss_1", stateKey: "seen" })).toBe(true);

    const data = await harness.getData<{ status: string; checkedAt: string }>("health");
    // Health can be "ok", "unknown", "degraded", or "error" depending on connector state
    expect(["ok", "unknown", "degraded", "error"]).toContain(data.status);

    const action = await harness.performAction<{ pong: boolean; at: string }>("ping");
    expect(action.pong).toBe(true);
  });
});
