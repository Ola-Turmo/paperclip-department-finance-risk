/**
 * Benefit Deductions — Health, retirement, FSA, HSA, and other deductions
 */

export enum DeductionType { HEALTH = 'health', DENTAL = 'dental', VISION = 'vision', LIFE = 'life', DISABILITY = 'disability', HSA = 'hsa', FSA = 'fsa', RETIREMENT_401K = '401k', RETIREMENT_403B = '403b', OTHER = 'other' }
export enum DeductionFrequency { PER_PAYCHECK = 'per_paycheck', ANNUAL = 'annual' }

export interface DeductionElection {
  deductionType: DeductionType; description: string;
  employeeAmount: number; employerAmount: number;
  frequency: DeductionFrequency; preTax: boolean; annualAmount?: number;
}

export interface DeductionResult { type: DeductionType; description: string; employeeDeduction: number; employerContribution: number; preTax: boolean; }

export class BenefitDeductionService {
  // 2024 annual IRS limits
  private readonly HSA_INDIVIDUAL_LIMIT = 4150;
  private readonly HSA_FAMILY_LIMIT = 8300;
  private readonly FSA_LIMIT = 3200;
  private readonly RETIREMENT_LIMIT = 23000;
  private readonly CATCHUP_LIMIT = 7750;

  async calculateDeductions(elections: DeductionElection[], grossPay: number, payFrequency: string): Promise<DeductionResult[]> {
    const results: DeductionResult[] = [];
    const perPeriodsPerYear = payFrequency === 'weekly' ? 52 : payFrequency === 'biweekly' ? 26 : payFrequency === 'semimonthly' ? 24 : 12;

    for (const election of elections) {
      let empAmount = election.employeeAmount;
      if (election.frequency === DeductionFrequency.ANNUAL && election.annualAmount) {
        empAmount = election.annualAmount / perPeriodsPerYear;
      }
      // Cap HSA
      if (election.deductionType === DeductionType.HSA && empAmount > this.HSA_INDIVIDUAL_LIMIT / perPeriodsPerYear) {
        empAmount = this.HSA_INDIVIDUAL_LIMIT / perPeriodsPerYear;
      }
      results.push({ type: election.deductionType, description: election.description, employeeDeduction: empAmount, employerContribution: election.employerAmount, preTax: election.preTax });
    }
    return results;
  }

  async calculateEmployerBenefits(elections: DeductionElection[]): Promise<{ totalPerPaycheck: number; totalAnnual: number }> {
    let totalPerPaycheck = 0, totalAnnual = 0;
    for (const e of elections) {
      totalPerPaycheck += e.employerAmount;
      totalAnnual += e.employerAmount * 26; // biweekly
    }
    return { totalPerPaycheck, totalAnnual };
  }
}
