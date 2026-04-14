/**
 * Income Tax Provision — Federal and state tax estimation
 */

export interface TaxProvisionEstimate {
  year: number; preTaxIncome: number;
  federalTaxRate: number; federalTax: number;
  stateTaxRate: number; stateTax: number;
  totalTax: number; effectiveTaxRate: number; netIncome: number;
  deferredTaxAssets: number; deferredTaxLiabilities: number;
}

export interface DeferredTaxItem { accountCode: string; description: string; temporaryDifference: number; taxRate: number; deferredTaxAmount: number; }

export interface TaxJournalEntry { description: string; accountCode: string; debit: number; credit: number; }

export class IncomeTaxProvisionService {
  private readonly FEDERAL_RATE = 0.21; // flat corporate rate
  private readonly STATE_RATES: Record<string, number> = {
    CA: 0.0884, NY: 0.0725, TX: 0.0, FL: 0.055, WA: 0.0,
    IL: 0.095, OH: 0.0, MA: 0.08, PA: 0.0675, GA: 0.055,
  };

  async estimateProvision(params: { preTaxIncome: number; state: string; year: number; deferredItems?: DeferredTaxItem[]; }): Promise<TaxProvisionEstimate> {
    const federalTax = Math.max(0, params.preTaxIncome * this.FEDERAL_RATE);
    const stateRate = this.STATE_RATES[params.state] ?? 0.05;
    const stateTax = Math.max(0, params.preTaxIncome * stateRate);
    const totalTax = federalTax + stateTax;
    const effectiveTaxRate = params.preTaxIncome > 0 ? totalTax / params.preTaxIncome : 0;

    let dta = 0, dtl = 0;
    for (const item of (params.deferredItems || [])) {
      if (item.temporaryDifference > 0) dta += item.temporaryDifference * item.taxRate;
      else dtl += Math.abs(item.temporaryDifference) * item.taxRate;
    }

    return {
      year: params.year, preTaxIncome: params.preTaxIncome,
      federalTaxRate: this.FEDERAL_RATE, federalTax,
      stateTaxRate: stateRate, stateTax,
      totalTax, effectiveTaxRate, netIncome: params.preTaxIncome - totalTax,
      deferredTaxAssets: dta, deferredTaxLiabilities: dtl,
    };
  }

  generateJournalEntries(estimate: TaxProvisionEstimate): TaxJournalEntry[] {
    return [
      { description: 'Federal income tax provision', accountCode: '8990', debit: estimate.federalTax, credit: 0 },
      { description: 'State income tax provision', accountCode: '8991', debit: estimate.stateTax, credit: 0 },
      { description: 'Federal income tax payable', accountCode: '2310', debit: 0, credit: estimate.federalTax },
      { description: 'State income tax payable', accountCode: '2311', debit: 0, credit: estimate.stateTax },
    ];
  }

  async calculateEffectiveTaxRate(historical: { preTaxIncome: number; totalTax: number; }[]): Promise<number> {
    const totalPreTax = historical.reduce((s, p) => s + p.preTaxIncome, 0);
    const totalTax = historical.reduce((s, p) => s + p.totalTax, 0);
    return totalPreTax > 0 ? totalTax / totalPreTax : 0;
  }
}
