/**
 * Approval Routing Service
 * VAL-DEPT-FR-001: Approval routing preserves evidence, traceability, and control boundaries
 * 
 * Routes approval requests with complete evidence, maintains segregation-of-duties boundaries,
 * and records owner and disposition for exceptions.
 */

import type {
  ApprovalRoute,
  ApprovalRequest,
  ApprovalEvidence,
  ApprovalChainEntry,
  ApprovalDisposition,
  ApprovalException,
  ApprovalAuditEntry,
  ApprovalStatus,
  ApprovalCategory,
  ApprovalWorkflowState,
  CreateApprovalRouteParams,
  CreateApprovalRequestParams,
  SubmitApprovalDecisionParams,
  DelegateApprovalParams,
  ReportApprovalExceptionParams,
  ResolveApprovalExceptionParams,
  CancelApprovalRequestParams,
  AddApprovalEvidenceParams,
  ControlBoundaryLevel,
} from "./types.js";

function generateId(): string {
  return `${Date.now()}-${Math.random().toString(36).substring(2, 11)}`;
}

function createAuditEntry(
  action: string,
  details: string,
  performedByRoleKey?: string,
  previousValue?: string,
  newValue?: string
): ApprovalAuditEntry {
  return {
    id: generateId(),
    timestamp: new Date().toISOString(),
    action,
    performedByRoleKey,
    details,
    previousValue,
    newValue,
  };
}

function checkSegregationViolation(
  request: ApprovalRequest,
  approverRoleKey: string,
  route: ApprovalRoute
): { violated: boolean; description?: string } {
  // Requester cannot be approver
  if (request.requesterRoleKey === approverRoleKey) {
    return {
      violated: true,
      description: `Segregation violation: approver ${approverRoleKey} is the same as requester ${request.requesterRoleKey}`,
    };
  }

  // Check if approver has already participated (decided, delegated, etc. - not pending)
  const approverInChain = request.approvalChain.some(
    (entry) => entry.approverRoleKey === approverRoleKey && entry.status !== "pending"
  );
  if (approverInChain) {
    return {
      violated: true,
      description: `Segregation violation: approver ${approverRoleKey} has already participated in this approval chain`,
    };
  }

  // Check control boundary restrictions
  if (route.controlBoundary.blockedRoles.includes("approver")) {
    return {
      violated: true,
      description: `Control boundary restriction: approver role is blocked for this approval category`,
    };
  }

  return { violated: false };
}

function calculateSLABreachLevel(
  requestedAt: string,
  slaBusinessDays: number
): "none" | "warning" | "breached" {
  const requested = new Date(requestedAt);
  const now = new Date();
  
  // Calculate business days between
  let businessDays = 0;
  const current = new Date(requested);
  while (current < now) {
    current.setDate(current.getDate() + 1);
    const dayOfWeek = current.getDay();
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      businessDays++;
    }
  }

  if (businessDays > slaBusinessDays * 1.5) {
    return "breached";
  }
  if (businessDays > slaBusinessDays) {
    return "warning";
  }
  return "none";
}

export class ApprovalService {
  private state: ApprovalWorkflowState;

  constructor(initialState?: ApprovalWorkflowState) {
    this.state = initialState ?? {
      routes: {},
      requests: {},
      lastUpdated: new Date().toISOString(),
    };
  }

  // ============================================
  // Approval Route Management
  // ============================================

  /**
   * Create a new approval route with control boundaries
   * VAL-DEPT-FR-001
   */
  createRoute(params: CreateApprovalRouteParams): ApprovalRoute {
    const now = new Date().toISOString();
    const route: ApprovalRoute = {
      id: generateId(),
      name: params.name,
      category: params.category,
      description: params.description,
      requiredApproverRoleKeys: params.requiredApproverRoleKeys,
      minimumApprovals: params.minimumApprovals,
      controlBoundary: params.controlBoundary,
      evidenceRequirements: params.evidenceRequirements,
      slaBusinessDays: params.slaBusinessDays,
      createdAt: now,
      updatedAt: now,
    };

    this.state.routes[route.id] = route;
    this.state.lastUpdated = now;

    return route;
  }

