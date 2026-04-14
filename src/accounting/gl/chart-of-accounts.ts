/**
 * Chart of Accounts - GL account management
 */

// Core types and interfaces
export type AccountCategory = 'asset' | 'liability' | 'capital' | 'income' | 'expense';
export type NormalBalance = 'debit' | 'credit';

export interface Account {
  id: string;
  companyId: string;
  category: AccountCategory;
  type: string;  // e.g., 'cash', 'accounts_receivable', 'sales'
  code: string;  // e.g., '1100', '2000', '4000'
  name: string;
  currencyCode: string;
  parentId?: string;
  isArchived: boolean;
  isDefault: boolean;
  normalBalance: NormalBalance;
  description?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface AccountTree {
  account: Account;
  children: AccountTree[];
}

export class ChartOfAccountsService {
  private accounts: Map<string, Account> = new Map();
  private codeIndex: Map<string, string> = new Map(); // code -> id

  /**
   * Derive normal balance from category
   * Assets and Expenses have debit normal balance
   * Liabilities, Capital, and Income have credit normal balance
   */
  private deriveNormalBalance(category: AccountCategory): NormalBalance {
    if (category === 'asset' || category === 'expense') {
      return 'debit';
    }
    return 'credit';
  }

  createAccount(data: Omit<Account, 'id' | 'createdAt' | 'updatedAt'>): Account {
    // Validate account code uniqueness
    if (this.codeIndex.has(data.code)) {
      throw new Error(`Account code ${data.code} already exists`);
    }

    // Validate parent exists if parentId is provided
    if (data.parentId && !this.accounts.has(data.parentId)) {
      throw new Error(`Parent account ${data.parentId} does not exist`);
    }

    const now = new Date();
    const account: Account = {
      ...data,
      id: crypto.randomUUID(),
      normalBalance: data.normalBalance || this.deriveNormalBalance(data.category),
      createdAt: now,
      updatedAt: now,
    };

    this.accounts.set(account.id, account);
    this.codeIndex.set(account.code, account.id);
    return account;
  }

  getAccount(id: string): Account | undefined {
    return this.accounts.get(id);
  }

  getAccountByCode(code: string): Account | undefined {
    const id = this.codeIndex.get(code);
    return id ? this.accounts.get(id) : undefined;
  }

  updateAccount(id: string, data: Partial<Account>): Account {
    const existing = this.accounts.get(id);
    if (!existing) {
      throw new Error(`Account ${id} does not exist`);
    }

    // If changing code, validate uniqueness
    if (data.code && data.code !== existing.code) {
      if (this.codeIndex.has(data.code)) {
        throw new Error(`Account code ${data.code} already exists`);
      }
      // Remove old code index
      this.codeIndex.delete(existing.code);
      this.codeIndex.set(data.code, id);
    }

    // If changing parentId, validate parent exists
    if (data.parentId !== undefined && data.parentId !== existing.parentId) {
      if (data.parentId && !this.accounts.has(data.parentId)) {
        throw new Error(`Parent account ${data.parentId} does not exist`);
      }
      // Prevent circular reference
      if (data.parentId === id) {
        throw new Error(`Account cannot be its own parent`);
      }
    }

    const updated: Account = {
      ...existing,
      ...data,
      id, // prevent id override
      updatedAt: new Date(),
    };

    this.accounts.set(id, updated);
    return updated;
  }

  archiveAccount(id: string): void {
    const account = this.accounts.get(id);
    if (!account) {
      throw new Error(`Account ${id} does not exist`);
    }
    account.isArchived = true;
    account.updatedAt = new Date();
  }

  getAccountsByCategory(category: AccountCategory): Account[] {
    return Array.from(this.accounts.values()).filter(
      a => a.category === category && !a.isArchived
    );
  }

  getAccountsByType(type: string): Account[] {
    return Array.from(this.accounts.values()).filter(
      a => a.type === type && !a.isArchived
    );
  }

  buildAccountTree(): AccountTree[] {
    const accounts = Array.from(this.accounts.values()).filter(a => !a.isArchived);
    const accountMap = new Map(accounts.map(a => [a.id, a]));
    const childrenMap = new Map<string | undefined, Account[]>();

    // Group accounts by parentId
    for (const account of accounts) {
      const parentId = account.parentId;
      if (!childrenMap.has(parentId)) {
        childrenMap.set(parentId, []);
      }
      childrenMap.get(parentId)!.push(account);
    }

    // Sort children by account code
    const childArrays = Array.from(childrenMap.values());
    for (const children of childArrays) {
      children.sort((a, b) => a.code.localeCompare(b.code));
    }

    // Build tree recursively
    const buildNode = (account: Account): AccountTree => {
      const children = childrenMap.get(account.id) || [];
      return {
        account,
        children: children.map(child => buildNode(child)),
      };
    };

    // Top-level accounts have parentId = undefined
    const topLevel = childrenMap.get(undefined) || [];
    return topLevel.map(account => buildNode(account));
  }

  getNextAccountCode(category: AccountCategory): string {
    // Get all accounts of this category
    const categoryAccounts = this.getAccountsByCategory(category);
    
    // Base code for each category
    const baseCodes: Record<AccountCategory, number> = {
      asset: 1100,
      liability: 2000,
      capital: 3000,
      income: 4000,
      expense: 5000,
    };

    const base = baseCodes[category];
    
    if (categoryAccounts.length === 0) {
      return String(base);
    }

    // Find the highest existing code in this category
    let maxCode = base;
    for (const account of categoryAccounts) {
      const codeNum = parseInt(account.code, 10);
      if (!isNaN(codeNum) && codeNum >= base && codeNum < base + 10000) {
        if (codeNum > maxCode) {
          maxCode = codeNum;
        }
      }
    }

    // Next code increments by 10
    return String(maxCode + 10);
  }

  /**
   * Get all accounts for a company
   */
  getAccountsByCompany(companyId: string): Account[] {
    return Array.from(this.accounts.values()).filter(
      a => a.companyId === companyId && !a.isArchived
    );
  }

  /**
   * Get account balances at period end (for trial balance)
   */
  getAllAccounts(): Account[] {
    return Array.from(this.accounts.values()).filter(a => !a.isArchived);
  }
}