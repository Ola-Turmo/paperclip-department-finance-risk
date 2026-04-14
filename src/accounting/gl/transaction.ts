/**
 * Financial Transaction Records
 */

export type TransactionType = 'deposit' | 'withdrawal' | 'journal' | 'transfer';

export interface Transaction {
  id: string;
  companyId: string;
  type: TransactionType;
  description: string;
  reference?: string;
  amount: number;
  currencyCode: string;
  postedAt: Date;
  periodId: string;
  isPosted: boolean;
  journalEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class TransactionService {
  private transactions: Map<string, Transaction> = new Map();

  createTransaction(data: Omit<Transaction, 'id' | 'createdAt' | 'updatedAt'>): Transaction {
    const now = new Date();
    const transaction: Transaction = {
      ...data,
      id: crypto.randomUUID(),
      createdAt: now,
      updatedAt: now,
    };

    this.transactions.set(transaction.id, transaction);
    return transaction;
  }

  getTransaction(id: string): Transaction | undefined {
    return this.transactions.get(id);
  }

  getTransactionsByPeriod(periodId: string): Transaction[] {
    return Array.from(this.transactions.values()).filter(t => t.periodId === periodId);
  }

  getTransactionsByAccount(accountId: string): Transaction[] {
    // For transactions by account, we would need to join with journal entries
    // This is a simplified implementation
    return Array.from(this.transactions.values()).filter(
      t => t.isPosted && t.type === 'journal' && t.journalEntryId
    );
  }

  postTransaction(id: string): Transaction {
    const transaction = this.transactions.get(id);
    if (!transaction) {
      throw new Error(`Transaction ${id} does not exist`);
    }

    if (transaction.isPosted) {
      throw new Error('Transaction is already posted');
    }

    transaction.isPosted = true;
    transaction.postedAt = new Date();
    transaction.updatedAt = new Date();

    return transaction;
  }

  /**
   * Link a journal entry to a transaction
   */
  linkJournalEntry(transactionId: string, journalEntryId: string): Transaction {
    const transaction = this.transactions.get(transactionId);
    if (!transaction) {
      throw new Error(`Transaction ${transactionId} does not exist`);
    }

    transaction.journalEntryId = journalEntryId;
    transaction.updatedAt = new Date();

    return transaction;
  }

  /**
   * Get all posted transactions for a company
   */
  getPostedTransactionsByCompany(companyId: string): Transaction[] {
    return Array.from(this.transactions.values()).filter(
      t => t.companyId === companyId && t.isPosted
    );
  }
}