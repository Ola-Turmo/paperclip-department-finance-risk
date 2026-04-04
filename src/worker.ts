import { definePlugin, runWorker } from "@paperclipai/plugin-sdk";
import { ApprovalService } from "./approval-service.js";
import { VarianceAnomalyService } from "./variance-anomaly-service.js";
import {
  createInitialConnectorHealthState,
  updateConnectorHealthState,
  computeDepartmentHealthStatus,
  generateToolkitLimitations,
  formatAllLimitations,
  performRuntimeHealthCheck,
  type ConnectorHealthState,
} from "./connector-health.js";
import type {
  CreateApprovalRouteParams,
  CreateApprovalRequestParams,
  SubmitApprovalDecisionParams,
  DelegateApprovalParams,
  ReportApprovalExceptionParams,
  ResolveApprovalExceptionParams,
  CancelApprovalRequestParams,
  AddApprovalEvidenceParams,
  DetectVarianceParams,
  ExplainVarianceParams,
  AssignVarianceFollowUpParams,
  UpdateVarianceFollowUpStatusParams,
  DetectAnomalyParams,
  ExplainAnomalyParams,
  MarkAnomalyFalsePositiveParams,
  AssignAnomalyFollowUpParams,
  UpdateAnomalyFollowUpStatusParams,
  ConnectorHealthSummary,
  SetConnectorHealthParams,
  GetConnectorHealthParams,
} from "./types.js";

// Initialize services
const approvalService = new ApprovalService();
const varianceAnomalyService = new VarianceAnomalyService();

// Connector health state (XAF-007)
let connectorHealthState: ConnectorHealthState[] = createInitialConnectorHealthState();

