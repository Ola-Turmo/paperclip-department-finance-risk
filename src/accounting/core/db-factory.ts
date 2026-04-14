/**
 * Database Factory — creates the right repository implementation based on config.
 * Usage: new AccountingDbFactory(config).getService(...)
 */

import { Repository, DbConfig, RepositoryFactory, UnitOfWork } from './interfaces.js';

export interface AccountingServices {
  vendorRepo: Repository<any>;
  billRepo: Repository<any>;
  customerRepo: Repository<any>;
  arInvoiceRepo: Repository<any>;
  journalEntryRepo: Repository<any>;
  chartOfAccountsRepo: Repository<any>;
  assetRepo: Repository<any>;
  employeeRepo: Repository<any>;
  payrollRunRepo: Repository<any>;
  bankAccountRepo: Repository<any>;
  taxRegistrationRepo: Repository<any>;
  configRepo: Repository<any>;
}

export class AccountingDbFactory {
  private factory: RepositoryFactory;

  constructor(private dbConfig: DbConfig) {
    this.factory = new RepositoryFactory(dbConfig);
  }

  getFactory(): RepositoryFactory {
    return this.factory;
  }

  getAllRepositories(): AccountingServices {
    return {
      vendorRepo: this.factory.getRepository('vendors'),
      billRepo: this.factory.getRepository('bills'),
      customerRepo: this.factory.getRepository('customers'),
      arInvoiceRepo: this.factory.getRepository('ar_invoices'),
      journalEntryRepo: this.factory.getRepository('journal_entries'),
      chartOfAccountsRepo: this.factory.getRepository('chart_of_accounts'),
      assetRepo: this.factory.getRepository('assets'),
      employeeRepo: this.factory.getRepository('employees'),
      payrollRunRepo: this.factory.getRepository('payroll_runs'),
      bankAccountRepo: this.factory.getRepository('bank_accounts'),
      taxRegistrationRepo: this.factory.getRepository('tax_registrations'),
      configRepo: this.factory.getRepository('company_config'),
    };
  }

  async init(): Promise<void> {
    if (this.dbConfig.type === 'sqlite') {
      // await this.initSqlite();
    } else if (this.dbConfig.type === 'postgres') {
      // await this.initPostgres();
    }
    // inmemory: nothing to init
  }
}
