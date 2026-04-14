/**
 * Chart of Accounts Configurator — account codes are data, not hardcoded strings.
 * A company defines its own COA structure via CompanyConfig.chartOfAccountsId.
 */

export enum AccountType {
  ASSET = 'asset', LIABILITY = 'liability', EQUITY = 'equity',
  REVENUE = 'revenue', EXPENSE = 'expense', OTHER_INCOME = 'other_income', OTHER_EXPENSE = 'other_expense',
}
export enum AccountNormalBalance { DEBIT = 'debit', CREDIT = 'credit' }

export interface AccountDefinition {
  id: string;                   // "1000-CASH"
  code: string;                 // "1000"
  name: string;                 // "Cash"
  type: AccountType;
  normalBalance: AccountNormalBalance;
  isActive: boolean;
  allowDelete: boolean;
  parentCode?: string;
  description?: string;
  taxCode?: string;
  bankAccountId?: string;
  costCenterRequired: boolean;
  validTrackBalances: 'per_period' | 'ytd_only' | 'both' | 'none';
  contraAccountCode?: string;
  defaultAccountCode?: string;
}

export interface ChartOfAccountsConfig {
  id: string;
  companyId: string;
  countryCode: string;
  description: string;
  accounts: AccountDefinition[];
  createdAt: Date;
  version: number;
}

export class ChartOfAccountsConfigurator {
  private _storage = new Map<string, ChartOfAccountsConfig>();

  async register(config: ChartOfAccountsConfig): Promise<void> {
    this._storage.set(config.id, config);
  }

  async get(configId: string): Promise<ChartOfAccountsConfig | null> {
    return this._storage.get(configId) || null;
  }

  async getAccount(configId: string, accountCode: string): Promise<AccountDefinition | null> {
    const config = await this.get(configId);
    return config?.accounts.find(a => a.code === accountCode) || null;
  }

  async getAccountsByType(configId: string, type: AccountType): Promise<AccountDefinition[]> {
    const config = await this.get(configId);
    return config?.accounts.filter(a => a.type === type && a.isActive) || [];
  }

  async getBankAccounts(configId: string): Promise<AccountDefinition[]> {
    const config = await this.get(configId);
    return config?.accounts.filter(a => a.type === AccountType.ASSET && a.bankAccountId) || [];
  }

  /** Seed default US GAAP-compliant chart of accounts */
  async seedDefaultUSGAAP(companyId: string): Promise<ChartOfAccountsConfig> {
    const accounts: AccountDefinition[] = [
      // ASSETS (1000-1999)
      { id: '1000', code: '1000', name: 'Cash', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, costCenterRequired: false, validTrackBalances: 'both', bankAccountId: 'bank-primary-checking' },
      { id: '1010', code: '1010', name: 'Cash - Payroll', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, parentCode: '1000', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '1100', code: '1100', name: 'Accounts Receivable', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, taxCode: 'AR', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '1200', code: '1200', name: 'Inventory', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, costCenterRequired: true, validTrackBalances: 'both' },
      { id: '1300', code: '1300', name: 'Prepaid Expenses', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '1500', code: '1500', name: 'Fixed Assets (Cost)', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, costCenterRequired: true, validTrackBalances: 'both' },
      { id: '1510', code: '1510', name: 'Accumulated Depreciation', type: AccountType.ASSET, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '1500', contraAccountCode: '1500', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '1900', code: '1900', name: 'Other Assets', type: AccountType.ASSET, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      // LIABILITIES (2000-2999)
      { id: '2000', code: '2000', name: 'Accounts Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, taxCode: 'AP', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2100', code: '2100', name: 'Accrued Expenses', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2200', code: '2200', name: 'Sales Tax Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, taxCode: 'STX', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2300', code: '2300', name: 'Payroll Tax Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2310', code: '2310', name: 'Federal Income Tax Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '2300', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2311', code: '2311', name: 'State Income Tax Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '2300', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2312', code: '2312', name: 'Employer Payroll Tax Payable', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '2300', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2500', code: '2500', name: 'Long-Term Debt', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '2600', code: '2600', name: 'Deferred Tax Liabilities', type: AccountType.LIABILITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      // EQUITY (3000-3999)
      { id: '3000', code: '3000', name: 'Common Stock', type: AccountType.EQUITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, costCenterRequired: false, validTrackBalances: 'none' },
      { id: '3100', code: '3100', name: 'Additional Paid-In Capital', type: AccountType.EQUITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '3000', costCenterRequired: false, validTrackBalances: 'none' },
      { id: '3200', code: '3200', name: 'Retained Earnings', type: AccountType.EQUITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, costCenterRequired: false, validTrackBalances: 'none' },
      { id: '3300', code: '3300', name: 'Net Income', type: AccountType.EQUITY, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, parentCode: '3200', costCenterRequired: false, validTrackBalances: 'per_period' },
      // REVENUE (4000-4999)
      { id: '4000', code: '4000', name: 'Sales Revenue', type: AccountType.REVENUE, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: false, taxCode: 'SALES', costCenterRequired: true, validTrackBalances: 'both' },
      { id: '4100', code: '4100', name: 'Sales Discounts', type: AccountType.REVENUE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, parentCode: '4000', contraAccountCode: '4000', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '4200', code: '4200', name: 'Other Income', type: AccountType.OTHER_INCOME, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      // EXPENSES (5000-6999)
      { id: '5000', code: '5000', name: 'Cost of Goods Sold', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, taxCode: 'COGS', costCenterRequired: true, validTrackBalances: 'both' },
      { id: '6000', code: '6000', name: 'Salaries & Wages', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: false, costCenterRequired: true, validTrackBalances: 'both' },
      { id: '6100', code: '6100', name: 'Office Supplies', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, parentCode: '6000', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '6200', code: '6200', name: 'Employee Benefits', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, parentCode: '6000', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '6201', code: '6201', name: 'Employer Payroll Tax Expense', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, parentCode: '6000', costCenterRequired: false, validTrackBalances: 'both' },
      { id: '6300', code: '6300', name: 'Rent Expense', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: true, validTrackBalances: 'both' },
      { id: '6400', code: '6400', name: 'Depreciation Expense', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: true, validTrackBalances: 'both' },
      { id: '6500', code: '6500', name: 'Professional Fees', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '6990', code: '6990', name: 'Loss on Asset Disposal', type: AccountType.OTHER_EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '8990', code: '8990', name: 'Gain on Asset Disposal', type: AccountType.OTHER_INCOME, normalBalance: AccountNormalBalance.CREDIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
      { id: '8991', code: '8991', name: 'Income Tax Expense', type: AccountType.EXPENSE, normalBalance: AccountNormalBalance.DEBIT, isActive: true, allowDelete: true, costCenterRequired: false, validTrackBalances: 'both' },
    ];

    const config: ChartOfAccountsConfig = {
      id: `${companyId}-coa`, companyId, countryCode: 'US',
      description: 'US GAAP Standard Chart of Accounts',
      accounts, createdAt: new Date(), version: 1,
    };
    await this.register(config);
    return config;
  }
}
