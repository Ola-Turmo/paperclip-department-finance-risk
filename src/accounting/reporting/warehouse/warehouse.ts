/**
 * Financial Data Warehouse Service
 * 
 * Implements the fact tables and balance aggregation layer.
 * This is the single entry point for all reporting queries — reports
 * NEVER query the OLTP system directly.
 * 
 * Architecture:
 * - Write path: GL entries posted → warehouse.upsertEntry() 
 * - Pre-aggregation: balance tables updated on every write
 * - Read path: reports query balance tables → O(1) instead of O(n) scans
 * - CDC interface: plug in real connectors (Debezium, Kafka, etc.)
 */

import { Repository } from '../../core/interfaces.js';
import {
  FactGLEntry, FactBalance, DimAccount, DimEntity, DimTime,
} from '../dimensional/core-types.js';
import { DimAccountService, DimEntityService } from '../dimensional/dim-services.js';

// ─────────────────────────────────────────────────────────────────────────────
// Balance Aggregation Table
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Pre-computed period-end balances — the performance key to fast reporting.
 * Instead of summing millions of GL entries per report, we sum thousands of
 * period balances (one row per account per period).
 * 
 * Updated incrementally on every journal entry post.
 */

export interface AccountPeriodBalance {
  accountKey: string;
  entityKey: string;
  dateKey: string;              // Period end date (e.g. "2025-03-31")
  currencyCode: string;
  beginningBalance: string;     // Period start balance
  periodDebits: string;
  periodCredits: string;
  endingBalance: string;        // beginningBalance + debits - credits
  transactionCount: number;
  lastUpdatedAt: Date;
}

export class FinancialDataWarehouse {
  private _dimTime: any;
  private glEntryRepo: any;
  private balanceRepo: any;
  private dimAccount: DimAccountService;
  private dimEntity: DimEntityService;

  // In-memory stores
  private glEntries: FactGLEntry[] = [];
  private periodBalances = new Map<string, AccountPeriodBalance>();

  constructor(
    glEntryRepo: any,
    balanceRepo: any,
    dimAccount: DimAccountService,
    dimEntity: DimEntityService
  ) {
    this.glEntryRepo = glEntryRepo;
    this.balanceRepo = balanceRepo;
    this.dimAccount = dimAccount;
    this.dimEntity = dimEntity;
  }

  // ═══════════════════════════════════════════════════════════════
  // WRITE PATH — called by GL posting workflow
  // ═══════════════════════════════════════════════════════════════

  /**
   * Ingest a journal entry into the warehouse.
   * Updates both the GL fact table AND the period balance aggregation.
   * This is the ONLY method that writes to the warehouse.
   */
  async ingestJournalEntry(
    entry: Omit<FactGLEntry, 'entryKey' | 'createdAt' | 'createdBy'>,
    userId: string = 'system',
  ): Promise<{ entryKey: string; balanceUpdates: string[] }> {
    const entryKey = crypto.randomUUID();
    const fullEntry: FactGLEntry = { ...entry, entryKey, createdAt: new Date(), createdBy: userId };

    // 1. Insert into GL fact table (immutable)
    await (this.glEntryRepo as any).insert(fullEntry);
    this.glEntries.push(fullEntry);

    // 2. Update period balance aggregation
    const balanceUpdates: string[] = [];
    for (const line of this.extractLines(entry)) {
      const balKey = this.balanceKey(entry.entityKey, line.accountKey, entry.postingDateKey);
      const existing = this.periodBalances.get(balKey);
      const precision = 2;
      const scale = Math.pow(10, precision);

      if (existing) {
        const newDebits = (parseFloat(existing.periodDebits) + parseFloat(line.debitAmount)).toFixed(precision);
        const newCredits = (parseFloat(existing.periodCredits) + parseFloat(line.creditAmount)).toFixed(precision);
        const ending = (parseFloat(existing.beginningBalance) + parseFloat(newDebits) - parseFloat(newCredits)).toFixed(precision);
        existing.periodDebits = newDebits;
        existing.periodCredits = newCredits;
        existing.endingBalance = ending;
        existing.transactionCount += 1;
        existing.lastUpdatedAt = new Date();
        balanceUpdates.push(balKey);
      } else {
        // Get beginning balance from prior period
        const priorBal = await this.getBeginningBalance(entry.entityKey, line.accountKey, entry.postingDateKey);
        const newBal: AccountPeriodBalance = {
          accountKey: line.accountKey,
          entityKey: entry.entityKey,
          dateKey: entry.postingDateKey,
          currencyCode: entry.currencyKey,
          beginningBalance: priorBal,
          periodDebits: line.debitAmount,
          periodCredits: line.creditAmount,
          endingBalance: (parseFloat(priorBal) + parseFloat(line.debitAmount) - parseFloat(line.creditAmount)).toFixed(precision),
          transactionCount: 1,
          lastUpdatedAt: new Date(),
        };
        this.periodBalances.set(balKey, newBal);
        balanceUpdates.push(balKey);
      }
    }

    return { entryKey, balanceUpdates };
  }