  /**
   * Get a route by ID
   */
  getRoute(routeId: string): ApprovalRoute | undefined {
    return this.state.routes[routeId];
  }

  /**
   * Get all routes
   */
  getAllRoutes(): ApprovalRoute[] {
    return Object.values(this.state.routes);
  }

  /**
   * Get routes by category
   */
  getRoutesByCategory(category: ApprovalRoute["category"]): ApprovalRoute[] {
    return Object.values(this.state.routes).filter((r) => r.category === category);
  }

  /**
   * Determine the appropriate route for a request based on amount/category
   */
  determineRoute(category: ApprovalCategory, amount?: number): ApprovalRoute | undefined {
    const routes = this.getRoutesByCategory(category);
    if (routes.length === 0) return undefined;

    // For now, return the first matching route
    // In a real system, this would check amount thresholds and other criteria
    return routes[0];
  }

  // ============================================
  // Approval Request Management
  // ============================================

  /**
   * Create a new approval request
   * VAL-DEPT-FR-001
   */
  createRequest(params: CreateApprovalRequestParams): ApprovalRequest {
    const route = this.state.routes[params.routeId];
    if (!route) {
      throw new Error(`Route ${params.routeId} not found`);
    }

    const now = new Date().toISOString();

    // Build initial approval chain
    const approvalChain: ApprovalChainEntry[] = route.requiredApproverRoleKeys.map((roleKey) => ({
      id: generateId(),
      approverRoleKey: roleKey,
      status: "pending" as const,
    }));

    const request: ApprovalRequest = {
      id: generateId(),
      routeId: params.routeId,
      title: params.title,
      description: params.description,
      category: params.category,
      priority: params.priority ?? "medium",
      status: "pending",
      requesterRoleKey: params.requesterRoleKey,
      requestedAt: now,
      updatedAt: now,
      amount: params.amount,
      currency: params.currency ?? "USD",
      evidence: (params.evidence ?? []).map((e) => ({
        ...e,
        id: generateId(),
        collectedAt: now,
      })),
      approvalChain,
      disposition: {
        status: "approved",
        summary: "",
        followUpRequired: false,
      },
      exceptions: [],
      auditTrail: [
        createAuditEntry(
          "request.created",
          `Approval request created: ${params.title}`,
          params.requesterRoleKey
        ),
      ],
      relatedRequestIds: params.relatedRequestIds ?? [],
    };

    this.state.requests[request.id] = request;
    this.state.lastUpdated = now;

    // Validate evidence requirements
    this.validateEvidenceRequirements(request.id);

    return request;
  }

  /**
   * Get a request by ID
   */
  getRequest(requestId: string): ApprovalRequest | undefined {
    return this.state.requests[requestId];
  }

  /**
   * Get all requests
   */
  getAllRequests(): ApprovalRequest[] {
    return Object.values(this.state.requests);
  }

  /**
   * Get requests by status
   */
  getRequestsByStatus(status: ApprovalStatus): ApprovalRequest[] {
    return Object.values(this.state.requests).filter((r) => r.status === status);
  }

  /**
   * Get requests by requester
   */
  getRequestsByRequester(requesterRoleKey: string): ApprovalRequest[] {
    return Object.values(this.state.requests).filter((r) => r.requesterRoleKey === requesterRoleKey);
  }

  /**
   * Get pending requests for an approver
   */
  getPendingRequestsForApprover(approverRoleKey: string): ApprovalRequest[] {
    return Object.values(this.state.requests).filter((r) => {
      if (r.status !== "pending" && r.status !== "in-review") return false;
      return r.approvalChain.some(
        (entry) => entry.approverRoleKey === approverRoleKey && entry.status === "pending"
      );
    });
  }

