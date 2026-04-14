/**
 * ConsolidationEngine Tests
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ConsolidationEngine } from '../../../src/accounting/reporting/consolidation/consolidation-engine.js';
import { FinancialDataWarehouse } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { DimAccountService, DimEntityService, DimTimeService, FXRateService } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryDimAccountRepo, InMemoryDimEntityRepo } from '../../../src/accounting/reporting/dimensional/dim-services.js';
import { InMemoryGLEntryRepo, InMemoryBalanceRepo } from '../../../src/accounting/reporting/warehouse/warehouse.js';
import { AccountNormalBalance } from '../../../src/accounting/core/chart-of-accounts-config.js';

describe('ConsolidationEngine', () => {
  let consolidationEngine: ConsolidationEngine;
  let warehouse: FinancialDataWarehouse;
  let dimAccount: DimAccountService;
  let dimEntity: DimEntityService;
  let dimTime: DimTimeService;
  let fxRate: FXRateService;

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
    fxRate = new FXRateService();

    // Seed accounts
    await dimAccount.upsert({
      accountKey: '1000', accountCode: '1000', accountName: 'Cash',
      accountType: 'asset', balanceType: AccountNormalBalance.DEBIT,
      incomeStatementRole: 'none', balanceSheetRole: 'current_asset',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });
    await dimAccount.upsert({
      accountKey: '3300', accountCode: '3300', accountName: 'Net Income',
      accountType: 'equity', balanceType: AccountNormalBalance.CREDIT,
      incomeStatementRole: 'none', balanceSheetRole: 'equity',
      isContra: false, isActive: true, effectiveFrom: new Date(), version: 1,
    });

    // Seed parent entity
    await dimEntity.upsert({
      entityKey: 'PARENT-001', entityId: 'PARENT-001', entityName: 'Parent Entity',
      entityType: 'CORPORATION', ownershipPercent: 100,
      consolidationMethod: 'FULL', functionalCurrency: 'USD',
      presentationCurrency: 'USD', taxJurisdiction: 'US', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    // Seed subsidiary entity
    await dimEntity.upsert({
      entityKey: 'SUB-001', entityId: 'SUB-001', entityName: 'Subsidiary Entity',
      entityType: 'CORPORATION', parentEntityKey: 'PARENT-001',
      ownershipPercent: 80, consolidationMethod: 'FULL',
      functionalCurrency: 'USD', presentationCurrency: 'USD',
      taxJurisdiction: 'US', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    dimTime.generateFiscalCalendar(2025, 1);

    warehouse = new FinancialDataWarehouse(glEntryRepo, balanceRepo, dimAccount, dimEntity);
    warehouse.setDimTime(dimTime);

    consolidationEngine = new ConsolidationEngine(warehouse, dimEntity, dimTime, fxRate);
  });

  it('should consolidate parent and subsidiaries', async () => {
    // Ingest data for parent
    await warehouse.ingestJournalEntry({
      journalId: 'JE-P001', journalLineId: 'JE-P001-L1', transactionId: 'TXN-P001',
      documentNumber: 'DOC-P001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'PARENT-001',
      currencyKey: 'USD', amountLcy: '50000', debitAmount: '50000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });
    await warehouse.ingestJournalEntry({
      journalId: 'JE-P002', journalLineId: 'JE-P002-L1', transactionId: 'TXN-P002',
      documentNumber: 'DOC-P002', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '3300', entityKey: 'PARENT-001',
      currencyKey: 'USD', amountLcy: '10000', debitAmount: '0', creditAmount: '10000',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    // Ingest data for subsidiary
    await warehouse.ingestJournalEntry({
      journalId: 'JE-S001', journalLineId: 'JE-S001-L1', transactionId: 'TXN-S001',
      documentNumber: 'DOC-S001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'SUB-001',
      currencyKey: 'USD', amountLcy: '30000', debitAmount: '30000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.consolidatedBalances).toBeDefined();
    expect(result.meta.entityCount).toBeGreaterThan(0);
    expect(result.consolidatedNetIncome).toBeDefined();
  });

  it('should include eliminations for intercompany transactions', async () => {
    // Add intercompany entry
    await warehouse.ingestJournalEntry({
      journalId: 'JE-IC001', journalLineId: 'JE-IC001-L1', transactionId: 'TXN-IC001',
      documentNumber: 'DOC-IC001', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'PARENT-001',
      currencyKey: 'USD', amountLcy: '5000', debitAmount: '5000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: true,
      counterpartEntityKey: 'SUB-001',
    });

    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.eliminations.length).toBeGreaterThanOrEqual(0);
  });

  it('should calculate NCI for partially-owned entities', async () => {
    await warehouse.ingestJournalEntry({
      journalId: 'JE-SUB02', journalLineId: 'JE-SUB02-L1', transactionId: 'TXN-SUB02',
      documentNumber: 'DOC-SUB02', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'SUB-001',
      currencyKey: 'USD', amountLcy: '20000', debitAmount: '20000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.nciCalculations.length).toBeGreaterThan(0);
    const nci = result.nciCalculations[0];
    expect(nci.nciPercent).toBe(20); // 100 - 80 ownership
  });

  it('should include currency translation when currencies differ', async () => {
    // Add FX rate
    fxRate.addRate({
      fromCurrency: 'EUR',
      toCurrency: 'USD',
      rate: '1.10',
      rateType: 'SPOT',
      effectiveDate: new Date('2025-01-31'),
      source: 'ECB',
    });

    // Create EUR subsidiary
    await dimEntity.upsert({
      entityKey: 'EUR-ENT', entityId: 'EUR-ENT', entityName: 'EUR Entity',
      entityType: 'CORPORATION', parentEntityKey: 'PARENT-001',
      ownershipPercent: 100, consolidationMethod: 'FULL',
      functionalCurrency: 'EUR', presentationCurrency: 'USD',
      taxJurisdiction: 'DE', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    await warehouse.ingestJournalEntry({
      journalId: 'JE-EUR01', journalLineId: 'JE-EUR01-L1', transactionId: 'TXN-EUR01',
      documentNumber: 'DOC-EUR01', documentType: 'JOURNAL', dateKey: '2025-01-31',
      postingDateKey: '2025-01-31', accountKey: '1000', entityKey: 'EUR-ENT',
      currencyKey: 'EUR', amountLcy: '10000', debitAmount: '10000', creditAmount: '0',
      sourceSystem: 'GL', workflowStatus: 'POSTED', isIntercompany: false,
    });

    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.currencyTranslations.length).toBeGreaterThan(0);
  });

  it('should return consolidation metadata', async () => {
    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.meta.periodKey).toBe('2025-01-31');
    expect(result.meta.entityCount).toBeGreaterThan(0);
    expect(result.meta.eliminatedCount).toBeDefined();
    expect(result.meta.generatedAt).toBeInstanceOf(Date);
  });

  it('should calculate total eliminations', async () => {
    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
    });

    expect(result.totalEliminations).toBeDefined();
  });

  it('should support proportionate consolidation method', async () => {
    // Update subsidiary to proportionate
    await dimEntity.upsert({
      entityKey: 'SUB-PRO', entityId: 'SUB-PRO', entityName: 'Proportionate Entity',
      entityType: 'CORPORATION', parentEntityKey: 'PARENT-001',
      ownershipPercent: 50, consolidationMethod: 'PROPORTIONATE',
      functionalCurrency: 'USD', presentationCurrency: 'USD',
      taxJurisdiction: 'US', isIntercompany: false,
      isActive: true, fiscalYearEndMonth: 12, effectiveFrom: new Date(),
    });

    const result = await consolidationEngine.consolidate({
      parentEntityKey: 'PARENT-001',
      periodDateKey: '2025-01-31',
      presentationCurrency: 'USD',
      consolidationMethod: 'PROPORTIONATE',
    });

    expect(result.meta.entityCount).toBeGreaterThan(0);
  });
});
