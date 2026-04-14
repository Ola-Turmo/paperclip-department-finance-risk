/**
 * Sales Tax — Jurisdiction rates, nexus tracking, tax calculation
 */

export interface TaxRate { jurisdictionId: string; jurisdictionName: string; rate: number; type: 'state' | 'county' | 'city' | 'district'; }
export interface TaxRegistration { companyId: string; jurisdictionId: string; jurisdictionName: string; state: string; type: 'sales' | 'sellers_use' | 'cottage'; registrationNumber?: string; effectiveDate: Date; status: 'active' | 'cancelled'; }
export interface TransactionTax { transactionId: string; shippingState?: string; taxableAmount: number; taxRate: number; taxAmount: number; jurisdictionName: string; exempt: boolean; }

export class SalesTaxService {
  private jurisdictionRates = new Map<string, TaxRate>();
  private registrations = new Map<string, TaxRegistration>();
  private nexusJurisdictions = new Set<string>();

  constructor() {
    // Seed common state rates
    const rates: [string, number, string][] = [
      ['CA', 0.0725, 'California'], ['NY', 0.08, 'New York'], ['TX', 0.0625, 'Texas'],
      ['FL', 0.06, 'Florida'], ['WA', 0.065, 'Washington'], ['IL', 0.0625, 'Illinois'],
      ['PA', 0.06, 'Pennsylvania'], ['OH', 0.0575, 'Ohio'], ['GA', 0.04, 'Georgia'],
      ['NC', 0.0475, 'North Carolina'], ['MI', 0.06, 'Michigan'], ['NJ', 0.06625, 'New Jersey'],
      ['VA', 0.053, 'Virginia'], ['AZ', 0.056, 'Arizona'], ['MA', 0.0625, 'Massachusetts'],
    ];
    for (const [id, rate, name] of rates) {
      this.jurisdictionRates.set(id, { jurisdictionId: id, jurisdictionName: name, rate, type: 'state' });
    }
  }

  async registerNexus(jurisdictionId: string, companyId: string, registrationNumber?: string): Promise<void> {
    this.nexusJurisdictions.add(jurisdictionId);
    const rate = this.jurisdictionRates.get(jurisdictionId);
    if (rate) {
      this.registrations.set(`${companyId}_${jurisdictionId}`, {
        companyId, jurisdictionId, jurisdictionName: rate.jurisdictionName, state: jurisdictionId,
        type: 'sales', registrationNumber, effectiveDate: new Date(), status: 'active',
      });
    }
  }

  async calculateTax(params: { transactionId: string; amount: number; shippingState?: string; exempt?: boolean; }): Promise<TransactionTax> {
    if (params.exempt) return { transactionId: params.transactionId, taxableAmount: 0, taxRate: 0, taxAmount: 0, jurisdictionName: 'Exempt', exempt: true };
    const state = params.shippingState || 'CA';
    if (!this.nexusJurisdictions.has(state)) return { transactionId: params.transactionId, shippingState: state, taxableAmount: params.amount, taxRate: 0, taxAmount: 0, jurisdictionName: 'No nexus in ' + state, exempt: false };
    const rate = this.jurisdictionRates.get(state);
    if (!rate) return { transactionId: params.transactionId, shippingState: state, taxableAmount: params.amount, taxRate: 0, taxAmount: 0, jurisdictionName: 'Unknown', exempt: false };
    const taxAmount = Math.round(params.amount * rate.rate * 100) / 100;
    return { transactionId: params.transactionId, shippingState: state, taxableAmount: params.amount, taxRate: rate.rate, taxAmount, jurisdictionName: rate.jurisdictionName, exempt: false };
  }

  async getNexusStates(companyId: string): Promise<TaxRegistration[]> {
    return Array.from(this.registrations.values()).filter(r => r.companyId === companyId && r.status === 'active');
  }

  async addJurisdictionRate(rate: TaxRate): Promise<void> {
    this.jurisdictionRates.set(rate.jurisdictionId, rate);
  }

  async getRate(jurisdictionId: string): Promise<TaxRate | undefined> {
    return this.jurisdictionRates.get(jurisdictionId);
  }
}