  /**
   * Add evidence to a request
   * VAL-DEPT-FR-001
   */
  addEvidence(params: AddApprovalEvidenceParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const now = new Date().toISOString();
    const newEvidence: ApprovalEvidence = {
      ...params.evidence,
      id: generateId(),
      collectedAt: now,
    };

    request.evidence.push(newEvidence);
    request.auditTrail.push(
      createAuditEntry("evidence.added", `Added evidence: ${newEvidence.title}`, newEvidence.collectedByRoleKey)
    );
    request.updatedAt = now;
    this.state.lastUpdated = now;

    // Re-validate evidence requirements
    this.validateEvidenceRequirements(params.requestId);

    return request;
  }

  /**
   * Submit an approval decision
   * VAL-DEPT-FR-001
   */
  submitDecision(params: SubmitApprovalDecisionParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const route = this.state.routes[request.routeId];
    if (!route) return undefined;

    const now = new Date().toISOString();

    // Check segregation of duties
    const segregationCheck = checkSegregationViolation(request, params.approverRoleKey, route);
    if (segregationCheck.violated) {
      // Create exception for segregation violation
      const exception: ApprovalException = {
        id: generateId(),
        type: "segregation-violation",
        description: segregationCheck.description ?? "Segregation of duties violation detected",
        severity: "critical",
        reportedAt: now,
        reportedByRoleKey: params.approverRoleKey,
        disposition: "escalated",
      };
      request.exceptions.push(exception);
      request.auditTrail.push(
        createAuditEntry(
          "exception.reported",
          `Segregation violation: ${exception.description}`,
          params.approverRoleKey
        )
      );
      request.updatedAt = now;
      this.state.lastUpdated = now;
      return request;
    }

    // Find the pending approval chain entry
    const chainEntry = request.approvalChain.find(
      (entry) => entry.approverRoleKey === params.approverRoleKey && entry.status === "pending"
    );

    if (!chainEntry) {
      return undefined; // No pending entry for this approver
    }

    // Update chain entry
    chainEntry.status = params.decision.decision === "delegated" ? "delegated" : params.decision.decision;
    chainEntry.decision = params.decision;
    chainEntry.decisionRationale = params.decision.rationale;
    chainEntry.decidedAt = now;

    if (params.decision.decision === "delegated" && params.decision.conditions) {
      chainEntry.delegatedToRoleKey = params.decision.conditions[0];
      chainEntry.delegatedAt = now;
    }

    request.auditTrail.push(
      createAuditEntry(
        "decision.submitted",
        `${params.approverRoleKey} submitted decision: ${params.decision.decision}`,
        params.approverRoleKey,
        undefined,
        params.decision.decision
      )
    );

    // Update request status
    if (params.decision.decision === "rejected") {
      request.status = "rejected";
      request.disposition = {
        status: "rejected",
        summary: params.decision.rationale,
        decidedByRoleKey: params.approverRoleKey,
        decidedAt: now,
        conditions: params.decision.conditions,
        followUpRequired: params.decision.conditions && params.decision.conditions.length > 0,
      };
    } else if (params.decision.decision === "exception") {
      request.status = "exception";
      // Create exception record
      const exception: ApprovalException = {
        id: generateId(),
        type: "policy-conflict",
        description: params.decision.rationale,
        severity: "medium",
        reportedAt: now,
        reportedByRoleKey: params.approverRoleKey,
        disposition: "accepted",
      };
      request.exceptions.push(exception);
      request.disposition = {
        status: "exception",
        summary: params.decision.rationale,
        decidedByRoleKey: params.approverRoleKey,
        decidedAt: now,
        conditions: params.decision.conditions,
        followUpRequired: true,
      };
    } else if (params.decision.decision === "approved") {
      // Check if we have enough approvals
      const approvedCount = request.approvalChain.filter(
        (entry) => entry.status === "approved"
      ).length;

      if (approvedCount >= route.minimumApprovals) {
        request.status = "approved";
        request.disposition = {
          status: "approved",
          summary: `Approved with ${approvedCount} approvals`,
          decidedByRoleKey: params.approverRoleKey,
          decidedAt: now,
          conditions: params.decision.conditions,
          followUpRequired: params.decision.conditions && params.decision.conditions.length > 0,
        };
      } else {
        request.status = "in-review";
      }
    }

    request.updatedAt = now;
    this.state.lastUpdated = now;

    return request;
  }

