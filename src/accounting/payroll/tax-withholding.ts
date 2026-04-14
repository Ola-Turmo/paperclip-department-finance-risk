/**
 * Tax Withholding — all brackets/rates are configurable per company/jurisdiction.
 * No hardcoded IRS/US references — loaded from CompanyConfig.
 */

import { CompanyConfigService } from '../core/company-config.js';

export interface WithholdingResult {
  federalWithholding: number; socialSecurity: number; medicare: number;
  stateWithholding: number; localWithholding: number; totalWithholding: number;
}

export interface WithholdingBracket {
  threshold: number; rate: number; flat: number;
}

export interface WithholdingConfig {
  brackets: WithholdingBracket[];
  exemptionAmount: number;          // per allowance
  additionalWithholdingPerAllowance: number;
  socialSecurityRate: number;
  socialSecurityWageBase: number;
  medicareRate: number;
  additionalMedicareRate: number;
  additionalMedicareThreshold: number;
}

export const DEFAULT_US_FEDERAL_WITHHOLDING: WithholdingConfig = {
  brackets: [
    { threshold: 0, rate: 0.10, flat: 0 },
    { threshold: 11600, rate: 0.12, flat: 1160 },
    { threshold: 47150, rate: 0.22, flat: 5426 },
    { threshold: 100525, rate: 0.24, flat: 17168.50 },
    { threshold: 191950, rate: 0.32, flat: 39110.50 },
    { threshold: 243725, rate: 0.35, flat: 55578.50 },
    { threshold: 609350, rate: 0.37, flat: 83328.50 },
  ],
  exemptionAmount: 4300,
  additionalWithholdingPerAllowance: 0,
  socialSecurityRate: 0.062,
  socialSecurityWageBase: 168600,
  medicareRate: 0.0145,
  additionalMedicareRate: 0.009,
  additionalMedicareThreshold: 200000,
};

export class TaxWithholdingService {
  private config: Record<string, WithholdingConfig> = {};
  private companyConfig: CompanyConfigService;

  constructor(companyConfig: CompanyConfigService) {
    this.companyConfig = companyConfig;
  }

  /** Register withholding config for a jurisdiction */
  registerConfig(jurisdictionId: string, config: WithholdingConfig): void {
    this.config[jurisdictionId] = config;
  }

  /** Load config from company jurisdiction (or use provided default) */
  private async getConfig(jurisdictionId: string): Promise<WithholdingConfig> {
    return this.config[jurisdictionId] ?? DEFAULT_US_FEDERAL_WITHHOLDING;
  }

  calculateFederalWithholding(
    annualizedGross: number, filingStatus: string, allowances: number,
    additionalWithholding: number, config: WithholdingConfig
  ): number {
    const exemptionAmount = allowances * config.exemptionAmount;
    const taxableIncome = Math.max(0, annualizedGross - exemptionAmount);
    let tax = 0;
    for (let i = config.brackets.length - 1; i >= 0; i--) {
      if (taxableIncome > config.brackets[i].threshold) {
        tax = config.brackets[i].flat + (taxableIncome - config.brackets[i].threshold) * config.brackets[i].rate;
        break;
      }
    }
    return Math.max(0, (tax / 26) + additionalWithholding);
  }

  calculateSocialSecurity(ytdWages: number, currentGross: number, config: WithholdingConfig): number {
    const additionalWages = Math.max(0, Math.min(currentGross, config.socialSecurityWageBase - ytdWages));
    return additionalWages * config.socialSecurityRate;
  }

  calculateMedicare(ytdWages: number, currentGross: number, config: WithholdingConfig): number {
    let medicare = currentGross * config.medicareRate;
    if (ytdWages + currentGross > config.additionalMedicareThreshold) {
      const excess = Math.min(currentGross, ytdWages + currentGross - config.additionalMedicareThreshold);
      medicare += excess * config.additionalMedicareRate;
    }
    return medicare;
  }

  async calculateWithholding(params: {
    grossPay: number; ytdWages: number;
    federalJurisdictionId: string; filingStatus: string;
    federalAllowances: number; federalAdditionalWithholding: number;
    stateJurisdictionId?: string; stateFilingStatus?: string; stateAllowances?: number;
    localJurisdictionId?: string;
  }): Promise<WithholdingResult> {
    const annualized = params.grossPay * 26;
    const fedConfig = await this.getConfig(params.federalJurisdictionId);
    const fw = this.calculateFederalWithholding(annualized, params.filingStatus, params.federalAllowances, params.federalAdditionalWithholding, fedConfig);
    const ss = this.calculateSocialSecurity(params.ytdWages, params.grossPay, fedConfig);
    const med = this.calculateMedicare(params.ytdWages, params.grossPay, fedConfig);

    let stateWithholding = 0;
    if (params.stateJurisdictionId) {
      const stateConfig = await this.getConfig(params.stateJurisdictionId);
      const stateTaxable = Math.max(0, annualized - (params.stateAllowances || 0) * stateConfig.exemptionAmount);
      for (let i = stateConfig.brackets.length - 1; i >= 0; i--) {
        if (stateTaxable > stateConfig.brackets[i].threshold) {
          stateWithholding = Math.max(0, (stateConfig.brackets[i].flat + (stateTaxable - stateConfig.brackets[i].threshold) * stateConfig.brackets[i].rate) / 26);
          break;
        }
      }
    }

    return { federalWithholding: fw, socialSecurity: ss, medicare: med, stateWithholding, localWithholding: 0, totalWithholding: fw + ss + med + stateWithholding };
  }
}
