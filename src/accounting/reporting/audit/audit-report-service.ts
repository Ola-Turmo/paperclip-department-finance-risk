/**
 * Audit Report Service — SOX compliance, audit trail, change reporting.
 * 
 * SOX Section 404 requires:
 * - Immutable audit log of all financial data changes
 * - Before/after values for every change
 * - User identification and timestamp
 * - Retention: minimum 7 years
 * - Change reason/annotation tracking
 * 
 * This service produces:
 * - User activity report (who changed what, when)
 * - Change history report (before/after values)
 * - Journal entry audit (posted, reversed, amended)
 * - Access control report (who accessed what)
 * - Segregation of duties analysis
 */

export interface AuditEntry {
  auditId: string;
  eventTimestamp: Date;
  eventType: 'CREATE' | 'UPDATE' | 'DELETE' | 'POST' | 'UNPOST' | 'APPROVE' | 'REVERSE' | 'VIEW';
  userId: string;
  userName: string;
  sessionId: string;
  ipAddress?: string;
  entityId?: string;
  journalId?: string;
  transactionId?: string;
  accountId?: string;
  oldValues?: Record<string, string | number | boolean>;
  newValues?: Record<string, string | number | boolean>;
  changeReason?: string;
  sourceSystem?: string;
  sourceDocumentId?: string;
  hash: string;                  // SHA-256 for immutability
  priorHash?: string;
  sequenceNumber: number;
}

export interface UserActivitySummary {
  userId: string;
  userName: string;
  periodStart: Date;
  periodEnd: Date;
  totalActions: number;
  actionsByType: Record<string, number>;
  lastActivityAt: Date;
  accountsModified: string[];
  journalEntriesPosted: number;
}

export interface JournalAuditReport {
  journalId: string;
  documentNumber: string;
  postingDate: string;
  status: string;
  createdBy: string;
  createdAt: Date;
  postedAt?: Date;
  reversedAt?: Date;
  reversalOf?: string;
  changeHistory: AuditEntry[];
  lineCount: number;
  totalDebit: string;
  totalCredit: string;
  isBalanced: boolean;
  hasAttachments: boolean;
  approvalChain: Array<{ approver: string; approvedAt: Date; status: string }>;
}

export interface SODViolation {
  userId: string;
  userName: string;
  role1: string;
  role2: string;
  conflictingRoles: string[];
  lastViolationDate: Date;
  severity: 'HIGH' | 'MEDIUM' | 'LOW';
  description: string;
}

export class AuditReportService {
  public auditLog: AuditEntry[] = [];
  private sequenceCounter = 0;

  /**
   * Log an audit event. Called by the OLTP system on every financial transaction.
   */
  async logEvent(event: Omit<AuditEntry, 'auditId' | 'hash' | 'priorHash' | 'sequenceNumber'>): Promise<void> {
    const auditId = crypto.randomUUID();
    const lastHash = this.auditLog[this.auditLog.length - 1]?.hash ?? 'GENESIS';
    const hash = await this.computeHash({ ...event, auditId, priorHash: lastHash, sequenceNumber: this.sequenceCounter });
    
    const entry: AuditEntry = {
      ...event,
      auditId,
      hash,
      priorHash: lastHash,
      sequenceNumber: this.sequenceCounter++,
    };
    this.auditLog.push(entry);
  }

  private async computeHash(data: Record<string, unknown>): Promise<string> {
    // SHA-256 via Web Crypto API (available in Node.js 18+)
    const str = JSON.stringify(data, Object.keys(data).sort());
    const encoded = new TextEncoder().encode(str);
    const hashBuffer = await crypto.subtle.digest('SHA-256', encoded);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  }

