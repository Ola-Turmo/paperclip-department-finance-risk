/**
 * Company Configuration — defines company structure, jurisdiction, and accounting policies.
 * This is data, not code — loaded from DB/config, not hardcoded.
 */

export interface CountryConfig {
  countryCode: string;           // ISO 3166-1 alpha-2: "US", "GB", "DE", "NO"
  countryName: string;           // "United States", "United Kingdom", "Germany"
  currencyCode: string;          // ISO 4217: "USD", "GBP", "EUR", "NOK"
  currencyDecimals: number;      // 2 for most, 0 for JPY
  dateFormat: string;            // "MM/DD/YYYY", "DD/MM/YYYY", "YYYY-MM-DD"
  fiscalYearStart: number;       // 1=Jan, 4=Apr (UK), 7=Jul (AU)
  taxAuthority: string;          // "IRS", "HMRC", "FINANTS", "Skatteetaten"
}

export interface JurisdictionConfig {
  id: string;                    // "US-CA", "US-NY", "GB-ENG", "NO"
  countryCode: string;           // parent country
  level: 'federal' | 'state' | 'province' | 'region' | 'city' | 'local';
  name: string;                  // "California", "England", "Oslo"
  taxRates: { type: string; rate: number; description: string; }[];
  filingFrequencies: { taxType: string; frequency: 'monthly' | 'quarterly' | 'annually' }[];
  effectiveFrom: Date;
  effectiveTo?: Date;
}

export interface AccountingPolicy {
  id: string;
  companyId: string;
  // Currency
  functionalCurrency: string;
  presentationCurrency: string;
  // Fiscal
  fiscalYearStartMonth: number;  // 1-12
  useFiscalYear: boolean;
  // Decimal
  amountDecimalPlaces: number;
  // Tax
  defaultTaxRate: number;
  salesTaxInclusive: boolean;    // true = prices include tax
  // Numbering
  vendorNumberPrefix: string;
  customerNumberPrefix: string;
  invoiceNumberFormat: string;   // e.g. "INV-{YYYY}-{NNN}"
  journalNumberFormat: string;
  assetNumberPrefix: string;
  // Payroll
  payrollFrequency: 'weekly' | 'biweekly' | 'semimonthly' | 'monthly';
  payrollWeekStart: number;      // 0=Sunday, 1=Monday
  // Chart of Accounts
  chartOfAccountsId: string;
}

export interface CompanyStructure {
  id: string;
  name: string;
  country: CountryConfig;
  jurisdictions: JurisdictionConfig[];
  accountingPolicy: AccountingPolicy;
  subsidiaries?: CompanyStructure[];  // for corporate groups
  parentCompanyId?: string;
  // Multi-entity intercompany settings
  intercompanyEnabled: boolean;
  intercompanyEliminationMethod?: 'partial' | 'full';
  // Reporting
  consolidationRequired: boolean;
}

export class CompanyConfigService {
  private storage = new Map<string, CompanyStructure>();
  private idCounter = 0;

  async register(company: CompanyStructure): Promise<void> {
    this.storage.set(company.id, company);
  }

  async get(companyId: string): Promise<CompanyStructure | null> {
    return this.storage.get(companyId) || null;
  }

  async getJurisdiction(companyId: string, jurisdictionId: string): Promise<JurisdictionConfig | null> {
    const company = await this.get(companyId);
    return company?.jurisdictions.find(j => j.id === jurisdictionId && (!j.effectiveTo || j.effectiveTo > new Date())) || null;
  }

  async getEffectiveTaxRate(companyId: string, jurisdictionId: string, taxType: string): Promise<number> {
    const j = await this.getJurisdiction(companyId, jurisdictionId);
    if (!j) return 0;
    return j.taxRates.find(t => t.type === taxType)?.rate ?? 0;
  }

  async list(): Promise<CompanyStructure[]> {
    return Array.from(this.storage.values());
  }

  /** Seed default US company configuration */
  async seedDefaultUS(companyId: string): Promise<CompanyStructure> {
    const company: CompanyStructure = {
      id: companyId, name: 'US Corporation', country: {
        countryCode: 'US', countryName: 'United States',
        currencyCode: 'USD', currencyDecimals: 2, dateFormat: 'MM/DD/YYYY',
        fiscalYearStart: 1, taxAuthority: 'IRS',
      },
      jurisdictions: [
        { id: 'US-FEDERAL', countryCode: 'US', level: 'federal', name: 'United States Federal',
          taxRates: [{ type: 'corporate_income', rate: 0.21, description: 'Flat corporate rate' }],
          filingFrequencies: [{ taxType: 'corporate_income', frequency: 'annually' }],
          effectiveFrom: new Date('2024-01-01') },
        { id: 'US-CA', countryCode: 'US', level: 'state', name: 'California',
          taxRates: [{ type: 'sales', rate: 0.0725, description: 'CA state sales tax' }, { type: 'corporate_income', rate: 0.0884, description: 'CA franchise tax' }],
          filingFrequencies: [{ taxType: 'sales', frequency: 'monthly' }, { taxType: 'corporate_income', frequency: 'annually' }],
          effectiveFrom: new Date('2024-01-01') },
        { id: 'US-NY', countryCode: 'US', level: 'state', name: 'New York',
          taxRates: [{ type: 'sales', rate: 0.08, description: 'NY state sales tax' }, { type: 'corporate_income', rate: 0.0725, description: 'NY corporate franchise tax' }],
          filingFrequencies: [{ taxType: 'sales', frequency: 'monthly' }, { taxType: 'corporate_income', frequency: 'annually' }],
          effectiveFrom: new Date('2024-01-01') },
        { id: 'US-TX', countryCode: 'US', level: 'state', name: 'Texas',
          taxRates: [{ type: 'sales', rate: 0.0625, description: 'TX state sales tax' }],
          filingFrequencies: [{ taxType: 'sales', frequency: 'quarterly' }],
          effectiveFrom: new Date('2024-01-01') },
        { id: 'US-UK', countryCode: 'GB', level: 'federal', name: 'United Kingdom',
          taxRates: [{ type: 'vat', rate: 0.20, description: 'Standard rate VAT' }, { type: 'corporate_income', rate: 0.25, description: 'UK CT rate' }],
          filingFrequencies: [{ taxType: 'vat', frequency: 'quarterly' }, { taxType: 'corporate_income', frequency: 'annually' }],
          effectiveFrom: new Date('2024-01-01') },
      ],
      accountingPolicy: {
        id: `${companyId}-policy`, companyId,
        functionalCurrency: 'USD', presentationCurrency: 'USD',
        fiscalYearStartMonth: 1, useFiscalYear: true,
        amountDecimalPlaces: 2, defaultTaxRate: 0.0825, salesTaxInclusive: false,
        vendorNumberPrefix: 'VEN-', customerNumberPrefix: 'CUS-',
        invoiceNumberFormat: 'INV-{YYYY}-{NNN}', journalNumberFormat: 'JE-{YYYY}-{NNN}',
        assetNumberPrefix: 'FA-',
        payrollFrequency: 'biweekly', payrollWeekStart: 1,
        chartOfAccountsId: `${companyId}-coa`,
      },
      intercompanyEnabled: false, consolidationRequired: false,
    };
    await this.register(company);
    return company;
  }
}
