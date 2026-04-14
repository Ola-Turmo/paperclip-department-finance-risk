/**
 * Journal Entry - Double-entry bookkeeping with validation
 */

export interface JournalEntryLine {
  id: string;
  journalEntryId: string;
  accountId: string;
  type: 'debit' | 'credit';
  amount: number;  // always positive
  description?: string;
}

export interface JournalEntry {
  id: string;
  companyId: string;
  transactionId: string;
  periodId: string;
  description: string;
  reference?: string;
  lines: JournalEntryLine[];
  status: 'draft' | 'posted' | 'reversed';
  reversedEntryId?: string;
  createdAt: Date;
  updatedAt: Date;
  postedAt?: Date;
}

export class JournalEntryService {
  private entries: Map<string, JournalEntry> = new Map();
  private chartOfAccounts: import('./chart-of-accounts.js').ChartOfAccountsService;
  private periodService: import('./period-close.js').PeriodCloseService;

  constructor(
    chartOfAccounts: import('./chart-of-accounts.js').ChartOfAccountsService,
    periodService: import('./period-close.js').PeriodCloseService
  ) {
    this.chartOfAccounts = chartOfAccounts;
    this.periodService = periodService;
  }

  /**
   * Validate double-entry: debits must equal credits (within tolerance)
   */
  validateDoubleEntry(lines: JournalEntryLine[]): {
    valid: boolean;
    debitTotal: number;
    creditTotal: number;
    difference: number;
  } {
    let debitTotal = 0;
    let creditTotal = 0;

    for (const line of lines) {
      if (line.type === 'debit') {
        debitTotal += line.amount;
      } else {
        creditTotal += line.amount;
      }
    }

    const difference = Math.abs(debitTotal - creditTotal);
    const valid = difference < 0.001;

    return { valid, debitTotal, creditTotal, difference };
  }

  createEntry(data: {
    companyId: string;
    periodId: string;
    description: string;
    reference?: string;
    lines: Omit<JournalEntryLine, 'id' | 'journalEntryId'>[];
  }): JournalEntry {
    // Validate at least 2 lines
    if (data.lines.length < 2) {
      throw new Error('Journal entry must have at least 2 lines');
    }

    // Validate all amounts are positive
    for (const line of data.lines) {
      if (line.amount <= 0) {
        throw new Error('All line amounts must be positive');
      }
    }

    // Validate all accountIds exist
    for (const line of data.lines) {
      const account = this.chartOfAccounts.getAccount(line.accountId);
      if (!account) {
        throw new Error(`Account ${line.accountId} does not exist`);
      }
    }

    // Validate double-entry
    const validation = this.validateDoubleEntry(data.lines as JournalEntryLine[]);
    if (!validation.valid) {
      throw new Error(
        `Double-entry validation failed: debits (${validation.debitTotal}) != credits (${validation.creditTotal}), difference = ${validation.difference}`
      );
    }

    const entryId = crypto.randomUUID();
    const now = new Date();

    const lines: JournalEntryLine[] = data.lines.map(line => ({
      ...line,
      id: crypto.randomUUID(),
      journalEntryId: entryId,
    }));

    const entry: JournalEntry = {
      id: entryId,
      companyId: data.companyId,
      transactionId: crypto.randomUUID(), // Generate a transaction ID
      periodId: data.periodId,
      description: data.description,
      reference: data.reference,
      lines,
      status: 'draft',
      createdAt: now,
      updatedAt: now,
    };

    this.entries.set(entryId, entry);
    return entry;
  }

  postEntry(entryId: string): JournalEntry {
    const entry = this.entries.get(entryId);
    if (!entry) {
      throw new Error(`Journal entry ${entryId} does not exist`);
    }

    if (entry.status === 'posted') {
      throw new Error('Journal entry is already posted');
    }

    if (entry.status === 'reversed') {
      throw new Error('Cannot post a reversed entry');
    }

    // Check period is open
    const period = this.periodService.getPeriod(entry.periodId);
    if (!period) {
      throw new Error(`Period ${entry.periodId} does not exist`);
    }
    if (period.status === 'closed') {
      throw new Error('Cannot post to a closed period');
    }

    entry.status = 'posted';
    entry.postedAt = new Date();
    entry.updatedAt = new Date();

    return entry;
  }

  reverseEntry(entryId: string): JournalEntry {
    const original = this.entries.get(entryId);
    if (!original) {
      throw new Error(`Journal entry ${entryId} does not exist`);
    }

    if (original.status !== 'posted') {
      throw new Error(`Can only reverse posted entries (current status: ${original.status})`);
    }

    if ((original.status as string) === 'reversed') {
      throw new Error('Entry is already reversed');
    }

    // Create reversing entry with opposite debits/credits
    const reversingLines: Omit<JournalEntryLine, 'id' | 'journalEntryId'>[] = original.lines.map(line => ({
      accountId: line.accountId,
      type: line.type === 'debit' ? 'credit' : 'debit',
      amount: line.amount,
      description: line.description,
    }));

    const reversed = this.createEntry({
      companyId: original.companyId,
      periodId: original.periodId,
      description: `Reversal: ${original.description}`,
      reference: original.reference ? `Reversed: ${original.reference}` : undefined,
      lines: reversingLines,
    });

    reversed.status = 'posted';
    reversed.postedAt = new Date();

    // Link the original to the reversed entry
    original.reversedEntryId = reversed.id;
    original.status = 'reversed';
    original.updatedAt = new Date();

    return reversed;
  }

  getEntriesByPeriod(periodId: string): JournalEntry[] {
    return Array.from(this.entries.values()).filter(e => e.periodId === periodId);
  }

  getEntriesByAccount(accountId: string): JournalEntry[] {
    return Array.from(this.entries.values()).filter(
      e => e.lines.some(line => line.accountId === accountId)
    );
  }

  getEntry(id: string): JournalEntry | undefined {
    return this.entries.get(id);
  }

  /**
   * Get all posted entries for a period (used for trial balance)
   */
  getPostedEntriesByPeriod(periodId: string): JournalEntry[] {
    return this.getEntriesByPeriod(periodId).filter(e => e.status === 'posted');
  }

  /**
   * Get all entries for an account in a specific period
   */
  getAccountEntriesInPeriod(accountId: string, periodId: string): JournalEntryLine[] {
    const entries = this.getEntriesByPeriod(periodId).filter(e => e.status === 'posted');
    const lines: JournalEntryLine[] = [];
    for (const entry of entries) {
      for (const line of entry.lines) {
        if (line.accountId === accountId) {
          lines.push(line);
        }
      }
    }
    return lines;
  }
}