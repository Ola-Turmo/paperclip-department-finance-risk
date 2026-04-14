/**
 * Trial Balance — Lists all GL account balances at a point in time
 */

export interface TrialBalanceLine { accountCode: string; accountName: string; category: string; normalBalance: 'debit' | 'credit'; debitBalance: number; creditBalance: number; }
export interface TrialBalance { asOfDate: Date; periodLabel: string; lines: TrialBalanceLine[]; totalDebits: number; totalCredits: number; isBalanced: boolean; }

export class TrialBalanceService {
  // In production, this reads from the GL module's ChartOfAccounts + JournalEntry service
  // Here we use a simple in-memory account list to simulate
  async generate(params: {
    asOfDate: Date; periodLabel: string;
    accounts: { code: string; name: string; category: string; normalBalance: 'debit' | 'credit'; balance: number; }[];
  }): Promise<TrialBalance> {
    const lines: TrialBalanceLine[] = params.accounts.map(a => ({
      accountCode: a.code, accountName: a.name, category: a.category,
      normalBalance: a.normalBalance,
      debitBalance: a.normalBalance === 'debit' ? Math.max(0, a.balance) : Math.max(0, -a.balance),
      creditBalance: a.normalBalance === 'credit' ? Math.max(0, a.balance) : Math.max(0, -a.balance),
    }));
    const totalDebits = lines.reduce((s, l) => s + l.debitBalance, 0);
    const totalCredits = lines.reduce((s, l) => s + l.creditBalance, 0);
    return { asOfDate: params.asOfDate, periodLabel: params.periodLabel, lines, totalDebits, totalCredits, isBalanced: Math.abs(totalDebits - totalCredits) < 0.01 };
  }
}
