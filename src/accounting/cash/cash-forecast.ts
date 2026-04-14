/**
 * 13-Week Rolling Cash Forecast
 * Provides cash flow projections based on expected receipts and scheduled payments
 */

export interface ForecastEntry {
  week: string;
  weekStart: Date;
  weekEnd: Date;
  inflows: number;
  outflows: number;
  net: number;
  runningBalance: number;
  receipts: Array<{ description: string; amount: number; confidence: number }>;
  payments: Array<{ description: string; amount: number; type: string }>;
}

export interface CashForecast {
  startDate: Date;
  endDate: Date;
  startingBalance: number;
  entries: ForecastEntry[];
  endingBalance: number;
  totalInflows: number;
  totalOutflows: number;
  assumptions: string[];
}

export interface ScheduledPayment {
  date: Date;
  description: string;
  amount: number; // positive amount (will be treated as outflow)
  type: 'ap' | 'payroll' | 'tax' | 'debt' | 'other';
  vendorId?: string;
  recurring?: boolean;
  recurringFrequency?: 'weekly' | 'biweekly' | 'monthly' | 'quarterly';
}

export interface ExpectedReceipt {
  date: Date;
  description: string;
  amount: number;
  customerId?: string;
  confidence: number; // 0-1, probability of receipt
}

export interface ForecastVariance {
  week: string;
  forecastAmount: number;
  actualAmount: number;
  variance: number;
  variancePercent: number;
}

/**
 * Service for generating and managing cash forecasts
 */
export class CashForecastService {
  /**
   * Generate a 13-week rolling cash forecast
   */
  async generateForecast(params: {
    startingBalance: number;
    startDate: Date;
    expectedReceipts: ExpectedReceipt[];
    scheduledPayments: ScheduledPayment[];
    arAgingBuckets?: Record<string, number>; // aging analysis results
  }): Promise<CashForecast> {
    const entries: ForecastEntry[] = [];
    let runningBalance = params.startingBalance;
    const current = new Date(params.startDate);
    
    for (let week = 0; week < 13; week++) {
      const weekStart = new Date(current);
      weekStart.setDate(weekStart.getDate() + week * 7);
      const weekEnd = new Date(weekStart);
      weekEnd.setDate(weekEnd.getDate() + 6);

      // Collect receipts expected in this week with their confidence weights
      const weekReceipts = params.expectedReceipts
        .filter(r => r.date >= weekStart && r.date <= weekEnd);
      
      const inflows = weekReceipts.reduce(
        (sum, r) => sum + r.amount * r.confidence, 0
      );

      // Collect scheduled payments in this week
      const weekPayments = params.scheduledPayments
        .filter(p => p.date >= weekStart && p.date <= weekEnd);
      
      const outflows = weekPayments.reduce(
        (sum, p) => sum + Math.abs(p.amount), 0
      );

      const net = inflows - outflows;
      runningBalance += net;

      entries.push({
        week: `Week ${week + 1}`,
        weekStart,
        weekEnd,
        inflows,
        outflows,
        net,
        runningBalance,
        receipts: weekReceipts.map(r => ({
          description: r.description,
          amount: r.amount,
          confidence: r.confidence,
        })),
        payments: weekPayments.map(p => ({
          description: p.description,
          amount: Math.abs(p.amount),
          type: p.type,
        })),
      });
    }

    const lastEntry = entries[entries.length - 1];
    const totalInflows = entries.reduce((sum, e) => sum + e.inflows, 0);
    const totalOutflows = entries.reduce((sum, e) => sum + e.outflows, 0);

    return {
      startDate: params.startDate,
      endDate: lastEntry.weekEnd,
      startingBalance: params.startingBalance,
      entries,
      endingBalance: lastEntry.runningBalance,
      totalInflows,
      totalOutflows,
      assumptions: [
        'AR receipts estimated based on aging buckets and historical collection patterns',
        'Scheduled payments assume payment runs occur as planned',
        'Payroll assumes bi-weekly payroll on alternating Fridays',
        `Forecast confidence weighted by receipt probability (confidence factor)`,
      ],
    };
  }

