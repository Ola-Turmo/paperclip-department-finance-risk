/**
 * Benefit Deductions — configurable limits per jurisdiction, not hardcoded IRS.
 */

export interface DeductionPlan {
  id: string; name: string;
  deductionType: string;  // 'health', 'hsa', 'fsa', '401k', 'pension', etc.
  employeeAmount: number; employerAmount: number;
  annualLimit?: number;
  preTax: boolean;
  frequency: 'per_paycheck' | 'annual';
  jurisdictionId: string;
}

export interface DeductionElection extends DeductionPlan {}

export interface DeductionResult {
  planId: string; type: string; description: string;
  employeeDeduction: number; employerContribution: number;
  preTax: boolean; remainingAllowance: number;
}

export interface BenefitDeductionConfig {
  annualLimits: Record<string, Record<number, number>>;  // e.g. { hsa: { 2024: 4150 } }
  plans: DeductionPlan[];
}

export class BenefitDeductionService {
  private config: BenefitDeductionConfig;

  constructor(config?: BenefitDeductionConfig) {
    this.config = config ?? {
      annualLimits: {
        hsa: { 2024: 4150, 2025: 4300 },
        fsa: { 2024: 3200 },
        '401k': { 2024: 23000, 2025: 23500 },
        pension: { 2024: 7000 },
      },
      plans: [],
    };
  }

  updateConfig(config: BenefitDeductionConfig): void {
    this.config = config;
  }

  getAnnualLimit(deductionType: string, year: number): number {
    return this.config.annualLimits[deductionType]?.[year] ?? Infinity;
  }

  async calculateDeductions(
    elections: DeductionElection[], grossPay: number,
    payFrequency: string, year: number
  ): Promise<DeductionResult[]> {
    const perPeriodsPerYear = payFrequency === 'weekly' ? 52 : payFrequency === 'biweekly' ? 26 : payFrequency === 'semimonthly' ? 24 : 12;
    const results: DeductionResult[] = [];

    for (const election of elections) {
      const annualLimit = this.getAnnualLimit(election.deductionType, year);
      let empAmount = election.frequency === 'annual' && election.annualLimit
        ? election.annualLimit / perPeriodsPerYear
        : election.employeeAmount;
      empAmount = Math.min(empAmount, annualLimit / perPeriodsPerYear);
      const remaining = annualLimit - empAmount * perPeriodsPerYear;
      results.push({
        planId: election.id, type: election.deductionType, description: election.name,
        employeeDeduction: empAmount, employerContribution: election.employerAmount,
        preTax: election.preTax, remainingAllowance: Math.max(0, remaining),
      });
    }
    return results;
  }

  getAvailablePlans(jurisdictionId?: string): DeductionPlan[] {
    if (!jurisdictionId) return this.config.plans;
    return this.config.plans.filter(p => p.jurisdictionId === jurisdictionId);
  }

  addPlan(plan: DeductionPlan): void {
    this.config.plans.push(plan);
  }
}
