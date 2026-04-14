/**
 * Income Tax Provision — Uses CompanyConfig for federal/state rates.
 * No hardcoded state rates — loaded from jurisdiction configuration.
 */

import { CompanyConfigService } from '../core/company-config.js';

export interface TaxProvisionEstimate {
  year: number; preTaxIncome: number;
  federalTaxRate: number; federalTax: number;
  stateTaxRate: number; stateTax: number;
  totalTax: number; effectiveTaxRate: number; netIncome: number;
  deferredTaxAssets: number; deferredTaxLiabilities: number;
}

export interface DeferredTaxItem { description: string; temporaryDifference: number; taxRate: number; deferredTaxAmount: number; }
export interface TaxJournalEntry { description: string; accountCode: string; debit: number; credit: number; }

export class IncomeTaxProvisionService {
  constructor(private companyConfig: CompanyConfigService) {}

  /** Estimate provision — reads federal + state rates from CompanyConfig */
  async estimateProvision(params: {
    companyId: string; preTaxIncome: number; year: number;
    federalJurisdictionId: string; stateJurisdictionId?: string;
    deferredItems?: DeferredTaxItem[];
  }): Promise<TaxProvisionEstimate> {
    // Get federal rate from CompanyConfig
    const fedJ = await this.companyConfig.getJurisdiction(params.companyId, params.federalJurisdictionId);
    const federalRate = fedJ?.taxRates.find(t => t.type === 'corporate_income')?.rate ?? 0.21;
    const federalTax = Math.max(0, params.preTaxIncome * federalRate);

    // Get state rate from CompanyConfig (or fall back to 0)
    let stateRate = 0;
    if (params.stateJurisdictionId) {
      const stateJ = await this.companyConfig.getJurisdiction(params.companyId, params.stateJurisdictionId);
      stateRate = stateJ?.taxRates.find(t => t.type === 'corporate_income')?.rate ?? 0;
    }
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
      federalTaxRate: federalRate, federalTax,
      stateTaxRate: stateRate, stateTax,
      totalTax, effectiveTaxRate, netIncome: params.preTaxIncome - totalTax,
      deferredTaxAssets: dta, deferredTaxLiabilities: dtl,
    };
  }

  /** Generate journal entries — configurable account codes from company policy */
  generateJournalEntries(estimate: TaxProvisionEstimate, opts?: {
    incomeTaxExpenseAccount?: string; federalPayableAccount?: string; statePayableAccount?: string;
  }): TaxJournalEntry[] {
    return [
      { description: 'Federal income tax provision', accountCode: opts?.incomeTaxExpenseAccount ?? '8991', debit: estimate.federalTax, credit: 0 },
      { description: 'State income tax provision', accountCode: opts?.incomeTaxExpenseAccount ?? '8991', debit: estimate.stateTax, credit: 0 },
      { description: 'Federal income tax payable', accountCode: opts?.federalPayableAccount ?? '2310', debit: 0, credit: estimate.federalTax },
      { description: 'State income tax payable', accountCode: opts?.statePayableAccount ?? '2311', debit: 0, credit: estimate.stateTax },
    ];
  }
}
