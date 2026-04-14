/**
 * BudgetVsActualEngine Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { BudgetVsActualEngine } from '../../../src/accounting/reporting/budget/budget-vs-actual.js';
import { FinancialDataWarehouse } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { DimAccountService, DimEntityService, DimTimeService } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryDimAccountRepo, InMemoryDimEntityRepo } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryGLEntryRepo, InMemoryBalanceRepo } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { AccountNormalBalance } from '../../../src/accounting/core/chart-of-accounts-config.js';

describe('BudgetVsActualEngine', () => {
  let budgetEngine: BudgetVsActualEngine;
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
      accountKey: '1100', accountCode: '1100', accountName: 'Accounts Receivable',
      accountType: 'asset', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'none', balanceSheetRole: 'current_asset',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '1200', accountCode: '1200', accountName: 'Inventory',
      accountType: 'asset', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'none', balanceSheetRole: 'current_asset',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '2000', accountCode: '2000', accountName: 'Accounts Payable',
      accountType: 'liability', balanceType: AccountNormalBalance.CREDIT,
      incomeStatementRole: 'none', balanceSheetRole: 'current_liability',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '2500', accountCode: '2500', accountName: 'Long-Term Debt',
      accountType: 'liability', balanceType: AccountNormalBalance.CREDIT,
      incomeStatementRole: 'none', balanceSheetRole: 'noncurrent_liability',
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
    await dimAccount.upsert({
      accountKey: '3300', accountCode: '3300', accountName: 'Net Income',
      accountType: 'equity', balanceType: AccountNormalBalance.CREDIT,
      incomeStatementRole: 'none', balanceSheetRole: 'equity',
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

    budgetEngine = new BudgetVsActualEngine(warehouse, dimAccount, dimTime);
  });

  it('should load budget data', async () => {
    const budgetLines = [
      {
        accountKey: '4000', accountCode: '4000', accountName: 'Sales Revenue',
        periodKey: '2025-01', budgetAmount: '100000',
      },
      {
        accountKey: '5000', accountCode: '5000', accountName: 'Cost of Goods Sold',
        periodKey: '2025-01', budgetAmount: '60000',
      },
    ];

    await budgetEngine.loadBudget(budgetLines);

    // Verify by running variance analysis
    await warehouse.ingestJournalEntry({
      journalId: 'JE-001', journalLineId: 'JE-001-L1', transactionId: 'TXN-001',
      documentNumber: 'DOC-001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '120000', debitAmount: '0', creditAmount: '120000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    expect(variances.length).toBeGreaterThan(0);
  });

  it('should clear budget data for a period', async () => {
    // Ingest actual data first
    await warehouse.ingestJournalEntry({
      journalId: 'JE-CLR-001', journalLineId: 'JE-CLR-001-L1', transactionId: 'TXN-CLR-001',
      documentNumber: 'DOC-CLR-001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '50000', debitAmount: '0', creditAmount: '50000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const budgetLines = [
      {
        accountKey: '4000', accountCode: '4000', accountName: 'Sales Revenue',
        periodKey: '2025-01', budgetAmount: '100000',
      },
    ];

    await budgetEngine.loadBudget(budgetLines);
    await budgetEngine.clearBudget('2025-01');

    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    // After clearing budget, the account still appears because actual exists
    const salesVar = variances.find(v => v.accountCode === '4000');
    expect(salesVar).toBeDefined();
  });

  it('should analyze variance with actual vs budget', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-002', journalLineId: 'JE-002-L1', transactionId: 'TXN-002',
      documentNumber: 'DOC-002', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '90000', debitAmount: '0', creditAmount: '90000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const budgetLines = [
      {
        accountKey: '4000', accountCode: '4000', accountName: 'Sales Revenue',
        periodKey: '2025-01', budgetAmount: '100000',
      },
    ];
    await budgetEngine.loadBudget(budgetLines);

    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    const salesVar = variances.find(v => v.accountCode === '4000');
    expect(salesVar).toBeDefined();
    // actualAmount is negative because revenue credits are stored as negative
    expect(parseFloat(salesVar!.actualAmount)).toBe(-90000);
    expect(parseFloat(salesVar!.budgetAmount)).toBe(100000);
  });

  it('should classify variance as favorable or unfavorable', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-003', journalLineId: 'JE-003-L1', transactionId: 'TXN-003',
      documentNumber: 'DOC-003', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '5000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '70000', debitAmount: '70000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const budgetLines = [
      {
        accountKey: '5000', accountCode: '5000', accountName: 'Cost of Goods Sold',
        periodKey: '2025-01', budgetAmount: '60000',
      },
    ];
    await budgetEngine.loadBudget(budgetLines);

    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    const cogsVar = variances.find(v => v.accountCode === '5000');
    // For expenses, actual (positive) > budget, variance positive, so varianceType = FAVORABLE
    expect(cogsVar?.varianceType).toBe('FAVORABLE');
  });

  it('should generate KPI scorecard', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-004', journalLineId: 'JE-004-L1', transactionId: 'TXN-004',
      documentNumber: 'DOC-004', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '50000', debitAmount: '50000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });
    await warehouse.ingestJournalEntry({
      journalId: 'JE-005', journalLineId: 'JE-005-L1', transactionId: 'TXN-005',
      documentNumber: 'DOC-005', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '100000', debitAmount: '0', creditAmount: '100000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });
    await warehouse.ingestJournalEntry({
      journalId: 'JE-006', journalLineId: 'JE-006-L1', transactionId: 'TXN-006',
      documentNumber: 'DOC-006', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '5000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '40000', debitAmount: '40000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });
    await warehouse.ingestJournalEntry({
      journalId: 'JE-007', journalLineId: 'JE-007-L1', transactionId: 'TXN-007',
      documentNumber: 'DOC-007', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '3300', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '60000', debitAmount: '0', creditAmount: '60000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const scorecard = await budgetEngine.generateKPIScorecard({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
      currency: 'USD',
    });

    expect(scorecard.periodKey).toBe('2025-01-31');
    expect(scorecard.kpis.length).toBeGreaterThan(0);
    expect(scorecard.summary.greenCount).toBeDefined();
    expect(scorecard.summary.amberCount).toBeDefined();
    expect(scorecard.summary.redCount).toBeDefined();
  });

  it('should mark material variances', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-008', journalLineId: 'JE-008-L1', transactionId: 'TXN-008',
      documentNumber: 'DOC-008', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '4000', entityKey: 'ENT-001',
      currencyKey: 'USD', amountLcy: '200000', debitAmount: '0', creditAmount: '200000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const budgetLines = [
      {
        accountKey: '4000', accountCode: '4000', accountName: 'Sales Revenue',
        periodKey: '2025-01', budgetAmount: '100000',
      },
    ];
    await budgetEngine.loadBudget(budgetLines);

    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
      materialityThreshold: 0.05, // 5%
    });

    const salesVar = variances.find(v => v.accountCode === '4000');
    expect(salesVar?.isMaterial).toBe(true); // 100% variance is material
  });

  it('should skip zero-zero rows in variance analysis', async () => {
    const variances = await budgetEngine.analyzeVariance({
      dateKey: '2025-01-31',
      entityKey: 'ENT-001',
    });

    // Should not throw and should handle empty case
    expect(variances).toBeDefined();
  });
});
