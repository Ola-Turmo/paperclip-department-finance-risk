/**
 * Bank Account Master
 * Manages bank account entities for cash management
 */

export enum BankAccountType { 
  CHECKING = 'checking', 
  SAVINGS = 'savings', 
  MONEY_MARKET = 'money_market', 
  CREDIT_CARD = 'credit_card', 
  LINE_OF_CREDIT = 'line_of_credit' 
}

export enum BankAccountStatus { 
  ACTIVE = 'active', 
  INACTIVE = 'inactive', 
  CLOSED = 'closed' 
}

export interface BankAccount {
  id: string;
  companyId: string;
  name: string;
  bankName: string;
  accountNumberLast4: string;
  type: BankAccountType;
  status: BankAccountStatus;
  currencyCode: string;
  routingNumber?: string;
  swiftCode?: string;
  balance: number; // current book balance
  statementBalance?: number; // last reconciled balance from bank statement
  isPrimary: boolean; // primary disbursement account
  createdAt: Date;
  updatedAt: Date;
}

export interface BankAccountService {
  create(account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt' | 'balance' | 'statementBalance'>): Promise<BankAccount>;
  getById(id: string): Promise<BankAccount | null>;
  list(filters?: { status?: BankAccountStatus; type?: BankAccountType; }): Promise<BankAccount[]>;
  updateBalance(id: string, delta: number, description?: string): Promise<BankAccount>;
  setStatementBalance(id: string, balance: number, statementDate: Date): Promise<BankAccount>;
  close(id: string): Promise<void>;
}

/**
 * In-memory implementation of BankAccountService
 * In production, this would integrate with a database
 */
export class BankAccountServiceImpl implements BankAccountService {
  private accounts: Map<string, BankAccount> = new Map();
  private balanceHistory: Map<string, Array<{ date: Date; delta: number; description?: string }>> = new Map();

  async create(
    account: Omit<BankAccount, 'id' | 'createdAt' | 'updatedAt' | 'balance' | 'statementBalance'>
  ): Promise<BankAccount> {
    // Validate required fields
    if (!account.companyId) {
      throw new Error('Company ID is required');
    }
    if (!account.name) {
      throw new Error('Account name is required');
    }
    if (!account.bankName) {
      throw new Error('Bank name is required');
    }
    if (!account.accountNumberLast4 || account.accountNumberLast4.length !== 4) {
      throw new Error('Last 4 digits of account number are required');
    }
    if (!account.type) {
      throw new Error('Account type is required');
    }
    if (!account.currencyCode) {
      throw new Error('Currency code is required');
    }

    const now = new Date();
    const newAccount: BankAccount = {
      ...account,
      id: `ba_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      balance: 0,
      statementBalance: undefined,
      createdAt: now,
      updatedAt: now,
    };

    // Validate only one primary account per company
    if (account.isPrimary) {
      const existingPrimary = Array.from(this.accounts.values()).find(
        a => a.companyId === account.companyId && a.isPrimary && a.status === BankAccountStatus.ACTIVE
      );
      if (existingPrimary) {
        throw new Error(`Company ${account.companyId} already has a primary account: ${existingPrimary.name}`);
      }
    }

    this.accounts.set(newAccount.id, newAccount);
    this.balanceHistory.set(newAccount.id, []);
    return newAccount;
  }

  async getById(id: string): Promise<BankAccount | null> {
    return this.accounts.get(id) || null;
  }

  async list(filters?: { status?: BankAccountStatus; type?: BankAccountType }): Promise<BankAccount[]> {
    let results = Array.from(this.accounts.values());
    
    if (filters?.status) {
      results = results.filter(a => a.status === filters.status);
    }
    if (filters?.type) {
      results = results.filter(a => a.type === filters.type);
    }
    
    return results.sort((a, b) => a.name.localeCompare(b.name));
  }

  async updateBalance(id: string, delta: number, description?: string): Promise<BankAccount> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Bank account ${id} not found`);
    }
    if (account.status === BankAccountStatus.CLOSED) {
      throw new Error('Cannot update balance on a closed account');
    }

