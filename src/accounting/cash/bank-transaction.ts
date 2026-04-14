/**
 * Bank Transaction Ingestion and Classification
 * Handles importing bank transactions and linking them to GL entries
 */

export enum BankTransactionType { 
  DEPOSIT = 'deposit', 
  WITHDRAWAL = 'withdrawal', 
  FEE = 'fee', 
  INTEREST = 'interest', 
  TRANSFER = 'transfer', 
  ADJUSTMENT = 'adjustment' 
}

export enum BankTransactionStatus { 
  PENDING = 'pending', 
  CLEARED = 'cleared', 
  RECONCILED = 'reconciled', 
  FLAGGED = 'flagged' 
}

export interface BankTransaction {
  id: string;
  bankAccountId: string;
  date: Date;
  postDate: Date;
  type: BankTransactionType;
  status: BankTransactionStatus;
  description: string;
  reference?: string;
  checkNumber?: string;
  amount: number; // positive for deposits, negative for withdrawals
  matchedGlEntryId?: string; // links to GL transaction if reconciled
  classifiedAccountId?: string; // if GL account has been suggested/assigned
  classifiedAccountCode?: string;
  isReconciled: boolean;
  reconciledDate?: Date;
  notes?: string;
  createdAt: Date;
}

export interface BankTransactionImport {
  date: Date;
  description: string;
  reference?: string;
  amount: number;
  type?: BankTransactionType;
  checkNumber?: string;
  notes?: string;
}

export interface BankTransactionFilter {
  bankAccountId?: string;
  status?: BankTransactionStatus;
  type?: BankTransactionType;
  fromDate?: Date;
  toDate?: Date;
  isReconciled?: boolean;
}

/**
 * Service for managing bank transactions
 * In production, this would integrate with bank feeds (e.g., Plaid, Yodlee)
 */
export class BankTransactionService {
  private storage = new Map<string, BankTransaction>();
  private idCounter = 0;

  private nextId(): string { 
    return `btx_${Date.now()}_${++this.idCounter}`; 
  }

  /**
   * Import a batch of transactions from a bank feed
   */
  async importTransactions(
    bankAccountId: string, 
    transactions: BankTransactionImport[]
  ): Promise<BankTransaction[]> {
    if (!bankAccountId) {
      throw new Error('Bank account ID is required');
    }
    if (!transactions || transactions.length === 0) {
      throw new Error('No transactions to import');
    }

    const imported: BankTransaction[] = [];

    for (const t of transactions) {
      // Validate transaction
      if (!t.date) {
        throw new Error('Transaction date is required');
      }
      if (!t.description) {
        throw new Error('Transaction description is required');
      }
      if (t.amount === undefined || t.amount === null) {
        throw new Error('Transaction amount is required');
      }

      const tx: BankTransaction = {
        id: this.nextId(),
        bankAccountId,
        date: t.date,
        postDate: t.date,
        type: t.type || (t.amount > 0 ? BankTransactionType.DEPOSIT : BankTransactionType.WITHDRAWAL),
        status: BankTransactionStatus.PENDING,
        description: t.description,
        reference: t.reference,
        checkNumber: t.checkNumber,
        amount: t.amount,
        isReconciled: false,
        notes: t.notes,
        createdAt: new Date(),
      };

      this.storage.set(tx.id, tx);
      imported.push(tx);
    }

    return imported;
  }

  /**
   * Get a transaction by ID
   */
  async getById(id: string): Promise<BankTransaction | null> {
    return this.storage.get(id) || null;
  }

