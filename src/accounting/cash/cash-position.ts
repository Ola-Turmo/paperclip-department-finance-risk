/**
 * Real-time Cash Position Service
 * Tracks cash balances across all bank accounts with pending transaction awareness
 */

export interface CashPosition {
  accountId: string;
  accountName: string;
  balance: number;
  pendingInflows: number;
  pendingOutflows: number;
  availableBalance: number;
  currencyCode: string;
}

export interface TotalCashPosition {
  totalBalance: number;
  totalPendingIn: number;
  totalPendingOut: number;
  totalAvailable: number;
  positions: CashPosition[];
}

export interface PendingTransaction {
  id: string;
  date: Date;
  amount: number; // positive for inflows, negative for outflows
  description: string;
  type: 'ap' | 'ar' | 'payroll' | 'transfer' | 'other';
}

/**
 * Service for calculating real-time cash position across accounts
 */
export class CashPositionService {
  /**
   * Calculate cash position for a single bank account
   */
  async getPosition(
    bankAccount: {
      id: string;
      name: string;
      balance: number;
      currencyCode: string;
    },
    pendingTransactions: PendingTransaction[]
  ): Promise<CashPosition> {
    // Sum pending inflows (positive amounts)
    const pendingIn = pendingTransactions
      .filter(t => t.amount > 0)
      .reduce((sum, t) => sum + t.amount, 0);
    
    // Sum pending outflows (negative amounts, take absolute value)
    const pendingOut = pendingTransactions
      .filter(t => t.amount < 0)
      .reduce((sum, t) => sum + Math.abs(t.amount), 0);
    
    // Available balance = current balance + pending inflows - pending outflows
    const availableBalance = bankAccount.balance + pendingIn - pendingOut;

    return {
      accountId: bankAccount.id,
      accountName: bankAccount.name,
      balance: bankAccount.balance,
      pendingInflows: pendingIn,
      pendingOutflows: pendingOut,
      availableBalance,
      currencyCode: bankAccount.currencyCode,
    };
  }

  /**
   * Calculate total cash position across all bank accounts
   */
  async getTotalPosition(
    bankAccounts: Array<{
      id: string;
      name: string;
      balance: number;
      currencyCode: string;
    }>,
    pendingTransactionsByAccount: Record<string, PendingTransaction[]>
  ): Promise<TotalCashPosition> {
    const positions: CashPosition[] = [];

    for (const account of bankAccounts) {
      const pending = pendingTransactionsByAccount[account.id] || [];
      const position = await this.getPosition(account, pending);
      positions.push(position);
    }

    return {
      totalBalance: positions.reduce((sum, p) => sum + p.balance, 0),
      totalPendingIn: positions.reduce((sum, p) => sum + p.pendingInflows, 0),
      totalPendingOut: positions.reduce((sum, p) => sum + p.pendingOutflows, 0),
      totalAvailable: positions.reduce((sum, p) => sum + p.availableBalance, 0),
      positions,
    };
  }

  /**
   * Get accounts with negative available balance (overdraft risk)
   */
  async getOverdraftRisk(
    positions: CashPosition[]
  ): Promise<CashPosition[]> {
    return positions.filter(p => p.availableBalance < 0);
  }

  /**
   * Get accounts with low balance (below threshold)
   */
  async getLowBalanceAccounts(
    positions: CashPosition[],
    threshold: number
  ): Promise<CashPosition[]> {
    return positions.filter(p => p.balance < threshold);
  }

  /**
   * Calculate days of cash runway based on average daily outflows
   */
  async calculateCashRunway(
    totalPosition: TotalCashPosition,
    averageDailyOutflow: number
  ): Promise<number> {
    if (averageDailyOutflow <= 0) {
      return Infinity;
    }
    return Math.floor(totalPosition.totalAvailable / averageDailyOutflow);
  }

  /**
   * Generate a cash position summary report
   */
  generatePositionReport(position: TotalCashPosition): string {
    const lines: string[] = [];
    
    lines.push('═'.repeat(60));
    lines.push('CASH POSITION SUMMARY');
    lines.push(`Report Date: ${new Date().toISOString().slice(0, 10)}`);
    lines.push('═'.repeat(60));
    lines.push('');
    lines.push(`Total Balance:        $${position.totalBalance.toFixed(2)}`);
    lines.push(`Pending Inflows:      $${position.totalPendingIn.toFixed(2)}`);
    lines.push(`Pending Outflows:     $${position.totalPendingOut.toFixed(2)}`);
    lines.push(`Available Balance:    $${position.totalAvailable.toFixed(2)}`);
    lines.push('');
    lines.push('─'.repeat(60));
    lines.push('ACCOUNT DETAILS:');
    lines.push('─'.repeat(60));
    
    for (const p of position.positions) {
      lines.push(`  ${p.accountName} (${p.accountId})`);
      lines.push(`    Balance:           $${p.balance.toFixed(2)}`);
      lines.push(`    Pending In:        $${p.pendingInflows.toFixed(2)}`);
      lines.push(`    Pending Out:       $${p.pendingOutflows.toFixed(2)}`);
      lines.push(`    Available:         $${p.availableBalance.toFixed(2)}`);
      lines.push('');
    }
    
    lines.push('═'.repeat(60));
    
    return lines.join('\n');
  }

  /**
   * Identify cash flow gaps (days where outflows exceed inflows)
   */
  async identifyCashGaps(
    dailyProjections: Array<{
      date: Date;
      inflows: number;
      outflows: number;
    }>,
    currentAvailable: number
  ): Promise<Array<{ date: Date; deficit: number; runningBalance: number }>> {
    const gaps: Array<{ date: Date; deficit: number; runningBalance: number }> = [];
    let runningBalance = currentAvailable;

    for (const projection of dailyProjections) {
      const netFlow = projection.inflows - projection.outflows;
      runningBalance += netFlow;
      
      if (runningBalance < 0) {
        gaps.push({
          date: projection.date,
          deficit: Math.abs(runningBalance),
          runningBalance,
        });
      }
    }

    return gaps;
  }
}
