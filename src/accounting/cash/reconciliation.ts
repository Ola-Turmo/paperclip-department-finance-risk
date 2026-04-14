/**
 * Bank Reconciliation Engine
 * Matches bank transactions to GL cash entries and identifies variances
 */

export enum ReconciliationStatus { 
  IN_PROGRESS = 'in_progress', 
  COMPLETED = 'completed' 
}

export interface ReconciliationItem {
  bankTxId?: string;
  glTxId?: string;
  date: Date;
  description: string;
  bankAmount: number;
  bookAmount: number;
  variance: number; // bankAmount - bookAmount
  status: 'cleared' | 'book_side_only' | 'bank_side_only' | 'matched';
  clearedDate?: Date;
}

export interface Reconciliation {
  id: string;
  bankAccountId: string;
  statementDate: Date;
  statementBalance: number;
  bookBalance: number; // from GL bank account
  clearedBankTotal: number;
  clearedBookTotal: number;
  items: ReconciliationItem[];
  status: ReconciliationStatus;
  completedAt?: Date;
  completedBy?: string;
  createdAt: Date;
}

export interface ReconciliationResult {
  clearedCount: number;
  bookSideOnlyCount: number;
  bankSideOnlyCount: number;
  clearedAmount: number;
  bookSideAmount: number;
  bankSideAmount: number;
  isBalanced: boolean;
  remainingVariance: number;
}

export interface ReconciliationParams {
  bankAccountId: string;
  statementBalance: number;
  statementDate: Date;
  bookBalance: number;
  bankTransactions: Array<{
    id: string;
    date: Date;
    description: string;
    amount: number;
  }>;
  glCashEntries: Array<{
    id: string;
    date: Date;
    description: string;
    amount: number;
  }>;
}

export class ReconciliationEngine {
  private reconciliations: Map<string, Reconciliation> = new Map();

