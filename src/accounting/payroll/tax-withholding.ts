/**
 * Tax Withholding — Federal and state payroll tax calculations
 */

export interface WithholdingResult {
  federalWithholding: number; socialSecurity: number; medicare: number;
  stateWithholding: number; localWithholding: number;
  totalWithholding: number;
}

export class TaxWithholdingService {
  // 2024 IRS Percentage Method brackets (simplified)
  private readonly FEDERAL_BRACKETS = [
    { threshold: 0, rate: 0.10, flat: 0 },
    { threshold: 11600, rate: 0.12, flat: 1160 },
    { threshold: 47150, rate: 0.22, flat: 5426 },
    { threshold: 100525, rate: 0.24, flat: 17168.50 },
    { threshold: 191950, rate: 0.32, flat: 39110.50 },
    { threshold: 243725, rate: 0.35, flat: 55578.50 },
    { threshold: 609350, rate: 0.37, flat: 83328.50 },
  ];
  private readonly SS_RATE = 0.062;
  private readonly SS_WAGE_BASE = 168600;
  private readonly MEDICARE_RATE = 0.0145;
  private readonly ADDITIONAL_MEDICARE_RATE = 0.009;
  private readonly ADDITIONAL_MEDICARE_THRESHOLD = 200000;

  calculateFederalWithholding(annualizedGross: number, filingStatus: string, allowances: number, additionalWithholding: number): number {
    const personalExemption = allowances * 4300;
    const taxableIncome = Math.max(0, annualizedGross - personalExemption);
    let tax = 0;
    const brackets = this.FEDERAL_BRACKETS;
    for (let i = brackets.length - 1; i >= 0; i--) {
      if (taxableIncome > brackets[i].threshold) {
        tax = brackets[i].flat + (taxableIncome - brackets[i].threshold) * brackets[i].rate;
        break;
      }
    }
    return Math.max(0, (tax / 26) + additionalWithholding); // biweekly periods
  }

  calculateSocialSecurity(ytdWages: number, currentGross: number): number {
    const additionalWages = Math.max(0, Math.min(currentGross, this.SS_WAGE_BASE - ytdWages));
    return additionalWages * this.SS_RATE;
  }

  calculateMedicare(ytdWages: number, currentGross: number): number {
    let medicare = currentGross * this.MEDICARE_RATE;
    if (ytdWages + currentGross > this.ADDITIONAL_MEDICARE_THRESHOLD) {
      const excess = Math.min(currentGross, ytdWages + currentGross - this.ADDITIONAL_MEDICARE_THRESHOLD);
      medicare += excess * this.ADDITIONAL_MEDICARE_RATE;
    }
    return medicare;
  }

  calculateStateWithholding(state: string, annualizedGross: number, filingStatus: string, allowances: number): number {
    // Simplified — flat rates by state
    const flatRates: Record<string, number> = { CA: 0.0725, NY: 0.0685, TX: 0, FL: 0, WA: 0, IL: 0.0375 };
    const rate = flatRates[state] ?? 0.04;
    return Math.max(0, (annualizedGross * rate / 26) - (allowances * 150 / 26));
  }

  calculateWithholding(params: {
    grossPay: number; ytdWages: number; filingStatus: string;
    federalAllowances: number; federalAdditionalWithholding: number;
    state: string; stateAllowances: number; stateFilingStatus: string;
  }): WithholdingResult {
    const annualized = params.grossPay * 26;
    const fw = this.calculateFederalWithholding(annualized, params.filingStatus, params.federalAllowances, params.federalAdditionalWithholding);
    const ss = this.calculateSocialSecurity(params.ytdWages, params.grossPay);
    const med = this.calculateMedicare(params.ytdWages, params.grossPay);
    const st = this.calculateStateWithholding(params.state, annualized, params.stateFilingStatus, params.stateAllowances);
    return { federalWithholding: fw, socialSecurity: ss, medicare: med, stateWithholding: st, localWithholding: 0, totalWithholding: fw + ss + med + st };
  }
}
