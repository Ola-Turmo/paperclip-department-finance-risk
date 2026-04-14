/**
 * AuditReportService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { AuditReportService } from '../../../src/accounting/reporting/audit/audit-report-service.js';

describe('AuditReportService', () => {
  let auditService: AuditReportService;

  beforeEach(() => {
    vi.mock('../../../src/accounting/python-bridge', () => ({
      executePython: vi.fn().mockResolvedValue('{}'),
    }));
    auditService = new AuditReportService();
  });

  it('should log audit events', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      entityId: 'ENT-001',
      journalId: 'JE-001',
      newValues: { amount: '1000' },
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({});
    expect(log.length).toBe(1);
    expect(log[0].userId).toBe('user-001');
  });

  it('should compute hash for audit entries', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({});
    expect(log[0].hash).toBeDefined();
    expect(log[0].hash.length).toBeGreaterThan(0);
  });

  it('should chain hashes correctly', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    // getAuditLog sorts by timestamp descending (newest first)
    const log = auditService.getAuditLog({});
    // log[0] is the second event (POST), log[1] is the first event (CREATE)
    // Second event's priorHash should be first event's hash
    expect(log[0].priorHash).toBe(log[1].hash);
    // First event's priorHash should be GENESIS
    expect(log[1].priorHash).toBe('GENESIS');
  });

  it('should verify audit log integrity', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    const result = auditService.verifyIntegrity();
    expect(result.isValid).toBe(true);
    expect(result.entriesChecked).toBe(1);
  });

  it('should detect broken hash chain', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    // Tamper with the audit log - modify first entry's hash after second entry references it
    auditService.auditLog[0].hash = 'tampered-hash';

    const result = auditService.verifyIntegrity();
    expect(result.isValid).toBe(false);
    expect(result.brokenAt).toBeDefined();
  });

  it('should filter audit log by userId', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-002',
      userName: 'Jane Doe',
      sessionId: 'session-002',
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({ userId: 'user-001' });
    expect(log.length).toBe(1);
    expect(log[0].userId).toBe('user-001');
  });

  it('should filter audit log by eventTypes', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({ eventTypes: ['POST'] });
    expect(log.length).toBe(1);
    expect(log[0].eventType).toBe('POST');
  });

  it('should filter audit log by date range', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-10T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-20T10:00:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({
      startDate: new Date('2025-01-15T00:00:00Z'),
      endDate: new Date('2025-01-25T00:00:00Z'),
    });

    expect(log.length).toBe(1);
    expect(log[0].eventType).toBe('POST');
  });

  it('should get user activity summary', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      accountId: '1000',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      journalId: 'JE-001',
      sourceSystem: 'GL',
    });

    const summary = auditService.getUserActivitySummary({
      startDate: new Date('2025-01-01T00:00:00Z'),
      endDate: new Date('2025-01-31T23:59:59Z'),
    });

    expect(summary.length).toBe(1);
    expect(summary[0].userId).toBe('user-001');
    expect(summary[0].totalActions).toBe(2);
    expect(summary[0].journalEntriesPosted).toBe(1);
  });

  it('should get journal audit report', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      journalId: 'JE-AUDIT-001',
      newValues: {
        documentNumber: 'DOC-001',
        postingDate: '2025-01-15',
        status: 'DRAFT',
        lineCount: '2',
        totalDebit: '1000',
        totalCredit: '1000',
      },
      sourceSystem: 'GL',
    });

    const report = auditService.getJournalAuditReport('JE-AUDIT-001');
    expect(report).not.toBeNull();
    expect(report!.journalId).toBe('JE-AUDIT-001');
    expect(report!.documentNumber).toBe('DOC-001');
  });

  it('should return null for non-existent journal audit report', async () => {
    const report = auditService.getJournalAuditReport('JE-NON-EXISTENT');
    expect(report).toBeNull();
  });

  it('should analyze SOD violations', async () => {
    const userRoles = new Map<string, string[]>();
    userRoles.set('user-001', ['POST_JOURNAL', 'APPROVE_JOURNAL']);
    userRoles.set('user-002', ['CREATE_VENDOR', 'APPROVE_PAYMENT']);
    userRoles.set('user-003', ['VIEW_REPORTS']);

    const violations = auditService.analyzeSODViolations(userRoles);

    expect(violations.length).toBe(2);
    expect(violations.some(v => v.userId === 'user-001')).toBe(true);
    expect(violations.some(v => v.userId === 'user-002')).toBe(true);
  });

  it('should handle multiple event types in user summary', async () => {
    const eventTypes: Array<'CREATE' | 'UPDATE' | 'POST' | 'DELETE'> = ['CREATE', 'UPDATE', 'POST', 'DELETE'];
    for (let idx = 0; idx < eventTypes.length; idx++) {
      const type = eventTypes[idx];
      await auditService.logEvent({
        eventTimestamp: new Date(`2025-01-${15 + idx}T10:0${idx}:00Z`),
        eventType: type,
        userId: 'user-multi',
        userName: 'Multi User',
        sessionId: `session-${idx}`,
        sourceSystem: 'GL',
      });
    }

    const summary = auditService.getUserActivitySummary({
      startDate: new Date('2025-01-01T00:00:00Z'),
      endDate: new Date('2025-01-31T23:59:59Z'),
    });

    const multiUser = summary.find(s => s.userId === 'user-multi');
    expect(multiUser?.totalActions).toBe(4);
    expect(multiUser?.actionsByType['CREATE']).toBe(1);
    expect(multiUser?.actionsByType['POST']).toBe(1);
  });

  it('should paginate audit log results', async () => {
    for (let i = 0; i < 15; i++) {
      await auditService.logEvent({
        eventTimestamp: new Date(`2025-01-${10 + i}T10:00:00Z`),
        eventType: 'CREATE',
        userId: 'user-001',
        userName: 'John Doe',
        sessionId: `session-${i}`,
        sourceSystem: 'GL',
      });
    }

    const page1 = auditService.getAuditLog({ limit: 5, offset: 0 });
    const page2 = auditService.getAuditLog({ limit: 5, offset: 5 });

    expect(page1.length).toBe(5);
    expect(page2.length).toBe(5);
    expect(page1[0].sequenceNumber).toBeGreaterThan(page2[0].sequenceNumber);
  });

  it('should filter by journalId', async () => {
    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:00:00Z'),
      eventType: 'CREATE',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      journalId: 'JE-SPECIFIC',
      sourceSystem: 'GL',
    });

    await auditService.logEvent({
      eventTimestamp: new Date('2025-01-15T10:01:00Z'),
      eventType: 'POST',
      userId: 'user-001',
      userName: 'John Doe',
      sessionId: 'session-001',
      journalId: 'JE-OTHER',
      sourceSystem: 'GL',
    });

    const log = auditService.getAuditLog({ journalId: 'JE-SPECIFIC' });
    expect(log.length).toBe(1);
    expect(log[0].journalId).toBe('JE-SPECIFIC');
  });
});
