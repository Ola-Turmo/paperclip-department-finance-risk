/**
 * Database Repository Interface — abstracts storage so any DB can be plugged in.
 * Default implementation: InMemoryRepository (dev/test)
 * Swap for: SqliteRepository, PostgresRepository, MySqlRepository, etc.
 */

export interface Repository<T extends object> {
  findById(id: string): Promise<T | null>;
  findAll(filters?: Partial<T>): Promise<T[]>;
  save(entity: T): Promise<T>;
  delete(id: string): Promise<void>;
  count(filters?: Partial<T>): Promise<number>;
}

export interface UnitOfWork {
  start(): Promise<void>;
  commit(): Promise<void>;
  rollback(): Promise<void>;
  getRepository<T extends object>(name: string): Repository<T>;
}

export interface DbConfig {
  type: 'inmemory' | 'sqlite' | 'postgres' | 'mysql';
  connectionString?: string;
  database?: string;
}

/** Budget entry — a single budget line for an account in a period. */
export interface BudgetEntry {
  id: string;
  accountKey: string;
  accountCode: string;
  accountName: string;
  periodKey: string;       // "2025-03" or "2025-Q1"
  budgetAmount: string;
  forecastAmount?: string;  // Optional updated forecast
}

/**
 * Repository for budget entries.
 * Pluggable: use InMemoryBudgetEntryRepo for dev/test,
 * swap for PostgresBudgetEntryRepo, SqliteBudgetEntryRepo, etc. for production.
 */
export interface BudgetEntryRepository {
  findByPeriod(periodKey: string): Promise<BudgetEntry[]>;
  findByAccountAndPeriod(accountKey: string, periodKey: string): Promise<BudgetEntry | null>;
  save(entry: BudgetEntry): Promise<BudgetEntry>;
  saveMany(entries: BudgetEntry[]): Promise<BudgetEntry[]>;
  delete(id: string): Promise<void>;
  deleteByPeriod(periodKey: string): Promise<void>;
  count(filters?: Partial<BudgetEntry>): Promise<number>;
}

export class InMemoryBudgetEntryRepo implements BudgetEntryRepository {
  private storage = new Map<string, BudgetEntry>();

  async findByPeriod(periodKey: string): Promise<BudgetEntry[]> {
    return Array.from(this.storage.values()).filter(e => e.periodKey === periodKey);
  }

  async findByAccountAndPeriod(accountKey: string, periodKey: string): Promise<BudgetEntry | null> {
    return Array.from(this.storage.values()).find(
      e => e.accountKey === accountKey && e.periodKey === periodKey,
    ) ?? null;
  }

  async save(entry: BudgetEntry): Promise<BudgetEntry> {
    this.storage.set(entry.id, entry);
    return entry;
  }

  async saveMany(entries: BudgetEntry[]): Promise<BudgetEntry[]> {
    for (const e of entries) this.storage.set(e.id, e);
    return entries;
  }

  async delete(id: string): Promise<void> { this.storage.delete(id); }

  async deleteByPeriod(periodKey: string): Promise<void> {
    for (const [id, e] of Array.from(this.storage.entries())) {
      if (e.periodKey === periodKey) this.storage.delete(id);
    }
  }

  async count(filters?: Partial<BudgetEntry>): Promise<number> {
    return (await this.findByPeriod(filters?.periodKey ?? '')).length;
  }
}

export class RepositoryFactory {
  private repos = new Map<string, Repository<any>>();
  private unitOfWork: UnitOfWork | null = null;

  constructor(private dbConfig: DbConfig) {}

  getRepository<T extends object>(name: string): Repository<T> {
    if (this.unitOfWork) return this.unitOfWork.getRepository<T>(name);
    if (!this.repos.has(name)) {
      this.repos.set(name, new InMemoryRepository<T>());
    }
    return this.repos.get(name)!;
  }

  setUnitOfWork(uow: UnitOfWork): void {
    this.unitOfWork = uow;
  }
}

export class InMemoryRepository<T extends object> implements Repository<T> {
  protected storage = new Map<string, T>();

  async findById(id: string): Promise<T | null> {
    return this.storage.get(id) || null;
  }

  async findAll(filters?: Partial<T>): Promise<T[]> {
    let items = Array.from(this.storage.values());
    if (filters) {
      for (const [key, val] of Object.entries(filters)) {
        items = items.filter(item => (item as any)[key] === val);
      }
    }
    return items;
  }

  async save(entity: T): Promise<T> {
    const id = (entity as any).id as string;
    this.storage.set(id, entity);
    return entity;
  }

  async delete(id: string): Promise<void> {
    this.storage.delete(id);
  }

  async count(filters?: Partial<T>): Promise<number> {
    return (await this.findAll(filters)).length;
  }

  // ─── Internal helpers (not in Repository interface) ────────────────────────
  async insert(entity: T): Promise<void> {
    const id = (entity as any).id ?? (entity as any).accountKey ?? (entity as any).entityKey ?? crypto.randomUUID();
    this.storage.set(id, entity);
  }

  async update(entity: T): Promise<void> {
    const id = (entity as any).id ?? (entity as any).accountKey ?? (entity as any).entityKey;
    if (id && this.storage.has(id)) this.storage.set(id, entity);
  }

  _clear(): void { this.storage.clear(); }
  _getAll(): T[] { return Array.from(this.storage.values()); }
}