  /**
   * Main reconciliation function
   * Matches cleared bank transactions to GL cash entries
   */
  async reconcile(params: ReconciliationParams): Promise<Reconciliation> {
    const items: ReconciliationItem[] = [];
    const matchedBankTx = new Set<string>();
    const matchedGlTx = new Set<string>();

    // Step 1: Match bank transactions to GL entries (exact amount + date)
    for (const bankTx of params.bankTransactions) {
      const matched = params.glCashEntries.find(glTx =>
        Math.abs(Math.abs(glTx.amount) - Math.abs(bankTx.amount)) < 0.01 &&
        this.sameDay(glTx.date, bankTx.date) &&
        !matchedGlTx.has(glTx.id)
      );
      
      if (matched) {
        items.push({
          bankTxId: bankTx.id,
          glTxId: matched.id,
          date: bankTx.date,
          description: bankTx.description,
          bankAmount: bankTx.amount,
          bookAmount: matched.amount,
          variance: 0,
          status: 'matched',
          clearedDate: bankTx.date,
        });
        matchedBankTx.add(bankTx.id);
        matchedGlTx.add(matched.id);
      } else {
        items.push({
          bankTxId: bankTx.id,
          date: bankTx.date,
          description: bankTx.description,
          bankAmount: bankTx.amount,
          bookAmount: 0,
          variance: bankTx.amount,
          status: 'bank_side_only',
        });
      }
    }

    // Step 2: GL entries not matched (book-side only)
    for (const glTx of params.glCashEntries) {
      if (!matchedGlTx.has(glTx.id)) {
        items.push({
          glTxId: glTx.id,
          date: glTx.date,
          description: glTx.description,
          bankAmount: 0,
          bookAmount: glTx.amount,
          variance: -glTx.amount,
          status: 'book_side_only',
        });
      }
    }

    // Step 3: Compute result statistics
    const clearedItems = items.filter(i => i.status === 'matched');
    const bankSideOnly = items.filter(i => i.status === 'bank_side_only');
    const bookSideOnly = items.filter(i => i.status === 'book_side_only');

    const result: ReconciliationResult = {
      clearedCount: clearedItems.length,
      bookSideOnlyCount: bookSideOnly.length,
      bankSideOnlyCount: bankSideOnly.length,
      clearedAmount: clearedItems.reduce((s, i) => s + i.bankAmount, 0),
      bookSideAmount: bookSideOnly.reduce((s, i) => s + i.bookAmount, 0),
      bankSideAmount: bankSideOnly.reduce((s, i) => s + i.bankAmount, 0),
      isBalanced: Math.abs(
        (params.statementBalance - clearedItems.reduce((s, i) => s + i.bankAmount, 0)) -
        (params.bookBalance - clearedItems.reduce((s, i) => s + i.bookAmount, 0))
      ) < 0.01,
      remainingVariance: bankSideOnly.reduce((s, i) => s + i.variance, 0) - bookSideOnly.reduce((s, i) => s + i.variance, 0),
    };

    // Build reconciliation record
    const reconciliation: Reconciliation = {
      id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`,
      bankAccountId: params.bankAccountId,
      statementDate: params.statementDate,
      statementBalance: params.statementBalance,
      bookBalance: params.bookBalance,
      clearedBankTotal: clearedItems.reduce((s, i) => s + i.bankAmount, 0),
      clearedBookTotal: clearedItems.reduce((s, i) => s + i.bookAmount, 0),
      items,
      status: ReconciliationStatus.COMPLETED,
      completedAt: new Date(),
      createdAt: new Date(),
    };

    this.reconciliations.set(reconciliation.id, reconciliation);
    return reconciliation;
  }

  /**
   * Compare two dates (same day if same YYYY-MM-DD)
   */
  private sameDay(a: Date, b: Date): boolean {
    return a.toISOString().slice(0, 10) === b.toISOString().slice(0, 10);
  }

  /**
   * Generate a human-readable reconciliation report
   */
  generateReconciliationReport(reconciliation: Reconciliation): string {
    const lines: string[] = [];
    
    lines.push('═'.repeat(60));
    lines.push('BANK RECONCILIATION');
    lines.push(`Statement Date: ${reconciliation.statementDate.toISOString().slice(0, 10)}`);
    lines.push(`Bank Account ID: ${reconciliation.bankAccountId}`);
    lines.push('═'.repeat(60));
    lines.push('');
    lines.push('SUMMARY:');
    lines.push(`  Bank Balance (Statement):   $${reconciliation.statementBalance.toFixed(2)}`);
    lines.push(`  Book Balance (GL):          $${reconciliation.bookBalance.toFixed(2)}`);
    lines.push(`  Difference:                  $${(reconciliation.statementBalance - reconciliation.bookBalance).toFixed(2)}`);
    lines.push('');
    
    const clearedItems = reconciliation.items.filter(i => i.status === 'matched');
    const bankSideOnly = reconciliation.items.filter(i => i.status === 'bank_side_only');
    const bookSideOnly = reconciliation.items.filter(i => i.status === 'book_side_only');
    
    lines.push(`Items Matched:    ${clearedItems.length} ($${clearedItems.reduce((s, i) => s + i.bankAmount, 0).toFixed(2)})`);
    lines.push(`Bank Side Only:   ${bankSideOnly.length} ($${bankSideOnly.reduce((s, i) => s + i.bankAmount, 0).toFixed(2)})`);
    lines.push(`Book Side Only:   ${bookSideOnly.length} ($${bookSideOnly.reduce((s, i) => s + i.bookAmount, 0).toFixed(2)})`);
    lines.push('');
    
    lines.push('─'.repeat(60));
    lines.push('MATCHED ITEMS (Cleared):');
    lines.push('─'.repeat(60));
    if (clearedItems.length === 0) {
      lines.push('  (No matched items)');
    } else {
      for (const item of clearedItems) {
        lines.push(`  ${item.date.toISOString().slice(0,10)}  ${item.description.substring(0, 35).padEnd(36)} $${item.bankAmount.toFixed(2)}`);
      }
    }
    lines.push('');
    
    lines.push('─'.repeat(60));
    lines.push('BANK SIDE ONLY (In bank, not in books):');
    lines.push('─'.repeat(60));
    if (bankSideOnly.length === 0) {
      lines.push('  (No bank-side only items)');
    } else {
      for (const item of bankSideOnly) {
        lines.push(`  ${item.date.toISOString().slice(0,10)}  ${item.description.substring(0, 35).padEnd(36)} $${item.bankAmount.toFixed(2)} [VARIANCE: $${item.variance.toFixed(2)}]`);
      }
    }
    lines.push('');
    
    lines.push('─'.repeat(60));
    lines.push('BOOK SIDE ONLY (In books, not on bank):');
    lines.push('─'.repeat(60));
    if (bookSideOnly.length === 0) {
      lines.push('  (No book-side only items)');
    } else {
      for (const item of bookSideOnly) {
        lines.push(`  ${item.date.toISOString().slice(0,10)}  ${item.description.substring(0, 35).padEnd(36)} $${item.bookAmount.toFixed(2)} [VARIANCE: $${item.variance.toFixed(2)}]`);
      }
    }
    lines.push('');
    lines.push('═'.repeat(60));
    
    return lines.join('\n');
  }

  /**
   * Generate a detailed variance analysis report
   */
  generateVarianceReport(reconciliation: Reconciliation): string {
    const lines: string[] = [];
    
    lines.push('CASH RECONCILIATION VARIANCE ANALYSIS');
    lines.push(`Report Date: ${new Date().toISOString().slice(0, 10)}`);
    lines.push('');
    
    const bankSideOnly = reconciliation.items.filter(i => i.status === 'bank_side_only');
    const bookSideOnly = reconciliation.items.filter(i => i.status === 'book_side_only');
    
    // Total variances
    const totalBankVariance = bankSideOnly.reduce((s, i) => s + i.variance, 0);
    const totalBookVariance = bookSideOnly.reduce((s, i) => s + i.variance, 0);
    
    lines.push('VARIANCE SUMMARY:');
    lines.push(`  Total Bank-Side Variance:   $${totalBankVariance.toFixed(2)}`);
    lines.push(`  Total Book-Side Variance:   $${totalBookVariance.toFixed(2)}`);
    lines.push(`  Net Variance:               $${(totalBankVariance - totalBookVariance).toFixed(2)}`);
    lines.push('');
    
    // Potential causes of variance
    lines.push('POTENTIAL VARIANCE CAUSES:');
    lines.push('');
    lines.push('  Bank Side Only (unexplained bank transactions):');
    lines.push('    - Deposits in transit (sent but not yet received by bank)');
    lines.push('    - Bank errors (bank recorded incorrectly)');
    lines.push('    - Unauthorized transactions');
    lines.push('    - Timing differences in check clearing');
    lines.push('');
    lines.push('  Book Side Only (unexplained book entries):');
    lines.push('    - Outstanding checks (issued but not yet presented)');
    lines.push('    - Book errors (incorrectly recorded)');
    lines.push('    - Unrecorded bank fees or interest');
    lines.push('    - Timing differences in recording');
    lines.push('');
    
    // Action items
    lines.push('REQUIRED ACTIONS:');
    if (bankSideOnly.length > 0) {
      lines.push(`  1. Investigate ${bankSideOnly.length} bank-side only item(s)`);
    }
    if (bookSideOnly.length > 0) {
      lines.push(`  2. Investigate ${bookSideOnly.length} book-side only item(s)`);
    }
    if (bankSideOnly.length === 0 && bookSideOnly.length === 0) {
      lines.push('  1. All items reconciled - no action required');
    }
    
    return lines.join('\n');
  }

  /**
   * Get reconciliation by ID
   */
  async getReconciliation(id: string): Promise<Reconciliation | null> {
    return this.reconciliations.get(id) || null;
  }

  /**
   * Get all reconciliations for a bank account
   */
  async getReconciliationsByAccount(bankAccountId: string): Promise<Reconciliation[]> {
    return Array.from(this.reconciliations.values())
      .filter(r => r.bankAccountId === bankAccountId)
      .sort((a, b) => b.statementDate.getTime() - a.statementDate.getTime());
  }

  /**
   * Get the most recent reconciliation for a bank account
   */
  async getLatestReconciliation(bankAccountId: string): Promise<Reconciliation | null> {
    const reconciliations = await this.getReconciliationsByAccount(bankAccountId);
    return reconciliations[0] || null;
  }

  /**
   * Calculate adjusted bank balance (for reconciliation)
   * Formula: Statement Balance - Outstanding Checks + Deposits in Transit
   */
  calculateAdjustedBankBalance(
    statementBalance: number,
    outstandingChecks: number,
    depositsInTransit: number
  ): number {
    return statementBalance - outstandingChecks + depositsInTransit;
  }

  /**
   * Calculate adjusted book balance (for reconciliation)
   * Formula: Book Balance - Unrecorded Credits + Unrecorded Debits
   */
  calculateAdjustedBookBalance(
    bookBalance: number,
    unrecordedCredits: number,
    unrecordedDebits: number
  ): number {
    return bookBalance - unrecordedCredits + unrecordedDebits;
  }

  /**
   * Identify items that may be matching (fuzzy match on amount with date tolerance)
   */
  findPotentialMatches(
    bankTransactions: Array<{ id: string; date: Date; amount: number; description: string }>,
    glEntries: Array<{ id: string; date: Date; amount: number; description: string }>,
    dateToleranceDays: number = 3,
    amountTolerance: number = 0.01
  ): Array<{ bankTxId: string; glTxId: string; confidence: number }> {
    const matches: Array<{ bankTxId: string; glTxId: string; confidence: number }> = [];

    for (const bankTx of bankTransactions) {
      for (const glTx of glEntries) {
        // Check if amounts match within tolerance
        const amountMatch = Math.abs(Math.abs(bankTx.amount) - Math.abs(glTx.amount)) < amountTolerance;
        
        // Check if dates are within tolerance
        const daysDiff = Math.abs(
          (bankTx.date.getTime() - glTx.date.getTime()) / (1000 * 60 * 60 * 24)
        );
        const dateMatch = daysDiff <= dateToleranceDays;

        if (amountMatch && dateMatch) {
          // Calculate confidence based on how close the match is
          const amountConfidence = 1 - (Math.abs(Math.abs(bankTx.amount) - Math.abs(glTx.amount)) / Math.abs(bankTx.amount || 1));
          const dateConfidence = 1 - (daysDiff / dateToleranceDays);
          const confidence = (amountConfidence * 0.7) + (dateConfidence * 0.3);

          matches.push({
            bankTxId: bankTx.id,
            glTxId: glTx.id,
            confidence,
          });
        }
      }
    }

    // Sort by confidence and remove duplicates (keep highest confidence match)
    matches.sort((a, b) => b.confidence - a.confidence);
    const uniqueMatches: Array<{ bankTxId: string; glTxId: string; confidence: number }> = [];
    const usedBankTx = new Set<string>();
    const usedGlTx = new Set<string>();

    for (const match of matches) {
      if (!usedBankTx.has(match.bankTxId) && !usedGlTx.has(match.glTxId)) {
        uniqueMatches.push(match);
        usedBankTx.add(match.bankTxId);
        usedGlTx.add(match.glTxId);
      }
    }

    return uniqueMatches;
  }

  /**
   * Mark items as cleared in a reconciliation
   */
  async markItemCleared(
    reconciliationId: string,
    itemIndex: number,
    clearedDate: Date
  ): Promise<ReconciliationItem> {
    const reconciliation = this.reconciliations.get(reconciliationId);
    if (!reconciliation) {
      throw new Error(`Reconciliation ${reconciliationId} not found`);
    }
    if (itemIndex < 0 || itemIndex >= reconciliation.items.length) {
      throw new Error(`Invalid item index: ${itemIndex}`);
    }

    const item = reconciliation.items[itemIndex];
    item.status = 'cleared';
    item.clearedDate = clearedDate;
    
    return item;
  }

  /**
   * Add a manual adjustment to reconciliation
   */
  async addAdjustment(
    reconciliationId: string,
    adjustment: {
      description: string;
      amount: number;
      type: 'bank_adjustment' | 'book_adjustment';
    }
  ): Promise<Reconciliation> {
    const reconciliation = this.reconciliations.get(reconciliationId);
    if (!reconciliation) {
      throw new Error(`Reconciliation ${reconciliationId} not found`);
    }

    const newItem: ReconciliationItem = {
      date: new Date(),
      description: `[ADJUSTMENT] ${adjustment.description}`,
      bankAmount: adjustment.type === 'bank_adjustment' ? adjustment.amount : 0,
      bookAmount: adjustment.type === 'book_adjustment' ? adjustment.amount : 0,
      variance: adjustment.type === 'bank_adjustment' 
        ? adjustment.amount 
        : -adjustment.amount,
      status: adjustment.type === 'bank_adjustment' ? 'bank_side_only' : 'book_side_only',
    };

    reconciliation.items.push(newItem);
    return reconciliation;
  }
}
