/**
 * Sales Tax — Uses CompanyConfig for jurisdiction rates and nexus tracking.
 * No hardcoded states — all loaded from company configuration.
 */

import { CompanyConfigService } from '../core/company-config.js';

export interface TransactionTax {
  transactionId: string;
  jurisdictionId: string; jurisdictionName: string;
  taxTypes: { type: string; rate: number; amount: number; }[];
  totalTaxAmount: number; taxableAmount: number;
  exempt: boolean; exemptReason?: string;
}

export interface SalesTaxConfig {
  defaultTaxRate: number;
  shippingTaxable: boolean;
  exemptCategories: string[];
  compoundTax: boolean;  // tax on tax (some jurisdictions)
}

export class SalesTaxService {
  private companyConfig: CompanyConfigService;
  private nexusRegistrations = new Map<string, { companyId: string; jurisdictionId: string; registrationNumber?: string; effectiveDate: Date; status: 'active' | 'cancelled'; }>();

  constructor(companyConfig: CompanyConfigService) {
    this.companyConfig = companyConfig;
  }

  /** Register nexus in a jurisdiction — reads effective tax rate from CompanyConfig */
  async registerNexus(companyId: string, jurisdictionId: string, registrationNumber?: string): Promise<void> {
    const j = await this.companyConfig.getJurisdiction(companyId, jurisdictionId);
    if (!j) throw new Error(`Jurisdiction ${jurisdictionId} not found for company ${companyId}`);
    this.nexusRegistrations.set(`${companyId}_${jurisdictionId}`, {
      companyId, jurisdictionId, registrationNumber,
      effectiveDate: j.effectiveFrom, status: 'active',
    });
  }

  /** Check if company has nexus in a jurisdiction */
  async hasNexus(companyId: string, jurisdictionId: string): Promise<boolean> {
    const reg = this.nexusRegistrations.get(`${companyId}_${jurisdictionId}`);
    return reg?.status === 'active';
  }

  /** Calculate tax — reads rate dynamically from CompanyConfig jurisdiction */
  async calculateTax(params: {
    transactionId: string; companyId: string;
    amount: number;
    jurisdictionId: string;
    productCategory?: string;
    customerExempt?: boolean;
    customerExemptionCertificateId?: string;
  }): Promise<TransactionTax> {
    // Check exemption
    if (params.customerExempt) {
      return {
        transactionId: params.transactionId, jurisdictionId: params.jurisdictionId,
        jurisdictionName: '', taxTypes: [], totalTaxAmount: 0,
        taxableAmount: 0, exempt: true,
        exemptReason: `Certificate: ${params.customerExemptionCertificateId || 'on file'}`,
      };
    }

    // Check nexus
    const hasNexus = await this.hasNexus(params.companyId, params.jurisdictionId);
    if (!hasNexus) {
      return {
        transactionId: params.transactionId, jurisdictionId: params.jurisdictionId,
        jurisdictionName: 'No nexus', taxTypes: [], totalTaxAmount: 0,
        taxableAmount: params.amount, exempt: false,
        exemptReason: 'No nexus in jurisdiction',
      };
    }

    // Get jurisdiction from CompanyConfig
    const j = await this.companyConfig.getJurisdiction(params.companyId, params.jurisdictionId);
    if (!j) {
      return {
        transactionId: params.transactionId, jurisdictionId: params.jurisdictionId,
        jurisdictionName: 'Unknown', taxTypes: [], totalTaxAmount: 0,
        taxableAmount: params.amount, exempt: false,
        exemptReason: 'Unknown jurisdiction',
      };
    }

    // Get applicable tax rates from jurisdiction config
    const applicableRates = j.taxRates.filter(t =>
      ['sales', 'sales_tax', 'vat', 'gst'].includes(t.type.toLowerCase())
    );

    const taxTypes = applicableRates.map(t => ({
      type: t.type, rate: t.rate, amount: Math.round(params.amount * t.rate * 100) / 100,
    }));

    const totalTaxAmount = taxTypes.reduce((s, t) => s + t.amount, 0);

    return {
      transactionId: params.transactionId,
      jurisdictionId: params.jurisdictionId,
      jurisdictionName: j.name,
      taxTypes, totalTaxAmount, taxableAmount: params.amount,
      exempt: false,
    };
  }

  /** List all nexus registrations for a company */
  async getNexusStates(companyId: string): Promise<{ jurisdictionId: string; registrationNumber?: string; }[]> {
    return Array.from(this.nexusRegistrations.values())
      .filter(r => r.companyId === companyId && r.status === 'active')
      .map(r => ({ jurisdictionId: r.jurisdictionId, registrationNumber: r.registrationNumber }));
  }
}