  /**
   * Update a transaction
   */
  async update(id: string, updates: Partial<BankTransaction>): Promise<BankTransaction> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    
    Object.assign(tx, updates);
    return tx;
  }

  /**
   * Classify a transaction by assigning it to a GL account
   */
  async classifyTransaction(
    id: string, 
    accountCode: string, 
    accountId: string
  ): Promise<BankTransaction> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    
    tx.classifiedAccountCode = accountCode;
    tx.classifiedAccountId = accountId;
    return tx;
  }

  /**
   * Mark a transaction as cleared (appears on bank statement)
   */
  async markCleared(id: string): Promise<BankTransaction> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    tx.status = BankTransactionStatus.CLEARED;
    return tx;
  }

  /**
   * Mark a transaction as reconciled (matched to GL entry)
   */
  async markReconciled(
    id: string, 
    glEntryId: string, 
    glAccountId: string, 
    glAccountCode: string
  ): Promise<BankTransaction> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    
    tx.status = BankTransactionStatus.RECONCILED;
    tx.isReconciled = true;
    tx.reconciledDate = new Date();
    tx.matchedGlEntryId = glEntryId;
    tx.classifiedAccountId = glAccountId;
    tx.classifiedAccountCode = glAccountCode;
    return tx;
  }

  /**
   * Flag a transaction for review
   */
  async flagTransaction(id: string, reason?: string): Promise<BankTransaction> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    
    tx.status = BankTransactionStatus.FLAGGED;
    tx.notes = tx.notes 
      ? `${tx.notes}\n[FLAGGED] ${reason || 'No reason provided'}`
      : `[FLAGGED] ${reason || 'No reason provided'}`;
    return tx;
  }

  /**
   * List transactions by bank account with optional date filtering
   */
  async listByBankAccount(
    bankAccountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<BankTransaction[]> {
    let txs = Array.from(this.storage.values())
      .filter(t => t.bankAccountId === bankAccountId);
    
    if (fromDate) {
      txs = txs.filter(t => t.date >= fromDate);
    }
    if (toDate) {
      txs = txs.filter(t => t.date <= toDate);
    }
    
    return txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * List transactions with filters
   */
  async list(filter: BankTransactionFilter): Promise<BankTransaction[]> {
    let txs = Array.from(this.storage.values());
    
    if (filter.bankAccountId) {
      txs = txs.filter(t => t.bankAccountId === filter.bankAccountId);
    }
    if (filter.status) {
      txs = txs.filter(t => t.status === filter.status);
    }
    if (filter.type) {
      txs = txs.filter(t => t.type === filter.type);
    }
    const fromDate = filter.fromDate;
    const toDate = filter.toDate;
    if (fromDate) {
      txs = txs.filter(t => t.date >= fromDate);
    }
    if (toDate) {
      txs = txs.filter(t => t.date <= toDate);
    }
    if (filter.isReconciled !== undefined) {
      txs = txs.filter(t => t.isReconciled === filter.isReconciled);
    }
    
    return txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Get all unreconciled transactions for a bank account
   */
  async getUnreconciled(bankAccountId: string): Promise<BankTransaction[]> {
    return Array.from(this.storage.values())
      .filter(t => t.bankAccountId === bankAccountId && !t.isReconciled);
  }

  /**
   * Get all pending (not yet cleared) transactions
   */
  async getPending(bankAccountId: string): Promise<BankTransaction[]> {
    return Array.from(this.storage.values())
      .filter(t => t.bankAccountId === bankAccountId && t.status === BankTransactionStatus.PENDING);
  }

  /**
   * Get cleared but not yet reconciled transactions
   */
  async getClearedNotReconciled(bankAccountId: string): Promise<BankTransaction[]> {
    return Array.from(this.storage.values())
      .filter(t => 
        t.bankAccountId === bankAccountId && 
        t.status === BankTransactionStatus.CLEARED && 
        !t.isReconciled
      );
  }

  /**
   * Get flagged transactions for review
   */
  async getFlagged(bankAccountId?: string): Promise<BankTransaction[]> {
    let txs = Array.from(this.storage.values())
      .filter(t => t.status === BankTransactionStatus.FLAGGED);
    
    if (bankAccountId) {
      txs = txs.filter(t => t.bankAccountId === bankAccountId);
    }
    
    return txs.sort((a, b) => b.date.getTime() - a.date.getTime());
  }

  /**
   * Match a bank transaction to a GL entry
   */
  async matchToGlEntry(
    bankTransactionId: string, 
    glEntryId: string, 
    glAccountId: string, 
    glAccountCode: string
  ): Promise<BankTransaction> {
    const tx = await this.getById(bankTransactionId);
    if (!tx) {
      throw new Error(`Bank transaction ${bankTransactionId} not found`);
    }

    tx.matchedGlEntryId = glEntryId;
    tx.classifiedAccountId = glAccountId;
    tx.classifiedAccountCode = glAccountCode;
    
    return tx;
  }

  /**
   * Unmatch a bank transaction from a GL entry
   */
  async unmatchFromGlEntry(bankTransactionId: string): Promise<BankTransaction> {
    const tx = await this.getById(bankTransactionId);
    if (!tx) {
      throw new Error(`Bank transaction ${bankTransactionId} not found`);
    }

    tx.matchedGlEntryId = undefined;
    tx.classifiedAccountId = undefined;
    tx.classifiedAccountCode = undefined;
    tx.status = BankTransactionStatus.CLEARED;
    
    return tx;
  }

  /**
   * Calculate totals by type for a bank account in a date range
   */
  async getTotalsByType(
    bankAccountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<Record<BankTransactionType, { count: number; total: number }>> {
    const txs = await this.listByBankAccount(bankAccountId, fromDate, toDate);
    
    const totals: Record<BankTransactionType, { count: number; total: number }> = {
      [BankTransactionType.DEPOSIT]: { count: 0, total: 0 },
      [BankTransactionType.WITHDRAWAL]: { count: 0, total: 0 },
      [BankTransactionType.FEE]: { count: 0, total: 0 },
      [BankTransactionType.INTEREST]: { count: 0, total: 0 },
      [BankTransactionType.TRANSFER]: { count: 0, total: 0 },
      [BankTransactionType.ADJUSTMENT]: { count: 0, total: 0 },
    };

    for (const tx of txs) {
      totals[tx.type].count++;
      totals[tx.type].total += tx.amount;
    }

    return totals;
  }

  /**
   * Get net flow (deposits - withdrawals) for a period
   */
  async getNetFlow(
    bankAccountId: string, 
    fromDate?: Date, 
    toDate?: Date
  ): Promise<number> {
    const txs = await this.listByBankAccount(bankAccountId, fromDate, toDate);
    return txs.reduce((sum, tx) => sum + tx.amount, 0);
  }

  /**
   * Delete a transaction (only allowed if not reconciled)
   */
  async delete(id: string): Promise<void> {
    const tx = this.storage.get(id);
    if (!tx) {
      throw new Error(`Bank transaction ${id} not found`);
    }
    if (tx.isReconciled) {
      throw new Error('Cannot delete a reconciled transaction');
    }
    this.storage.delete(id);
  }

  /**
   * Bulk update transaction status
   */
  async bulkUpdateStatus(ids: string[], status: BankTransactionStatus): Promise<BankTransaction[]> {
    const updated: BankTransaction[] = [];
    for (const id of ids) {
      const tx = this.storage.get(id);
      if (tx) {
        tx.status = status;
        updated.push(tx);
      }
    }
    return updated;
  }
}