  /** Extract debit/credit lines from a GL entry */
  private extractLines(entry: Omit<FactGLEntry, 'entryKey' | 'createdAt' | 'createdBy'>): Array<{ accountKey: string; debitAmount: string; creditAmount: string }> {
    const lines: Array<{ accountKey: string; debitAmount: string; creditAmount: string }> = [];
    // If debitAmount/creditAmount fields exist on the entry, use them directly
    if (parseFloat(entry.debitAmount) !== 0 || parseFloat(entry.creditAmount) !== 0) {
      lines.push({ accountKey: entry.accountKey, debitAmount: entry.debitAmount, creditAmount: entry.creditAmount });
    }
    return lines;
  }

  private balanceKey(entityKey: string, accountKey: string, dateKey: string): string {
    return `${entityKey}::${accountKey}::${dateKey}`;
  }

  /** Look back to the prior period for beginning balance */
  private async getBeginningBalance(entityKey: string, accountKey: string, currentDateKey: string): Promise<string> {
    const dimTime = this.getDimTimeService();
    const current = dimTime.getByDateKey(currentDateKey);
    if (!current) return '0';

    // Find prior period
    const allDates = dimTime.getAll()
      .filter((t: any) =>t.fiscalYear === current.fiscalYear && t.fiscalPeriod < current.fiscalPeriod)
      .map((t: any) =>t.dateKey);
    
    if (allDates.length > 0) {
      const priorKey = allDates.sort()[allDates.length - 1];
      const priorBal = this.periodBalances.get(this.balanceKey(entityKey, accountKey, priorKey));
      if (priorBal) return priorBal.endingBalance;
    }

    // Cross fiscal year boundary
    const prevYear = current.fiscalYear - 1;
    const prevYearEnd = dimTime.getPeriodEndDateKey(prevYear, 12);
    const prevBal = this.periodBalances.get(this.balanceKey(entityKey, accountKey, prevYearEnd));
    return prevBal?.endingBalance ?? '0';
  }

  private getDimTimeService() {
    // Access via instance — in production, inject DimTimeService
    return (this as any)._dimTime;
  }

  setDimTime(dimTime: any) { this._dimTime = dimTime as any; }

  // ═══════════════════════════════════════════════════════════════
  // READ PATH — reporting queries
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get account balances for a specific period.
   * Uses pre-aggregated balance table — O(accounts) not O(entries).
   */
  async getAccountBalances(params: {
    entityKey?: string;
    accountKeys?: string[];
    dateKey: string;
    currency?: string;
  }): Promise<AccountPeriodBalance[]> {
    const results: AccountPeriodBalance[] = [];
    for (const [key, bal] of Array.from(this.periodBalances.entries())) {
      if (bal.dateKey !== params.dateKey) continue;
      if (params.entityKey && bal.entityKey !== params.entityKey) continue;
      if (params.accountKeys && !params.accountKeys.includes(bal.accountKey)) continue;
      if (params.currency && bal.currencyCode !== params.currency) continue;
      results.push(bal);
    }
    return results;
  }

  /**
   * Get account balance as of a specific date (cumulative).
   * Traverses periods up to dateKey and computes cumulative balance.
   */
  async getBalanceAsOf(params: {
    accountKey: string;
    entityKey: string;
    dateKey: string;
  }): Promise<string> {
    const dimTime = (this as any)._dimTime;
    if (!dimTime) return '0';

    const target = dimTime.getByDateKey(params.dateKey);
    if (!target) return '0';

    let cumulative = 0;
    const periods = dimTime.getAll()
      .filter((t: any) =>t.dateKey <= params.dateKey)
      .sort((a: any, b: any) => a.dateKey.localeCompare(b.dateKey));

    for (const period of periods) {
      const bal = this.periodBalances.get(this.balanceKey(params.entityKey, params.accountKey, period.dateKey));
      if (bal) {
        cumulative += parseFloat(bal.periodDebits) - parseFloat(bal.periodCredits);
      }
    }

    return cumulative.toFixed(2);
  }

  /**
   * Get all GL entries for an account in a period — for drill-down.
   */
  async getGLEntriesForAccount(params: {
    accountKey: string;
    entityKey: string;
    dateKey: string;
    limit?: number;
    offset?: number;
  }): Promise<FactGLEntry[]> {
    return this.glEntries
      .filter(e => e.accountKey === params.accountKey &&
                   e.entityKey === params.entityKey &&
                   e.postingDateKey <= params.dateKey &&
                   e.workflowStatus === 'POSTED')
      .sort((a, b) => b.postingDateKey.localeCompare(a.postingDateKey))
      .slice(params.offset ?? 0, (params.offset ?? 0) + (params.limit ?? 50));
  }

