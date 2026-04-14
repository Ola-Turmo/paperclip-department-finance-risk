/**
 * FinancialReportService Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinancialReportService } from '../../../src/accounting/reporting/engine/report-engine.js';
import { FinancialDataWarehouse } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { DimAccountService, DimEntityService, DimTimeService } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryDimAccountRepo, InMemoryDimEntityRepo } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryGLEntryRepo, InMemoryBalanceRepo } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { AccountNormalBalance } from '../../../src/accounting/core/chart-of-accounts-config.js';

describe('FinancialReportService', () => {
  let reportService: FinancialReportService;
  let warehouse: FinancialDataWarehouse;
  let dimAccount: DimAccountService;
  let dimEntity: DimEntityService;
  let dimTime: DimTimeService;

  beforeEach(async () => {
    vi.mock('../../../src/accounting/python-bridge', () => ({
      executePython: vi.fn().mockResolvedValue('{}'),
    }));

    const glEntryRepo = new InMemoryGLEntryRepo();
    const balanceRepo = new InMemoryBalanceRepo();
    const dimAccountRepo = new InMemoryDimAccountRepo();
    const dimEntityRepo = new InMemoryDimEntityRepo();

    dimAccount = new DimAccountService(dimAccountRepo);
    dimEntity = new DimEntityService(dimEntityRepo);
    dimTime = new DimTimeService();

    // Seed accounts
    await dimAccount.upsert({
      accountKey: '1000', accountCode: '1000', accountName: 'Cash',
      accountType: 'asset', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'none', balanceSheetRole: 'current_asset',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '4000', accountCode: '4000', accountName: 'Sales Revenue',
      accountType: 'revenue', balanceType: AccountNormalBalance.CREDIT,
      incomeStatementRole: 'revenue', balanceSheetRole: 'none',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '5000', accountCode: '5000', accountName: 'Cost of Goods Sold',
      accountType: 'expense', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'cogs', balanceSheetRole: 'none',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '6000', accountCode: '6000', accountName: 'Salaries & Wages',
      accountType: 'expense', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'operating_expense', balanceSheetRole: 'none',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '6100', accountCode: '6100', accountName: 'Office Supplies',
      accountType: 'expense', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'operating_expense', balanceSheetRole: 'none',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });

    await dimEntity.upsert({
      entityKey: 'ENT-001', entityId: 'ENT-001', entityName: 'Test Entity',
      entityType: 'CORPORATION', ownershipPercent: 100,
      consolidationMethod: 'FULL', functionalCurrency: 'USD',
      presentationCurrency: 'USD', taxJurisdiction: 'US', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    dimTime.generateFiscalCalendar(2025, 1);

    warehouse = new FinancialDataWarehouse(glEntryRepo, balanceRepo, dimAccount, dimEntity);
    warehouse.setDimTime(dimTime);

    reportService = new FinancialReportService(warehouse, dimAccount, dimTime);
  });

  it('should list available reports', () => {
    const reports = reportService.listAvailableReports();
    expect(reports.length).toBeGreaterThan(0);
    expect(reports.some(r => r.id === 'income_statement')).toBe(true);
    expect(reports.some(r => r.id === 'trial_balance')).toBe(true);
  });

  it('should generate a trial balance report', async () => {
    // Ingest some data
    await warehouse.ingestJournalEntry({
      journalId: 'JE-001', journalLineId: 'JE-001-L1', transactionId: 'TXN-001',
      documentNumber: 'DOC-001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '10000', debitAmount: '0', creditAmount: '10000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const report = await reportService.getReport({
      reportType: 'trial_balance',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    expect(report.reportType).toBe('trial_balance');
    expect(report.sections.length).toBeGreaterThan(0);
  });

  it('should generate an income statement report', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-002', journalLineId: 'JE-002-L1', transactionId: 'TXN-002',
      documentNumber: 'DOC-002', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '50000', debitAmount: '0', creditAmount: '50000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });
    await warehouse.ingestJournalEntry({
      journalId: 'JE-003', journalLineId: 'JE-003-L1', transactionId: 'TXN-003',
      documentNumber: 'DOC-003', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '5000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '30000', debitAmount: '30000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const report = await reportService.getReport({
      reportType: 'income_statement',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    expect(report.reportType).toBe('income_statement');
    expect(report.sections.length).toBeGreaterThan(0);
  });

  it('should generate income statement with prior month comparison', async () => {
    const report = await reportService.getReport({
      reportType: 'income_statement',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
      comparisonType: 'PRIOR_MONTH',
    });

    expect(report.sections.length).toBeGreaterThan(0);
  });

  it('should generate income statement with budget comparison', async () => {
    const report = await reportService.getReport({
      reportType: 'income_statement_budget',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    expect(report.reportType).toBe('income_statement');
  });

  it('should export report as JSON', async () => {
    const report = await reportService.getReport({
      reportType: 'trial_balance',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    const json = reportService.exportReport(report, 'json');
    expect(json).toBeDefined();
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it('should export report as CSV', async () => {
    const report = await reportService.getReport({
      reportType: 'trial_balance',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    const csv = reportService.exportReport(report, 'csv');
    expect(csv).toContain('Report:');
    expect(csv).toContain('Period:');
  });

  it('should throw error for unknown report type', async () => {
    await expect(reportService.getReport({
      reportType: 'unknown_report',
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    })).rejects.toThrow('Unknown report type');
  });

  it('should get drilldown data', async () => {
    const drilldown = await reportService.getDrilldown({
      accountKey: '4000',
      entityKey: 'ENT-001',
      dateKey: '2025-01-31',
      level: 'journal_entry',
    });

    expect(drilldown).toBeDefined();
    expect(Array.isArray(drilldown.entries)).toBe(true);
  });
});
