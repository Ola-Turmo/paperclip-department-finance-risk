/**
 * Period Management and Month-End Close
 */

import { JournalEntry, JournalEntryLine } from './journal-entry.js';
import { ChartOfAccountsService, AccountCategory } from './chart-of-accounts.js';

export interface Period {
  id: string;
  companyId: string;
  name: string;  // e.g., 'January 2025'
  startDate: Date;
  endDate: Date;
  status: 'open' | 'closed';
  closedAt?: Date;
}

export interface GLTrialBalanceLine {
  accountId: string;
  accountCode: string;
  accountName: string;
  debitBalance: number;
  creditBalance: number;
}

export interface GLTrialBalance {
  periodId: string;
  periodName: string;
  asOfDate: Date;
  lines: GLTrialBalanceLine[];
  totalDebits: number;
  totalCredits: number;
  isBalanced: boolean;
}

export interface ClosingResult {
  periodId: string;
  incomeEntries: JournalEntry[];
  expenseEntries: JournalEntry[];
  summaryEntry: JournalEntry;
  retainedEarningsEntry: JournalEntry;
}

export class PeriodCloseService {
  private periods: Map<string, Period> = new Map();
  private journalEntryService: import('./journal-entry.js').JournalEntryService;
  private chartOfAccounts: ChartOfAccountsService;
  private closingEntries: Map<string, JournalEntry[]> = new Map(); // periodId -> closing entries

  constructor(
    journalEntryService: import('./journal-entry.js').JournalEntryService,
    chartOfAccounts: ChartOfAccountsService
  ) {
    this.journalEntryService = journalEntryService;
    this.chartOfAccounts = chartOfAccounts;
  }

  createPeriod(data: { companyId: string; name: string; startDate: Date; endDate: Date }): Period {
    const period: Period = {
      id: crypto.randomUUID(),
      companyId: data.companyId,
      name: data.name,
      startDate: data.startDate,
      endDate: data.endDate,
      status: 'open',
    };
    this.periods.set(period.id, period);
    return period;
  }

  getPeriod(id: string): Period | undefined {
    return this.periods.get(id);
  }

  getOpenPeriods(companyId: string): Period[] {
    return Array.from(this.periods.values()).filter(
      p => p.companyId === companyId && p.status === 'open'
    );
  }