  /**
   * Get total debits and credits for an account in a period.
   */
  async getAccountActivity(params: {
    accountKey: string;
    entityKey: string;
    dateKey: string;
  }): Promise<{ totalDebits: string; totalCredits: string; netAmount: string; transactionCount: number }> {
    const balances = await this.getAccountBalances({
      accountKeys: [params.accountKey],
      entityKey: params.entityKey,
      dateKey: params.dateKey,
    });
    const bal = balances[0];
    if (!bal) return { totalDebits: '0', totalCredits: '0', netAmount: '0', transactionCount: 0 };
    const net = (parseFloat(bal.periodDebits) - parseFloat(bal.periodCredits)).toFixed(2);
    return { totalDebits: bal.periodDebits, totalCredits: bal.periodCredits, netAmount: net, transactionCount: bal.transactionCount };
  }

  /**
   * Get trial balance data for a period.
   */
  async getTrialBalanceData(params: {
    entityKey: string;
    dateKey: string;
    includeZeroBalance?: boolean;
  }): Promise<Array<{
    accountKey: string; accountCode: string; accountName: string;
    accountType: string; balanceType: string;
    debitBalance: string; creditBalance: string; endingBalance: string;
  }>> {
    const balances = await this.getAccountBalances(params);
    const results = [];
    const includeZeroBal = params.includeZeroBalance ?? false;

    for (const bal of balances) {
      const acct = await this.dimAccount.getByKey(bal.accountKey);
      if (!acct) continue;
      if (!includeZeroBal && parseFloat(bal.endingBalance) === 0) continue;

      const isDebit = acct.balanceType === 'debit';
      const ending = parseFloat(bal.endingBalance);
      let debitBalance = '0', creditBalance = '0';

      if (isDebit) {
        debitBalance = ending >= 0 ? bal.endingBalance : '0';
        creditBalance = ending < 0 ? (-ending).toFixed(2) : '0';
      } else {
        creditBalance = ending >= 0 ? bal.endingBalance : '0';
        debitBalance = ending < 0 ? (-ending).toFixed(2) : '0';
      }

      results.push({
        accountKey: bal.accountKey,
        accountCode: acct.accountCode,
        accountName: acct.accountName,
        accountType: acct.accountType,
        balanceType: acct.balanceType,
        debitBalance, creditBalance, endingBalance: bal.endingBalance,
      });
    }

    return results.sort((a, b) => a.accountCode.localeCompare(b.accountCode));
  }

  /**
   * Get intercompany balances — for consolidation/elimination.
   */
  async getIntercompanyBalances(params: {
    dateKey: string;
    counterpartyEntityKey: string;
  }): Promise<Array<{
    accountKey: string; entityKey: string;
    amountLcy: string; isDebit: boolean;
  }>> {
    return this.glEntries
      .filter(e => e.postingDateKey === params.dateKey &&
                   e.isIntercompany &&
                   e.counterpartEntityKey === params.counterpartyEntityKey &&
                   e.workflowStatus === 'POSTED')
      .map(e => ({
        accountKey: e.accountKey,
        entityKey: e.entityKey,
        amountLcy: e.amountLcy,
        isDebit: parseFloat(e.amountLcy) >= 0,
      }));
  }

  /**
   * Bulk load historical data — for initial data migration.
   */
  async bulkIngest(entries: Array<Omit<FactGLEntry, 'entryKey' | 'createdAt' | 'createdBy'>>): Promise<number> {
    let count = 0;
    for (const entry of entries) {
      await this.ingestJournalEntry(entry);
      count++;
    }
    return count;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// In-memory repositories for warehouse
// ─────────────────────────────────────────────────────────────────────────────

export class InMemoryGLEntryRepo {
  private data: FactGLEntry[] = [];
  async findAll(): Promise<FactGLEntry[]> { return [...this.data]; }
  async findById(key: string): Promise<FactGLEntry | null> { return this.data.find(d => d.entryKey === key) ?? null; }
  async insert(item: FactGLEntry): Promise<void> { this.data.push(item); }
  async update(_item: FactGLEntry): Promise<void> {}
  async delete(_key: string): Promise<void> {}
}

export class InMemoryBalanceRepo {
  private data: FactBalance[] = [];
  async findAll(): Promise<FactBalance[]> { return [...this.data]; }
  async findById(key: string): Promise<FactBalance | null> { return this.data.find(d => d.balanceKey === key) ?? null; }
  async insert(item: FactBalance): Promise<void> { this.data.push(item); }
  async update(item: FactBalance): Promise<void> {
    const idx = this.data.findIndex(d => d.balanceKey === item.balanceKey);
    if (idx >= 0) this.data[idx] = item;
  }
  async delete(_key: string): Promise<void> {}
}
