/**
 * FinancialDataWarehouse Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { FinancialDataWarehouse, InMemoryGLEntryRepo, InMemoryBalanceRepo } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { DimAccountService, DimEntityService } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryDimAccountRepo, InMemoryDimEntityRepo } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { DimTimeService } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { AccountNormalBalance } from '../../../src/accounting/core/chart-of-accounts-config.js';

describe('FinancialDataWarehouse', () => {
  let warehouse: FinancialDataWarehouse;
  let dimAccount: DimAccountService;
  let dimEntity: DimEntityService;
  let dimTime: DimTimeService;
  let glEntryRepo: InMemoryGLEntryRepo;
  let balanceRepo: InMemoryBalanceRepo;

  beforeEach(async () => {
    vi.mock('../../../src/accounting/python-bridge', () => ({
      executePython: vi.fn().mockResolvedValue('{}'),
    }));

    glEntryRepo = new InMemoryGLEntryRepo();
    balanceRepo = new InMemoryBalanceRepo();

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

    // Seed entities
    await dimEntity.upsert({
      entityKey: 'ENT-001', entityId: 'ENT-001', entityName: 'Test Entity',
      entityType: 'CORPORATION', ownershipPercent: 100,
      consolidationMethod: 'FULL', functionalCurrency: 'USD',
      presentationCurrency: 'USD', taxJurisdiction: 'US', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    // Seed fiscal calendar
    dimTime.generateFiscalCalendar(2025, 1);

    warehouse = new FinancialDataWarehouse(glEntryRepo, balanceRepo, dimAccount, dimEntity);
    warehouse.setDimTime(dimTime);
  });

  it('should ingest a journal entry and update balances', async () => {
    const result = await warehouse.ingestJournalEntry({
      journalId: 'JE-001',
      journalLineId: 'JE-001-L1',
      transactionId: 'TXN-001',
      documentNumber: 'DOC-001',
      documentType: 'JOURNAL',
      dateKey: '2025-01-31',
      postingDateKey: '2025-01-31',
      accountKey: '4000',
      entityKey: 'ENT-001',
      currencyKey: 'USD',
      amountLcy: '1000',
      debitAmount: '0',
      creditAmount: '1000',
      sourceSystem: 'GL',
      workflowStatus: 'POSTED',
      isIntercompany: false,
    });

    expect(result.entryKey).toBeDefined();
    expect(result.balanceUpdates.length).toBeGreaterThan(0);
  });

  it('should get account balances for a period', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-002',
      journalLineId: 'JE-002-L1',
      transactionId: 'TXN-002',
      documentNumber: 'DOC-002',
      documentType: 'JOURNAL',
      dateKey: '2025-01-31',
      postingDateKey: '2025-01-31',
      accountKey: '4000',
      entityKey: 'ENT-001',
      currencyKey: 'USD',
      amountLcy: '5000',
      debitAmount: '0',
      creditAmount: '5000',
      sourceSystem: 'GL',
      workflowStatus: 'POSTED',
      isIntercompany: false,
    });

    const balances = await warehouse.getAccountBalances({
      entityKey: 'ENT-001',
      dateKey: '2025-01-31',
    });

    expect(balances.length).toBeGreaterThan(0);
  });

  it('should get account activity', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-003',
      journalLineId: 'JE-003-L1',
      transactionId: 'TXN-003',
      documentNumber: 'DOC-003',
      documentType: 'JOURNAL',
      dateKey: '2025-02-28',
      postingDateKey: '2025-02-28',
      accountKey: '4000',
      entityKey: 'ENT-001',
      currencyKey: 'USD',
      amountLcy: '2000',
      debitAmount: '0',
      creditAmount: '2000',
      sourceSystem: 'GL',
      workflowStatus: 'POSTED',
      isIntercompany: false,
    });

    const activity = await warehouse.getAccountActivity({
      accountKey: '4000',
      entityKey: 'ENT-001',
      dateKey: '2025-02-28',
    });

    expect(activity.totalCredits).toBe('2000');
    expect(activity.transactionCount).toBe(1);
  });

  it('should get trial balance data', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-004',
      journalLineId: 'JE-004-L1',
      transactionId: 'TXN-004',
      documentNumber: 'DOC-004',
      documentType: 'JOURNAL',
      dateKey: '2025-01-31',
      postingDateKey: '2025-01-31',
      accountKey: '4000',
      entityKey: 'ENT-001',
      currencyKey: 'USD',
      amountLcy: '3000',
      debitAmount: '0',
      creditAmount: '3000',
      sourceSystem: 'GL',
      workflowStatus: 'POSTED',
      isIntercompany: false,
    });

    const trialBalance = await warehouse.getTrialBalanceData({
      entityKey: 'ENT-001',
      dateKey: '2025-01-31',
    });

    expect(trialBalance.length).toBeGreaterThan(0);
  });

  it('should bulk ingest entries', async () => {
    const entries = [
      {
        journalId: 'JE-BLK-1', journalLineId: 'JE-BLK-1-L1', transactionId: 'TXN-BLK-1',
        documentNumber: 'DOC-BLK-1', documentType: 'JOURNAL', dateKey: '2025-01-31',
        postingDateKey: '2025-01-31', accountKey: '5000', entityKey: 'ENT-001',
        currencyKey: 'USD', amountLcy: '1000', debitAmount: '1000', creditAmount: '0',
        sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
      },
    ];

    const count = await warehouse.bulkIngest(entries);
    expect(count).toBe(1);
  });
});

describe('InMemoryGLEntryRepo', () => {
  it('should insert and find entries', async () => {
    const repo = new InMemoryGLEntryRepo();
    const entry = {
      entryKey: 'test-key', journalId: 'JE-001', journalLineId: 'JE-001-L1',
      transactionId: 'TXN-001', documentNumber: 'DOC-001', documentType: 'JOURNAL',
      dateKey: '2025-01-31', postingDateKey: '2025-01-31', accountKey: '4000',
      entityKey: 'ENT-001', currencyKey: 'USD', amountLcy: '1000',
      debitAmount: '0', creditAmount: '1000', sourceSystem: 'GL',
      createdAt: new Date(), createdBy: 'test', workflowStatus: 'POSTED' as const,
      isIntercompany: false,
    };

    await repo.insert(entry);
    const found = await repo.findById('test-key');
    expect(found).not.toBeNull();
  });
});

describe('InMemoryBalanceRepo', () => {
  it('should insert and find balances', async () => {
    const repo = new InMemoryBalanceRepo();
    const balance = {
      balanceKey: 'test-bal', dateKey: '2025-01-31', accountKey: '4000',
      entityKey: 'ENT-001', currencyKey: 'USD', beginningBalance: '0',
      periodDebitActivity: '0', periodCreditActivity: '1000', endingBalance: '1000',
      transactionCount: 1, lastUpdatedAt: new Date(), lastUpdatedBy: 'test',
    };

    await repo.insert(balance);
    const found = await repo.findById('test-bal');
    expect(found).not.toBeNull();
  });
});