  /**
   * Delegate an approval
   * VAL-DEPT-FR-001
   */
  delegateApproval(params: DelegateApprovalParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const now = new Date().toISOString();

    // Find the pending entry for this approver
    const chainEntry = request.approvalChain.find(
      (entry) => entry.approverRoleKey === params.approverRoleKey && entry.status === "pending"
    );

    if (!chainEntry) return undefined;

    // Update chain entry as delegated
    chainEntry.status = "delegated";
    chainEntry.decision = {
      decision: "delegated",
      rationale: params.rationale,
      conditions: [params.delegateToRoleKey],
    };
    chainEntry.delegatedToRoleKey = params.delegateToRoleKey;
    chainEntry.delegatedAt = now;

    // Add new delegated approver to chain
    const newEntry: ApprovalChainEntry = {
      id: generateId(),
      approverRoleKey: params.delegateToRoleKey,
      status: "pending",
    };
    request.approvalChain.push(newEntry);

    request.auditTrail.push(
      createAuditEntry(
        "approval.delegated",
        `${params.approverRoleKey} delegated to ${params.delegateToRoleKey}: ${params.rationale}`,
        params.approverRoleKey,
        undefined,
        params.delegateToRoleKey
      )
    );

    request.updatedAt = now;
    this.state.lastUpdated = now;

    return request;
  }

  /**
   * Report an exception on an approval request
   * VAL-DEPT-FR-001
   */
  reportException(params: ReportApprovalExceptionParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const now = new Date().toISOString();

    const exception: ApprovalException = {
      id: generateId(),
      type: params.type,
      description: params.description,
      severity: params.severity,
      reportedAt: now,
      reportedByRoleKey: params.reportedByRoleKey,
    };

    request.exceptions.push(exception);
    request.status = "exception";
    request.auditTrail.push(
      createAuditEntry(
        "exception.reported",
        `Exception reported (${params.type}): ${params.description}`,
        params.reportedByRoleKey
      )
    );

    request.updatedAt = now;
    this.state.lastUpdated = now;

    return request;
  }

  /**
   * Resolve an exception
   * VAL-DEPT-FR-001
   */
  resolveException(params: ResolveApprovalExceptionParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const exception = request.exceptions.find((e) => e.id === params.exceptionId);
    if (!exception) return undefined;

    const now = new Date().toISOString();
    exception.resolution = params.resolution;
    exception.resolvedAt = now;
    exception.resolvedByRoleKey = params.resolvedByRoleKey;
    exception.disposition = params.disposition;

    request.auditTrail.push(
      createAuditEntry(
        "exception.resolved",
        `Exception ${params.exceptionId} resolved as ${params.disposition}: ${params.resolution}`,
        params.resolvedByRoleKey
      )
    );

    // Check if all exceptions are resolved
    const unresolvedExceptions = request.exceptions.filter((e) => !e.resolvedAt);
    if (unresolvedExceptions.length === 0 && request.status === "exception") {
      request.status = "in-review";
    }

    request.updatedAt = now;
    this.state.lastUpdated = now;

    return request;
  }

  /**
   * Cancel an approval request
   * VAL-DEPT-FR-001
   */
  cancelRequest(params: CancelApprovalRequestParams): ApprovalRequest | undefined {
    const request = this.state.requests[params.requestId];
    if (!request) return undefined;

    const now = new Date().toISOString();
    request.status = "cancelled";
    request.disposition = {
      status: "cancelled",
      summary: params.reason,
      decidedByRoleKey: params.cancelledByRoleKey,
      decidedAt: now,
      followUpRequired: false,
    };

    request.auditTrail.push(
      createAuditEntry(
        "request.cancelled",
        `Request cancelled by ${params.cancelledByRoleKey}: ${params.reason}`,
        params.cancelledByRoleKey
      )
    );

    request.updatedAt = now;
    this.state.lastUpdated = now;

    return request;
  }