const plugin = definePlugin({
  async setup(ctx) {
    ctx.events.on("issue.created", async (event) => {
      const issueId = event.entityId ?? "unknown";
      await ctx.state.set({ scopeKind: "issue", scopeId: issueId, stateKey: "seen" }, true);
      ctx.logger.info("Observed issue.created", { issueId });
    });

    // Health check (now includes connector health status - XAF-007)
    ctx.data.register("health", async () => {
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      return {
        status: overallStatus,
        checkedAt: new Date().toISOString(),
        hasLimitations: limitations.length > 0,
        limitations: limitations,
      };
    });

    // Connector health data (XAF-007)
    ctx.data.register("connectorHealth", async (params) => {
      const p = params as unknown as GetConnectorHealthParams;
      if (p?.toolkitId) {
        const state = connectorHealthState.find((s) => s.toolkitId === p.toolkitId);
        if (!state) {
          return { error: `Connector '${p.toolkitId}' not found` };
        }
        const limitations = state.status !== "ok"
          ? generateToolkitLimitations([state])
          : [];
        return { connector: state, limitations };
      }
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      const summary: ConnectorHealthSummary = {
        overallStatus,
        checkedAt: new Date().toISOString(),
        connectors: connectorHealthState,
        limitations,
        hasLimitations: limitations.length > 0,
      };
      return summary;
    });

    // Ping action for testing
    ctx.actions.register("ping", async () => {
      ctx.logger.info("Ping action invoked");
      return { pong: true, at: new Date().toISOString() };
    });

    // ============================================
    // Connector Health Actions (XAF-007)
    // ============================================

    /**
     * Set connector health status (for simulation/testing)
     * XAF-007: Simulate connector degradation to verify limitation messaging
     */
    ctx.actions.register("connector.setHealth", async (params) => {
      const p = params as unknown as SetConnectorHealthParams;
      ctx.logger.info("Setting connector health", { toolkitId: p.toolkitId, status: p.status });
      connectorHealthState = updateConnectorHealthState(
        connectorHealthState,
        p.toolkitId,
        p.status,
        p.error
      );
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      return {
        success: true,
        toolkitId: p.toolkitId,
        status: p.status,
        overallStatus,
        limitations,
        formattedLimitations: limitations.length > 0 ? formatAllLimitations(limitations) : undefined,
      };
    });

    /**
     * Get connector health summary
     * XAF-007
     */
    ctx.actions.register("connector.getHealth", async () => {
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      return {
        overallStatus,
        checkedAt: new Date().toISOString(),
        connectors: connectorHealthState,
        limitations,
        hasLimitations: limitations.length > 0,
      };
    });

    /**
     * Simulate connector degradation for testing
     * XAF-007
     */
    ctx.actions.register("connector.simulateDegradation", async (params) => {
      const p = params as unknown as { toolkitId: string; severity?: "degraded" | "error" };
      const status = p.severity ?? "degraded";
      ctx.logger.info("Simulating connector degradation", { toolkitId: p.toolkitId, status });
      connectorHealthState = updateConnectorHealthState(
        connectorHealthState,
        p.toolkitId,
        status,
        status === "error"
          ? "Simulated: Connector authentication failed"
          : "Simulated: Connector responding slowly"
      );
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      return {
        success: true,
        toolkitId: p.toolkitId,
        status,
        overallStatus,
        limitations,
        formattedLimitations: limitations.length > 0 ? formatAllLimitations(limitations) : undefined,
      };
    });

    /**
     * Restore connector to healthy state
     * XAF-007
     */
    ctx.actions.register("connector.restore", async (params) => {
      const p = params as unknown as { toolkitId: string };
      ctx.logger.info("Restoring connector health", { toolkitId: p.toolkitId });
      connectorHealthState = updateConnectorHealthState(
        connectorHealthState,
        p.toolkitId,
        "ok"
      );
      const limitations = generateToolkitLimitations(connectorHealthState);
      const overallStatus = computeDepartmentHealthStatus(connectorHealthState);
      return {
        success: true,
        toolkitId: p.toolkitId,
        status: "ok",
        overallStatus,
        limitations,
        hasLimitations: limitations.length > 0,
      };
    });

    /**
     * Perform actual runtime health check for all connectors.
     * 
     * This implements XAF-007: Department workflows degrade explicitly when
     * dependent connectors or tools are impaired, rather than blindly reporting ok.
     */
    ctx.actions.register("connector.checkHealth", async () => {
      ctx.logger.info("Performing runtime connector health check", { 
        connectorCount: connectorHealthState.length 
      });
      
      const checkResult = await performRuntimeHealthCheck(connectorHealthState);
      connectorHealthState = checkResult.updatedStates;
      
      ctx.logger.info("Connector health check completed", {
        overallStatus: checkResult.overallStatus,
        checkedConnectors: checkResult.checkResults.filter(r => r.wasChecked).length,
        hasImpaired: checkResult.checkResults.some(r => r.status !== "ok"),
      });
      
      const limitations = generateToolkitLimitations(connectorHealthState);
      
      return {
        success: true,
        overallStatus: checkResult.overallStatus,
        checkedAt: new Date().toISOString(),
        connectors: connectorHealthState,
        checkResults: checkResult.checkResults,
        limitations,
        hasLimitations: limitations.length > 0,
        formattedLimitations: limitations.length > 0 ? formatAllLimitations(limitations) : undefined,
      };
    });

    // ============================================
    // Approval Routing Actions (VAL-DEPT-FR-001)
    // ============================================

    /**
     * Create a new approval route
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.createRoute", async (params) => {
      const p = params as unknown as CreateApprovalRouteParams;
      ctx.logger.info("Creating approval route", { name: p.name, category: p.category });
      const route = approvalService.createRoute(p);
      return { route };
    });

    /**
     * Get an approval route by ID
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.getRoute", async (params) => {
      const p = params as unknown as { routeId: string };
      const route = approvalService.getRoute(p.routeId);
      return { route: route ?? null };
    });

    /**
     * Get all approval routes
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.getAllRoutes", async () => {
      const routes = approvalService.getAllRoutes();
      return { routes };
    });

    /**
     * Create a new approval request
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.createRequest", async (params) => {
      const p = params as unknown as CreateApprovalRequestParams;
      ctx.logger.info("Creating approval request", { title: p.title, routeId: p.routeId });
      const request = approvalService.createRequest(p);
      return { request };
    });

    /**
     * Get an approval request by ID
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.getRequest", async (params) => {
      const p = params as unknown as { requestId: string };
      const request = approvalService.getRequest(p.requestId);
      return { request: request ?? null };
    });

    /**
     * Get pending approval requests for an approver
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.getPendingForApprover", async (params) => {
      const p = params as unknown as { approverRoleKey: string };
      const requests = approvalService.getPendingRequestsForApprover(p.approverRoleKey);
      return { requests };
    });

    /**
     * Add evidence to an approval request
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.addEvidence", async (params) => {
      const p = params as unknown as AddApprovalEvidenceParams;
      const request = approvalService.addEvidence(p);
      return { request: request ?? null };
    });

    /**
     * Submit an approval decision
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.submitDecision", async (params) => {
      const p = params as unknown as SubmitApprovalDecisionParams;
      ctx.logger.info("Submitting approval decision", { requestId: p.requestId, approverRoleKey: p.approverRoleKey });
      const request = approvalService.submitDecision(p);
      return { request: request ?? null };
    });

    /**
     * Delegate an approval
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.delegate", async (params) => {
      const p = params as unknown as DelegateApprovalParams;
      const request = approvalService.delegateApproval(p);
      return { request: request ?? null };
    });

    /**
     * Report an exception on an approval request
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.reportException", async (params) => {
      const p = params as unknown as ReportApprovalExceptionParams;
      ctx.logger.info("Reporting approval exception", { requestId: p.requestId, type: p.type });
      const request = approvalService.reportException(p);
      return { request: request ?? null };
    });

    /**
     * Resolve an exception
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.resolveException", async (params) => {
      const p = params as unknown as ResolveApprovalExceptionParams;
      const request = approvalService.resolveException(p);
      return { request: request ?? null };
    });

    /**
     * Cancel an approval request
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.cancel", async (params) => {
      const p = params as unknown as CancelApprovalRequestParams;
      const request = approvalService.cancelRequest(p);
      return { request: request ?? null };
    });

    /**
     * Get SLA status for an approval request
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.getSLAStatus", async (params) => {
      const p = params as unknown as { requestId: string };
      const slaStatus = approvalService.getSLAStatus(p.requestId);
      return { slaStatus };
    });

    /**
     * Generate approval request report
     * VAL-DEPT-FR-001
     */
    ctx.actions.register("approval.generateReport", async (params) => {
      const p = params as unknown as { requestId: string };
      const report = approvalService.generateRequestReport(p.requestId);
      return { report: report ?? null };
    });

    // ============================================
    // Variance and Anomaly Actions (VAL-DEPT-FR-002)
    // ============================================

    /**
     * Detect a forecast variance
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.detect", async (params) => {
      const p = params as unknown as DetectVarianceParams;
      ctx.logger.info("Detecting variance", { title: p.title });
      const variance = varianceAnomalyService.detectVariance(p);
      return { variance };
    });

    /**
     * Get a variance by ID
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.get", async (params) => {
      const p = params as unknown as { varianceId: string };
      const variance = varianceAnomalyService.getVariance(p.varianceId);
      return { variance: variance ?? null };
    });

    /**
     * Get all variances
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.getAll", async () => {
      const variances = varianceAnomalyService.getAllVariances();
      return { variances };
    });

    /**
     * Get material variances
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.getMaterial", async () => {
      const variances = varianceAnomalyService.getMaterialVariances();
      return { variances };
    });

    /**
     * Explain a variance with driver analysis
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.explain", async (params) => {
      const p = params as unknown as ExplainVarianceParams;
      ctx.logger.info("Explaining variance", { varianceId: p.varianceId });
      const variance = varianceAnomalyService.explainVariance(p);
      return { variance: variance ?? null };
    });

    /**
     * Assign a follow-up action to a variance
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.assignFollowUp", async (params) => {
      const p = params as unknown as AssignVarianceFollowUpParams;
      const variance = varianceAnomalyService.assignVarianceFollowUp(p);
      return { variance: variance ?? null };
    });

    /**
     * Update variance follow-up status
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.updateFollowUpStatus", async (params) => {
      const p = params as unknown as UpdateVarianceFollowUpStatusParams;
      const variance = varianceAnomalyService.updateVarianceFollowUpStatus(p);
      return { variance: variance ?? null };
    });

    /**
     * Resolve a variance
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.resolve", async (params) => {
      const p = params as unknown as { varianceId: string };
      const variance = varianceAnomalyService.resolveVariance(p.varianceId);
      return { variance: variance ?? null };
    });

    /**
     * Dismiss a variance
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.dismiss", async (params) => {
      const p = params as unknown as { varianceId: string; reason: string };
      const variance = varianceAnomalyService.dismissVariance(p.varianceId, p.reason);
      return { variance: variance ?? null };
    });

    /**
     * Generate variance summary
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("variance.getSummary", async () => {
      const summary = varianceAnomalyService.generateVarianceSummary();
      return { summary };
    });

    /**
     * Detect a financial anomaly
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.detect", async (params) => {
      const p = params as unknown as DetectAnomalyParams;
      ctx.logger.info("Detecting anomaly", { title: p.title });
      const anomaly = varianceAnomalyService.detectAnomaly(p);
      return { anomaly };
    });

    /**
     * Get an anomaly by ID
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.get", async (params) => {
      const p = params as unknown as { anomalyId: string };
      const anomaly = varianceAnomalyService.getAnomaly(p.anomalyId);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Get all anomalies
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.getAll", async () => {
      const anomalies = varianceAnomalyService.getAllAnomalies();
      return { anomalies };
    });

    /**
     * Get urgent (critical/high severity) anomalies
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.getUrgent", async () => {
      const anomalies = varianceAnomalyService.getUrgentAnomalies();
      return { anomalies };
    });

    /**
     * Explain an anomaly with cause analysis
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.explain", async (params) => {
      const p = params as unknown as ExplainAnomalyParams;
      ctx.logger.info("Explaining anomaly", { anomalyId: p.anomalyId });
      const anomaly = varianceAnomalyService.explainAnomaly(p);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Mark an anomaly as false positive
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.markFalsePositive", async (params) => {
      const p = params as unknown as MarkAnomalyFalsePositiveParams;
      const anomaly = varianceAnomalyService.markFalsePositive(p);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Assign a follow-up action to an anomaly
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.assignFollowUp", async (params) => {
      const p = params as unknown as AssignAnomalyFollowUpParams;
      const anomaly = varianceAnomalyService.assignAnomalyFollowUp(p);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Update anomaly follow-up status
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.updateFollowUpStatus", async (params) => {
      const p = params as unknown as UpdateAnomalyFollowUpStatusParams;
      const anomaly = varianceAnomalyService.updateAnomalyFollowUpStatus(p);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Resolve an anomaly
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.resolve", async (params) => {
      const p = params as unknown as { anomalyId: string };
      const anomaly = varianceAnomalyService.resolveAnomaly(p.anomalyId);
      return { anomaly: anomaly ?? null };
    });

    /**
     * Link an anomaly to a variance
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.linkToVariance", async (params) => {
      const p = params as unknown as { anomalyId: string; varianceId: string };
      const linked = varianceAnomalyService.linkAnomalyToVariance(p.anomalyId, p.varianceId);
      return { success: linked };
    });

    /**
     * Generate anomaly summary
     * VAL-DEPT-FR-002
     */
    ctx.actions.register("anomaly.getSummary", async () => {
      const summary = varianceAnomalyService.generateAnomalySummary();
      return { summary };
    });
  },

  async onHealth() {
    return { status: "ok", message: "Plugin worker is running" };
  }
});

export default plugin;
// @ts-ignore - import.meta is only available in ES modules
runWorker(plugin, import.meta.url);