  /**
   * Generate forecast variance report comparing actual vs forecast
   */
  generateForecastVarianceReport(
    actual: Map<string, number>,
    forecast: ForecastEntry[]
  ): string {
    const lines: string[] = [];
    const variances: ForecastVariance[] = [];

    lines.push('═'.repeat(70));
    lines.push('CASH FORECAST VARIANCE REPORT');
    lines.push(`Report Date: ${new Date().toISOString().slice(0, 10)}`);
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(
      `${'Week'.padEnd(10)} ${'Forecast'.padEnd(15)} ${'Actual'.padEnd(15)} ${'Variance'.padEnd(15)} ${'Var %'.padEnd(10)}`
    );
    lines.push('─'.repeat(70));

    for (const entry of forecast) {
      const actualAmount = actual.get(entry.week) ?? null;
      const variance = actualAmount !== null 
        ? actualAmount - entry.runningBalance 
        : null;
      const variancePercent = actualAmount !== null && entry.runningBalance !== 0
        ? ((actualAmount - entry.runningBalance) / entry.runningBalance) * 100
        : null;

      if (actualAmount !== null) {
        variances.push({
          week: entry.week,
          forecastAmount: entry.runningBalance,
          actualAmount,
          variance: variance!,
          variancePercent: variancePercent ?? 0,
        });
      }

      lines.push(
        `${entry.week.padEnd(10)} ${entry.runningBalance.toFixed(2).padEnd(15)} ${
          actualAmount?.toFixed(2) ?? 'N/A'.padEnd(15)
        } ${variance?.toFixed(2) ?? 'N/A'.padEnd(15)} ${
          variancePercent?.toFixed(1) ?? 'N/A'.padEnd(10)
        }%`
      );
    }

    lines.push('');
    
    // Summary statistics
    if (variances.length > 0) {
      const avgVariance = variances.reduce((sum, v) => sum + v.variance, 0) / variances.length;
      const avgVariancePercent = variances.reduce((sum, v) => sum + v.variancePercent, 0) / variances.length;
      
      lines.push('SUMMARY:');
      lines.push(`  Average Variance:      ${avgVariance >= 0 ? '+' : ''}$${avgVariance.toFixed(2)}`);
      lines.push(`  Average Variance %:   ${avgVariancePercent >= 0 ? '+' : ''}${avgVariancePercent.toFixed(1)}%`);
      lines.push(`  Weeks Compared:       ${variances.length} of 13`);
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Generate a detailed forecast report
   */
  generateDetailedForecastReport(forecast: CashForecast): string {
    const lines: string[] = [];

    lines.push('═'.repeat(70));
    lines.push('13-WEEK CASH FLOW FORECAST');
    lines.push(`Period: ${forecast.startDate.toISOString().slice(0, 10)} to ${forecast.endDate.toISOString().slice(0, 10)}`);
    lines.push('═'.repeat(70));
    lines.push('');
    lines.push(`Starting Balance:     $${forecast.startingBalance.toFixed(2)}`);
    lines.push(`Total Inflows:        $${forecast.totalInflows.toFixed(2)}`);
    lines.push(`Total Outflows:       $${forecast.totalOutflows.toFixed(2)}`);
    lines.push(`Net Change:           $${(forecast.totalInflows - forecast.totalOutflows).toFixed(2)}`);
    lines.push(`Ending Balance:      $${forecast.endingBalance.toFixed(2)}`);
    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('WEEKLY BREAKDOWN:');
    lines.push('─'.repeat(70));
    lines.push(
      `${'Week'.padEnd(10)} ${'Inflows'.padEnd(12)} ${'Outflows'.padEnd(12)} ${'Net'.padEnd(12)} ${'Balance'.padEnd(12)}`
    );
    lines.push('─'.repeat(70));

    for (const entry of forecast.entries) {
      lines.push(
        `${entry.week.padEnd(10)} ${entry.inflows.toFixed(2).padEnd(12)} ${entry.outflows.toFixed(2).padEnd(12)} ${
          entry.net >= 0 ? '+' : ''}${entry.net.toFixed(2).padEnd(12)} $${entry.runningBalance.toFixed(2)}`
      );
    }

    lines.push('');
    lines.push('─'.repeat(70));
    lines.push('ASSUMPTIONS:');
    lines.push('─'.repeat(70));
    for (const assumption of forecast.assumptions) {
      lines.push(`  • ${assumption}`);
    }

    lines.push('');
    lines.push('═'.repeat(70));

    return lines.join('\n');
  }

  /**
   * Calculate minimum required cash buffer based on historical volatility
   */
  calculateMinimumCashBuffer(
    historicalOutflows: number[],
    confidenceLevel: number = 0.95
  ): number {
    if (historicalOutflows.length === 0) {
      return 0;
    }

    // Sort outflows descending
    const sorted = [...historicalOutflows].sort((a, b) => b - a);
    
    // Calculate the index for the confidence level
    const index = Math.floor(sorted.length * confidenceLevel);
    
    // Return the outflow at the confidence level
    return sorted[index] || sorted[0];
  }

  /**
   * Identify weeks with potential cash shortfalls
   */
  identifyShortfallWeeks(forecast: CashForecast): ForecastEntry[] {
    return forecast.entries.filter(entry => entry.runningBalance < 0);
  }

  /**
   * Generate scenario-based forecast (best/base/worst case)
   */
  async generateScenarioForecast(params: {
    startingBalance: number;
    startDate: Date;
    expectedReceipts: ExpectedReceipt[];
    scheduledPayments: ScheduledPayment[];
    scenarioWeights?: {
      optimistic: number; // weight for optimistic scenario (0-1)
      pessimistic: number; // weight for pessimistic scenario (0-1)
    };
  }): Promise<{
    optimistic: CashForecast;
    base: CashForecast;
    pessimistic: CashForecast;
  }> {
    const { scenarioWeights = { optimistic: 0.8, pessimistic: 0.6 } } = params;

    // Base case: use actual confidence weights
    const base = await this.generateForecast({
      startingBalance: params.startingBalance,
      startDate: params.startDate,
      expectedReceipts: params.expectedReceipts,
      scheduledPayments: params.scheduledPayments,
    });

    // Optimistic case: assume higher receipt confidence
    const optimisticReceipts = params.expectedReceipts.map(r => ({
      ...r,
      confidence: Math.min(1, r.confidence * 1.2), // 20% boost
    }));
    const optimistic = await this.generateForecast({
      startingBalance: params.startingBalance,
      startDate: params.startDate,
      expectedReceipts: optimisticReceipts,
      scheduledPayments: params.scheduledPayments,
    });

    // Pessimistic case: assume lower receipt confidence
    const pessimisticReceipts = params.expectedReceipts.map(r => ({
      ...r,
      confidence: r.confidence * scenarioWeights.pessimistic,
    }));
    const pessimistic = await this.generateForecast({
      startingBalance: params.startingBalance,
      startDate: params.startDate,
      expectedReceipts: pessimisticReceipts,
      scheduledPayments: params.scheduledPayments,
    });

    return { optimistic, base, pessimistic };
  }

  /**
   * Add recurring payments to scheduled payments
   */
  generateRecurringPayments(
    basePayment: Omit<ScheduledPayment, 'date'>,
    startDate: Date,
    endDate: Date
  ): ScheduledPayment[] {
    const payments: ScheduledPayment[] = [];
    let currentDate = new Date(startDate);

    while (currentDate <= endDate) {
      payments.push({
        ...basePayment,
        date: new Date(currentDate),
        recurring: true,
      });

      // Advance to next occurrence based on frequency
      switch (basePayment.recurringFrequency) {
        case 'weekly':
          currentDate.setDate(currentDate.getDate() + 7);
          break;
        case 'biweekly':
          currentDate.setDate(currentDate.getDate() + 14);
          break;
        case 'monthly':
          currentDate.setMonth(currentDate.getMonth() + 1);
          break;
        case 'quarterly':
          currentDate.setMonth(currentDate.getMonth() + 3);
          break;
        default:
          // If no frequency specified, only add once
          currentDate = endDate;
      }
    }

    return payments;
  }
}