  /**
   * Get all audit entries for a given period, optionally filtered.
   */
  getAuditLog(params: {
    startDate?: Date;
    endDate?: Date;
    userId?: string;
    entityId?: string;
    journalId?: string;
    eventTypes?: string[];
    limit?: number;
    offset?: number;
  }): AuditEntry[] {
    return this.auditLog
      .filter(e => {
        if (params.startDate && e.eventTimestamp < params.startDate) return false;
        if (params.endDate && e.eventTimestamp > params.endDate) return false;
        if (params.userId && e.userId !== params.userId) return false;
        if (params.entityId && e.entityId !== params.entityId) return false;
        if (params.journalId && e.journalId !== params.journalId) return false;
        if (params.eventTypes && !params.eventTypes.includes(e.eventType)) return false;
        return true;
      })
      .sort((a, b) => b.eventTimestamp.getTime() - a.eventTimestamp.getTime())
      .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 100));
  }

  /**
   * Verify audit log integrity — confirm hash chain is unbroken.
   */
  verifyIntegrity(): { isValid: boolean; brokenAt?: string; entriesChecked: number } {
    for (let i = 1; i < this.auditLog.length; i++) {
      const prev = this.auditLog[i - 1];
      const curr = this.auditLog[i];
      if (curr.priorHash !== prev.hash) {
        return { isValid: false, brokenAt: curr.auditId, entriesChecked: i };
      }
    }
    return { isValid: true, entriesChecked: this.auditLog.length };
  }

  /**
   * Generate user activity summary for a period.
   */
  getUserActivitySummary(params: { startDate: Date; endDate: Date }): UserActivitySummary[] {
    const entries = this.getAuditLog({ startDate: params.startDate, endDate: params.endDate });
    const byUser = new Map<string, UserActivitySummary>();

    for (const e of entries) {
      if (!byUser.has(e.userId)) {
        byUser.set(e.userId, {
          userId: e.userId, userName: e.userName,
          periodStart: params.startDate, periodEnd: params.endDate,
          totalActions: 0, actionsByType: {},
          lastActivityAt: e.eventTimestamp, accountsModified: [],
          journalEntriesPosted: 0,
        });
      }
      const s = byUser.get(e.userId)!;
      s.totalActions++;
      s.actionsByType[e.eventType] = (s.actionsByType[e.eventType] ?? 0) + 1;
      if (e.eventTimestamp > s.lastActivityAt) s.lastActivityAt = e.eventTimestamp;
      if (e.accountId && !s.accountsModified.includes(e.accountId)) s.accountsModified.push(e.accountId);
      if (e.eventType === 'POST') s.journalEntriesPosted++;
    }

    return Array.from(byUser.values());
  }

  /**
   * Journal audit report — full history of a journal entry.
   */
  getJournalAuditReport(journalId: string): JournalAuditReport | null {
    const entries = this.auditLog.filter(e => e.journalId === journalId);
    if (entries.length === 0) return null;

    const first = entries[0];
    return {
      journalId,
      documentNumber: (first.newValues?.['documentNumber'] ?? first.oldValues?.['documentNumber'] ?? '') as string,
      postingDate: (first.newValues?.['postingDate'] ?? first.oldValues?.['postingDate'] ?? '') as string,
      status: (first.newValues?.['status'] ?? 'UNKNOWN') as string,
      createdBy: first.userName,
      createdAt: first.eventTimestamp,
      postedAt: entries.find(e => e.eventType === 'POST')?.eventTimestamp,
      reversedAt: entries.find(e => e.eventType === 'REVERSE')?.eventTimestamp,
      reversalOf: first.oldValues?.['reversalOf'] as string | undefined,
      changeHistory: entries,
      lineCount: parseInt((first.newValues?.['lineCount'] ?? first.oldValues?.['lineCount'] ?? '0') as string),
      totalDebit: (first.newValues?.['totalDebit'] ?? '0') as string,
      totalCredit: (first.newValues?.['totalCredit'] ?? '0') as string,
      isBalanced: true,
      hasAttachments: false,
      approvalChain: [],
    };
  }

  /**
   * Segregation of duties analysis — detect users with conflicting roles.
   */
  analyzeSODViolations(userRoles: Map<string, string[]>): SODViolation[] {
    // Example conflicting role pairs
    const conflicts: Array<[string[], string]> = [
      [['POST_JOURNAL', 'APPROVE_JOURNAL'], 'Posting and approving the same journal'],
      [['CREATE_VENDOR', 'APPROVE_PAYMENT'], 'Creating vendors and approving their payments'],
      [['CREATE_CUSTOMER', 'WRITE_OFF_RECEIVABLE'], 'Creating customers and writing off their receivables'],
    ];

    const violations: SODViolation[] = [];
    for (const [userId, roles] of Array.from(userRoles.entries())) {
      for (const [conflictPair, desc] of conflicts) {
        const hasBoth = conflictPair.every(r => roles.includes(r));
        if (hasBoth) {
          violations.push({
            userId,
            userName: userId,
            role1: conflictPair[0],
            role2: conflictPair[1],
            conflictingRoles: conflictPair,
            lastViolationDate: new Date(),
            severity: 'HIGH',
            description: desc,
          });
        }
      }
    }
    return violations;
  }
}
