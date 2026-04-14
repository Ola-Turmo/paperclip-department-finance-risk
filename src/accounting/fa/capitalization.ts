/**
 * Capitalization Policy — Asset capitalization threshold enforcement
 */

export interface CapitalizationPolicy {
  id: string; name: string; description: string;
  minAmount: number; categories: string[]; usefulLifeThresholdYears: number;
  active: boolean;
}

export class CapitalizationPolicyService {
  private policies = new Map<string, CapitalizationPolicy>();
  private idCounter = 0;
  private nextId(): string { return `cap_${Date.now()}_${++this.idCounter}`; }

  async create(policy: Omit<CapitalizationPolicy, 'id'>): Promise<CapitalizationPolicy> {
    const p: CapitalizationPolicy = { ...policy, id: this.nextId() };
    this.policies.set(p.id, p);
    return p;
  }

  async shouldCapitalize(category: string, cost: number, usefulLifeYears: number): Promise<boolean> {
    const applicable = Array.from(this.policies.values()).filter(
      p => p.active && p.categories.includes(category) && p.minAmount <= cost && p.usefulLifeThresholdYears <= usefulLifeYears
    );
    return applicable.length > 0 || cost >= 1000; // $1,000 default
  }

  async getActive(): Promise<CapitalizationPolicy[]> {
    return Array.from(this.policies.values()).filter(p => p.active);
  }

  async deactivate(id: string): Promise<void> {
    const p = this.policies.get(id);
    if (p) p.active = false;
  }
}