  /**
   * Validate evidence requirements for a request
   */
  private validateEvidenceRequirements(requestId: string): boolean {
    const request = this.state.requests[requestId];
    if (!request) return false;

    const route = this.state.routes[request.routeId];
    if (!route) return false;

    const collectedTypes = new Set(request.evidence.map((e) => e.type));
    const missingTypes = route.evidenceRequirements.filter((type) => !collectedTypes.has(type));

    if (missingTypes.length > 0) {
      // Report evidence gap exception if not already reported
      const hasGapException = request.exceptions.some((e) => e.type === "evidence-gap");
      if (!hasGapException) {
        const now = new Date().toISOString();
        const exception: ApprovalException = {
          id: generateId(),
          type: "evidence-gap",
          description: `Missing required evidence types: ${missingTypes.join(", ")}`,
          severity: "high",
          reportedAt: now,
        };
        request.exceptions.push(exception);
      }
      return false;
    }

    return true;
  }

  /**
   * Get SLA status for a request
   */
  getSLAStatus(requestId: string): {
    status: "on-track" | "warning" | "breached";
    businessDaysElapsed: number;
    slaBusinessDays: number;
  } {
    const request = this.state.requests[requestId];
    if (!request) {
      return { status: "on-track", businessDaysElapsed: 0, slaBusinessDays: 0 };
    }

    const route = this.state.routes[request.routeId];
    if (!route) {
      return { status: "on-track", businessDaysElapsed: 0, slaBusinessDays: 0 };
    }

    const requested = new Date(request.requestedAt);
    const now = new Date();
    
    let businessDays = 0;
    const current = new Date(requested);
    while (current < now) {
      current.setDate(current.getDate() + 1);
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        businessDays++;
      }
    }

    let status: "on-track" | "warning" | "breached" = "on-track";
    if (businessDays > route.slaBusinessDays * 1.5) {
      status = "breached";
    } else if (businessDays > route.slaBusinessDays) {
      status = "warning";
    }

    return {
      status,
      businessDaysElapsed: businessDays,
      slaBusinessDays: route.slaBusinessDays,
    };
  }

  /**
   * Generate approval request report
   * VAL-DEPT-FR-001
   */
  generateRequestReport(requestId: string): {
    request: ApprovalRequest;
    route: ApprovalRoute | undefined;
    slaStatus: ReturnType<ApprovalService["getSLAStatus"]>;
    summary: {
      totalEvidence: number;
      evidenceByType: Record<string, number>;
      totalExceptions: number;
      unresolvedExceptions: number;
      approvalsCompleted: number;
      approvalsRequired: number;
      controlBoundaryLevel: ControlBoundaryLevel;
    };
  } | undefined {
    const request = this.state.requests[requestId];
    if (!request) return undefined;

    const route = this.state.routes[request.routeId];

    const evidenceByType: Record<string, number> = {};
    for (const e of request.evidence) {
      evidenceByType[e.type] = (evidenceByType[e.type] ?? 0) + 1;
    }

    const unresolvedExceptions = request.exceptions.filter((e) => !e.resolvedAt);
    const approvalsCompleted = request.approvalChain.filter((entry) => entry.status === "approved").length;

    return {
      request,
      route,
      slaStatus: this.getSLAStatus(requestId),
      summary: {
        totalEvidence: request.evidence.length,
        evidenceByType,
        totalExceptions: request.exceptions.length,
        unresolvedExceptions: unresolvedExceptions.length,
        approvalsCompleted,
        approvalsRequired: route?.minimumApprovals ?? 0,
        controlBoundaryLevel: route?.controlBoundary.level ?? "standard",
      },
    };
  }

  /**
   * Get current state for persistence
   */
  getState(): ApprovalWorkflowState {
    return this.state;
  }

  /**
   * Load state from persistence
   */
  loadState(state: ApprovalWorkflowState): void {
    this.state = state;
  }
}
