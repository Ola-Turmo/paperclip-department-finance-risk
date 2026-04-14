/**
 * Account Balance Computation
 */

export interface AccountBalance {
  accountId: string;
  periodId: string;
  debitTotal: number;
  creditTotal: number;
  netBalance: number;  // debit - credit for normal debit accounts, credit - debit for normal credit accounts
  asOfDate: Date;
}

export class AccountBalanceService {
  private journalEntryService: import('./journal-entry.js').JournalEntryService;
  private chartOfAccounts: import('./chart-of-accounts.js').ChartOfAccountsService;
  private periodService: import('./period-close.js').PeriodCloseService;

  constructor(
    journalEntryService: import('./journal-entry.js').JournalEntryService,
    chartOfAccounts: import('./chart-of-accounts.js').ChartOfAccountsService,
    periodService: import('./period-close.js').PeriodCloseService
  ) {
    this.journalEntryService = journalEntryService;
    this.chartOfAccounts = chartOfAccounts;
    this.periodService = periodService;
  }

  getBalance(accountId: string, periodId: string): AccountBalance {
    const account = this.chartOfAccounts.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} does not exist`);
    }

    const period = this.periodService.getPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} does not exist`);
    }

    const lines = this.journalEntryService.getAccountEntriesInPeriod(accountId, periodId);
    
    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of lines) {
      if (line.type === 'debit') {
        debitTotal += line.amount;
      } else {
        creditTotal += line.amount;
      }
    }

    // Calculate net balance based on normal balance
    let netBalance: number;
    if (account.normalBalance === 'debit') {
      netBalance = debitTotal - creditTotal;
    } else {
      netBalance = creditTotal - debitTotal;
    }

    return {
      accountId,
      periodId,
      debitTotal,
      creditTotal,
      netBalance,
      asOfDate: period.endDate,
    };
  }

  getBalancesByPeriod(periodId: string): AccountBalance[] {
    const period = this.periodService.getPeriod(periodId);
    if (!period) {
      throw new Error(`Period ${periodId} does not exist`);
    }

    const accounts = this.chartOfAccounts.getAccountsByCompany(period.companyId);
    const balances: AccountBalance[] = [];

    for (const account of accounts) {
      const balance = this.getBalance(account.id, periodId);
      // Only include accounts with activity
      if (balance.debitTotal > 0 || balance.creditTotal > 0) {
        balances.push(balance);
      }
    }

    return balances;
  }

  getYtdBalance(accountId: string, endPeriodId: string): AccountBalance {
    const account = this.chartOfAccounts.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} does not exist`);
    }

    const endPeriod = this.periodService.getPeriod(endPeriodId);
    if (!endPeriod) {
      throw new Error(`Period ${endPeriodId} does not exist`);
    }

    // Find all periods from company start to endPeriodId
    const allPeriods = Array.from(this.periodService.getOpenPeriods(account.companyId) || [])
      .concat([]); // In a real system, we'd get all periods including closed ones

    // For simplicity, we'll sum up to the end period
    // In a full implementation, we'd traverse periods chronologically
    let totalDebit = 0;
    let totalCredit = 0;

    // Get all periods up to and including endPeriodId
    // This is a simplified approach - full YTD would traverse periods in order
    const entries = this.journalEntryService.getEntriesByAccount(accountId);
    
    for (const entry of entries) {
      // Only include entries up to the end period
      if (entry.periodId === endPeriodId || 
          new Date(entry.createdAt) <= endPeriod.endDate) {
        for (const line of entry.lines) {
          if (line.accountId === accountId && entry.status === 'posted') {
            if (line.type === 'debit') {
              totalDebit += line.amount;
            } else {
              totalCredit += line.amount;
            }
          }
        }
      }
    }

    let netBalance: number;
    if (account.normalBalance === 'debit') {
      netBalance = totalDebit - totalCredit;
    } else {
      netBalance = totalCredit - totalDebit;
    }

    return {
      accountId,
      periodId: endPeriodId,
      debitTotal: totalDebit,
      creditTotal: totalCredit,
      netBalance,
      asOfDate: endPeriod.endDate,
    };
  }

  getAccountBalanceHistory(accountId: string): Array<{ periodId: string; balance: number }> {
    const account = this.chartOfAccounts.getAccount(accountId);
    if (!account) {
      throw new Error(`Account ${accountId} does not exist`);
    }

    const entries = this.journalEntryService.getEntriesByAccount(accountId);
    const periodBalances = new Map<string, number>();
    const periodEndDates = new Map<string, Date>();

    // Collect all periods and their end dates
    for (const entry of entries) {
      if (entry.status === 'posted') {
        const period = this.periodService.getPeriod(entry.periodId);
        if (period) {
          periodEndDates.set(entry.periodId, period.endDate);
        }
      }
    }

    // Calculate running balance per period
    for (const entry of entries) {
      if (entry.status === 'posted') {
        const current = periodBalances.get(entry.periodId) || 0;
        for (const line of entry.lines) {
          if (line.accountId === accountId) {
            if (account.normalBalance === 'debit') {
              if (line.type === 'debit') {
                periodBalances.set(entry.periodId, current + line.amount);
              } else {
                periodBalances.set(entry.periodId, current - line.amount);
              }
            } else {
              if (line.type === 'credit') {
                periodBalances.set(entry.periodId, current + line.amount);
              } else {
                periodBalances.set(entry.periodId, current - line.amount);
              }
            }
          }
        }
      }
    }

    // Convert to array and sort by period
    const result: Array<{ periodId: string; balance: number }> = [];
    for (const [periodId, balance] of periodBalances) {
      result.push({ periodId, balance });
    }

    // Sort by period end date
    result.sort((a, b) => {
      const dateA = periodEndDates.get(a.periodId) || new Date();
      const dateB = periodEndDates.get(b.periodId) || new Date();
      return dateA.getTime() - dateB.getTime();
    });

    return result;
  }
}