  generateTrialBalance(periodId: string): GLTrialBalance {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} does not exist`);
    }

    const accounts = this.chartOfAccounts.getAccountsByCompany(period.companyId);
    const lines: GLTrialBalanceLine[] = [];
    let totalDebits = 0;
    let totalCredits = 0;

    for (const account of accounts) {
      // Get all posted entries for this account in this period
      const accountLines = this.journalEntryService.getAccountEntriesInPeriod(account.id, periodId);
      
      let debitTotal = 0;
      let creditTotal = 0;

      for (const line of accountLines) {
        if (line.type === 'debit') {
          debitTotal += line.amount;
        } else {
          creditTotal += line.amount;
        }
      }

      // Calculate balance based on normal balance
      let debitBalance = 0;
      let creditBalance = 0;

      if (account.normalBalance === 'debit') {
        const net = debitTotal - creditTotal;
        if (net >= 0) {
          debitBalance = net;
        } else {
          creditBalance = Math.abs(net);
        }
      } else {
        const net = creditTotal - debitTotal;
        if (net >= 0) {
          creditBalance = net;
        } else {
          debitBalance = Math.abs(net);
        }
      }

      // Only include accounts with activity
      if (debitTotal > 0 || creditTotal > 0) {
        lines.push({
          accountId: account.id,
          accountCode: account.code,
          accountName: account.name,
          debitBalance,
          creditBalance,
        });
        totalDebits += debitBalance;
        totalCredits += creditBalance;
      }
    }

    // Sort by account code
    lines.sort((a, b) => a.accountCode.localeCompare(b.accountCode));

    return {
      periodId,
      periodName: period.name,
      asOfDate: period.endDate,
      lines,
      totalDebits,
      totalCredits,
      isBalanced: Math.abs(totalDebits - totalCredits) < 0.001,
    };
  }

  closePeriod(periodId: string): ClosingResult {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} does not exist`);
    }

    if (period.status === 'closed') {
      throw new Error('Period is already closed');
    }

    // 1. Verify all journal entries for period are balanced
    const entries = this.journalEntryService.getEntriesByPeriod(periodId);
    for (const entry of entries) {
      if (entry.status === 'posted') {
        const validation = this.journalEntryService.validateDoubleEntry(entry.lines);
        if (!validation.valid) {
          throw new Error(
            `Entry ${entry.id} is not balanced: debits=${validation.debitTotal}, credits=${validation.creditTotal}`
          );
        }
      }
    }

    // Get income and expense accounts
    const incomeAccounts = this.chartOfAccounts.getAccountsByCategory('income');
    const expenseAccounts = this.chartOfAccounts.getAccountsByCategory('expense');

    // 2. Get all income accounts → sum balances → create closing entry DR Income CR Income Summary
    const incomeLines: Omit<JournalEntryLine, 'id' | 'journalEntryId'>[] = [];
    for (const account of incomeAccounts) {
      const accountLines = this.journalEntryService.getAccountEntriesInPeriod(account.id, periodId);
      let total = 0;
      for (const line of accountLines) {
        if (line.type === 'credit') {
          total += line.amount;
        } else {
          total -= line.amount;
        }
      }
      if (total > 0) {
        incomeLines.push({
          accountId: account.id,
          type: 'debit',
          amount: total,
          description: `Close ${account.name}`,
        });
      }
    }

    // Find or create Income Summary account
    let incomeSummaryAccount = this.chartOfAccounts.getAccountsByCompany(period.companyId)
      .find(a => a.type === 'income_summary');
    
    if (!incomeSummaryAccount) {
      incomeSummaryAccount = this.chartOfAccounts.createAccount({
        companyId: period.companyId,
        category: 'income',
        type: 'income_summary',
        code: this.chartOfAccounts.getNextAccountCode('income'),
        name: 'Income Summary',
        currencyCode: 'USD',
        isArchived: false,
        isDefault: false,
        normalBalance: 'credit',
      });
    }

    // Add credit to Income Summary
    const incomeSummaryTotal = incomeLines.reduce((sum, l) => sum + l.amount, 0);
    if (incomeSummaryTotal > 0) {
      incomeLines.push({
        accountId: incomeSummaryAccount.id,
        type: 'credit',
        amount: incomeSummaryTotal,
        description: 'Income Summary',
      });
    }

    const incomeEntry = incomeLines.length > 1
      ? this.journalEntryService.createEntry({
          companyId: period.companyId,
          periodId,
          description: 'Close Income Accounts',
          lines: incomeLines,
        })
      : null;

    // 3. Get all expense accounts → sum balances → create closing entry DR Income Summary CR Expenses
    const expenseLines: Omit<JournalEntryLine, 'id' | 'journalEntryId'>[] = [];
    for (const account of expenseAccounts) {
      const accountLines = this.journalEntryService.getAccountEntriesInPeriod(account.id, periodId);
      let total = 0;
      for (const line of accountLines) {
        if (line.type === 'debit') {
          total += line.amount;
        } else {
          total -= line.amount;
        }
      }
      if (total > 0) {
        expenseLines.push({
          accountId: account.id,
          type: 'credit',
          amount: total,
          description: `Close ${account.name}`,
        });
      }
    }

    // Add debit to Income Summary
    const expenseTotal = expenseLines.reduce((sum, l) => sum + l.amount, 0);
    if (expenseTotal > 0) {
      expenseLines.push({
        accountId: incomeSummaryAccount.id,
        type: 'debit',
        amount: expenseTotal,
        description: 'Income Summary',
      });
    }

    const expenseEntry = expenseLines.length > 1
      ? this.journalEntryService.createEntry({
          companyId: period.companyId,
          periodId,
          description: 'Close Expense Accounts',
          lines: expenseLines,
        })
      : null;

    // 4. Get Income Summary balance → create closing entry DR Income Summary CR Retained Earnings
    const summaryLines: Omit<JournalEntryLine, 'id' | 'journalEntryId'>[] = [];
    
    // Calculate income summary balance
    const summaryDebits = expenseTotal; // We debited income summary
    const summaryCredits = incomeSummaryTotal; // We credited income summary
    const netIncome = summaryCredits - summaryDebits;

    // Find Retained Earnings account
    let retainedEarningsAccount = this.chartOfAccounts.getAccountsByCompany(period.companyId)
      .find(a => a.type === 'retained_earnings');
    
    if (!retainedEarningsAccount) {
      retainedEarningsAccount = this.chartOfAccounts.createAccount({
        companyId: period.companyId,
        category: 'capital',
        type: 'retained_earnings',
        code: this.chartOfAccounts.getNextAccountCode('capital'),
        name: 'Retained Earnings',
        currencyCode: 'USD',
        isArchived: false,
        isDefault: false,
        normalBalance: 'credit',
      });
    }

    if (Math.abs(netIncome) > 0.001) {
      if (netIncome > 0) {
        // Net income: DR Income Summary CR Retained Earnings
        summaryLines.push({
          accountId: incomeSummaryAccount.id,
          type: 'credit',
          amount: netIncome,
          description: 'Net Income',
        });
        summaryLines.push({
          accountId: retainedEarningsAccount.id,
          type: 'credit',
          amount: netIncome,
          description: 'Retained Earnings',
        });
      } else {
        // Net loss: DR Retained Earnings CR Income Summary
        summaryLines.push({
          accountId: retainedEarningsAccount.id,
          type: 'debit',
          amount: Math.abs(netIncome),
          description: 'Net Loss',
        });
        summaryLines.push({
          accountId: incomeSummaryAccount.id,
          type: 'debit',
          amount: Math.abs(netIncome),
          description: 'Income Summary',
        });
      }
    }

    const summaryEntry = summaryLines.length > 1
      ? this.journalEntryService.createEntry({
          companyId: period.companyId,
          periodId,
          description: 'Close Income Summary to Retained Earnings',
          lines: summaryLines,
        })
      : null;

    const retainedEarningsEntry = summaryEntry || this.journalEntryService.createEntry({
      companyId: period.companyId,
      periodId,
      description: 'Retained Earnings (no income/loss)',
      lines: [
        { accountId: incomeSummaryAccount.id, type: 'debit', amount: 0, description: 'Zero' },
        { accountId: retainedEarningsAccount.id, type: 'credit', amount: 0, description: 'Zero' },
      ],
    });

    // Post all closing entries
    const incomeEntries: JournalEntry[] = [];
    if (incomeEntry) {
      this.journalEntryService.postEntry(incomeEntry.id);
      incomeEntries.push(incomeEntry);
    }
    if (expenseEntry) {
      this.journalEntryService.postEntry(expenseEntry.id);
      incomeEntries.push(expenseEntry);
    }
    if (summaryEntry) {
      this.journalEntryService.postEntry(summaryEntry.id);
    }

    // 5. Set period status to 'closed'
    period.status = 'closed';
    period.closedAt = new Date();

    // Store closing entries for reference
    this.closingEntries.set(periodId, [
      ...incomeEntries,
      expenseEntry!,
      summaryEntry!,
      retainedEarningsEntry,
    ].filter(Boolean));

    return {
      periodId,
      incomeEntries,
      expenseEntries: expenseEntry ? [expenseEntry] : [],
      summaryEntry: summaryEntry!,
      retainedEarningsEntry,
    };
  }

  reopenPeriod(periodId: string): void {
    const period = this.periods.get(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} does not exist`);
    }

    if (period.status === 'open') {
      throw new Error('Period is already open');
    }

    // Set period status to 'open', clear closedAt
    period.status = 'open';
    period.closedAt = undefined;

    // Remove closing journal entries from the period
    const closingEntries = this.closingEntries.get(periodId);
    if (closingEntries) {
      // Note: In a real system, we'd delete the entries. Here we just clear the reference.
      this.closingEntries.delete(periodId);
    }
  }
}