    account.balance += delta;
    account.updatedAt = new Date();

    // Record balance history
    const history = this.balanceHistory.get(id) || [];
    history.push({ date: new Date(), delta, description });
    this.balanceHistory.set(id, history);

    return account;
  }

  async setStatementBalance(id: string, balance: number, statementDate: Date): Promise<BankAccount> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Bank account ${id} not found`);
    }

    account.statementBalance = balance;
    account.updatedAt = new Date();
    return account;
  }

  async close(id: string): Promise<void> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Bank account ${id} not found`);
    }
    if (account.status === BankAccountStatus.CLOSED) {
      throw new Error('Account is already closed');
    }

    account.status = BankAccountStatus.CLOSED;
    account.isPrimary = false; // Cannot be primary if closed
    account.updatedAt = new Date();
  }

  /**
   * Get balance history for audit purposes
   */
  async getBalanceHistory(id: string): Promise<Array<{ date: Date; delta: number; description?: string }>> {
    return this.balanceHistory.get(id) || [];
  }

  /**
   * Get all accounts for a specific company
   */
  async getByCompany(companyId: string): Promise<BankAccount[]> {
    return Array.from(this.accounts.values()).filter(a => a.companyId === companyId);
  }

  /**
   * Get the primary disbursement account for a company
   */
  async getPrimaryAccount(companyId: string): Promise<BankAccount | null> {
    return Array.from(this.accounts.values()).find(
      a => a.companyId === companyId && a.isPrimary && a.status === BankAccountStatus.ACTIVE
    ) || null;
  }

  /**
   * Calculate total cash balance across all active accounts for a company
   */
  async getTotalBalance(companyId: string): Promise<number> {
    const accounts = await this.getByCompany(companyId);
    return accounts
      .filter(a => a.status === BankAccountStatus.ACTIVE)
      .reduce((sum, a) => sum + a.balance, 0);
  }

  /**
   * Get accounts with low balance (below threshold)
   */
  async getLowBalanceAccounts(companyId: string, threshold: number): Promise<BankAccount[]> {
    const accounts = await this.getByCompany(companyId);
    return accounts.filter(
      a => a.status === BankAccountStatus.ACTIVE && a.balance < threshold
    );
  }

  /**
   * Reactivate an inactive account
   */
  async reactivate(id: string): Promise<BankAccount> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Bank account ${id} not found`);
    }
    if (account.status === BankAccountStatus.ACTIVE) {
      throw new Error('Account is already active');
    }
    if (account.status === BankAccountStatus.CLOSED) {
      throw new Error('Cannot reactivate a closed account');
    }

    account.status = BankAccountStatus.ACTIVE;
    account.updatedAt = new Date();
    return account;
  }

  /**
   * Update account details (name, bank name, etc.)
   */
  async update(
    id: string, 
    updates: Partial<Pick<BankAccount, 'name' | 'bankName' | 'routingNumber' | 'swiftCode' | 'isPrimary'>>
  ): Promise<BankAccount> {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Bank account ${id} not found`);
    }
    if (account.status === BankAccountStatus.CLOSED) {
      throw new Error('Cannot update a closed account');
    }

    // If setting as primary, verify no other primary exists
    if (updates.isPrimary && !account.isPrimary) {
      const existingPrimary = Array.from(this.accounts.values()).find(
        a => a.companyId === account.companyId && a.isPrimary && a.status === BankAccountStatus.ACTIVE && a.id !== id
      );
      if (existingPrimary) {
        throw new Error(`Company ${account.companyId} already has a primary account: ${existingPrimary.name}`);
      }
    }

    Object.assign(account, updates, { updatedAt: new Date() });
    return account;
  }
}
