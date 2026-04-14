/**
 * Customer Master - Customer/Client CRUD with credit limits and payment terms
 * Part of the AR module (Phase 3)
 */

export enum CustomerStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  CREDIT_HOLD = 'credit_hold'
}

export interface CustomerAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface CustomerContact {
  name: string;
  email: string;
  phone: string;
}

export interface Customer {
  id: string;
  companyId: string;
  status: CustomerStatus;
  name: string;
  displayName?: string;
  taxId?: string;
  address: CustomerAddress;
  contact: CustomerContact;
  creditLimit: number;
  currentBalance: number; // AR balance - amount currently owed
  paymentTermsDays: number;
  taxExempt: boolean;
  taxCertificateId?: string;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CustomerService {
  create(customer: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>): Promise<Customer>;
  getById(id: string): Promise<Customer | null>;
  update(id: string, updates: Partial<Customer>): Promise<Customer>;
  list(filters?: { status?: CustomerStatus; search?: string }): Promise<Customer[]>;
  updateBalance(customerId: string, delta: number): Promise<void>; // + = more owed, - = payment received
  checkCreditLimit(customerId: string, additionalAmount: number): Promise<boolean>; // true if within limit
  placeOnCreditHold(customerId: string): Promise<void>;
  removeCreditHold(customerId: string): Promise<void>;
  archive(id: string): Promise<void>;
}

export class CustomerMaster implements CustomerService {
  private customers: Map<string, Customer> = new Map();
  private idCounter = 0;

  private nextId(): string {
    return `cust_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Create a new customer
   */
  async create(
    customerData: Omit<Customer, 'id' | 'createdAt' | 'updatedAt' | 'currentBalance'>
  ): Promise<Customer> {
    // Validate required fields
    if (!customerData.name || customerData.name.trim().length === 0) {
      throw new Error('Customer name is required');
    }
    if (!customerData.companyId) {
      throw new Error('Company ID is required');
    }
    if (customerData.creditLimit < 0) {
      throw new Error('Credit limit cannot be negative');
    }
    if (customerData.paymentTermsDays < 0) {
      throw new Error('Payment terms days cannot be negative');
    }

    // Validate email format
    if (customerData.contact?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(customerData.contact.email)) {
        throw new Error('Invalid email format');
      }
    }

    const now = new Date();
    const customer: Customer = {
      ...customerData,
      id: this.nextId(),
      currentBalance: 0,
      createdAt: now,
      updatedAt: now,
    };

    this.customers.set(customer.id, customer);
    return customer;
  }

  /**
   * Get a customer by ID
   */
  async getById(id: string): Promise<Customer | null> {
    return this.customers.get(id) || null;
  }

  /**
   * Update a customer
   */
  async update(id: string, updates: Partial<Customer>): Promise<Customer> {
    const customer = this.customers.get(id);
    if (!customer) {
      throw new Error(`Customer ${id} not found`);
    }

    // Validate credit limit if being updated
    if (updates.creditLimit !== undefined && updates.creditLimit < 0) {
      throw new Error('Credit limit cannot be negative');
    }

    // Validate email format if being updated
    if (updates.contact?.email) {
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      if (!emailRegex.test(updates.contact.email)) {
        throw new Error('Invalid email format');
      }
    }

    // Validate payment terms if being updated
    if (updates.paymentTermsDays !== undefined && updates.paymentTermsDays < 0) {
      throw new Error('Payment terms days cannot be negative');
    }

    const updated: Customer = {
      ...customer,
      ...updates,
      id, // Prevent ID override
      updatedAt: new Date(),
    };

    this.customers.set(id, updated);
    return updated;
  }

  /**
   * List customers with optional filtering
   */
  async list(filters?: { status?: CustomerStatus; search?: string }): Promise<Customer[]> {
    let customers = Array.from(this.customers.values());

    if (filters?.status) {
      customers = customers.filter(c => c.status === filters.status);
    }

    if (filters?.search) {
      const searchLower = filters.search.toLowerCase();
      customers = customers.filter(
        c =>
          c.name.toLowerCase().includes(searchLower) ||
          c.displayName?.toLowerCase().includes(searchLower) ||
          c.contact?.email?.toLowerCase().includes(searchLower) ||
          c.contact?.phone?.includes(searchLower) ||
          c.taxId?.toLowerCase().includes(searchLower)
      );
    }

    // Sort by name alphabetically
    return customers.sort((a, b) => a.name.localeCompare(b.name));
  }

  /**
   * Update customer balance (used when invoices are created or payments are received)
   * @param customerId - Customer ID
   * @param delta - Amount to add (positive) or subtract (negative)
   */
  async updateBalance(customerId: string, delta: number): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    const newBalance = customer.currentBalance + delta;
    if (newBalance < 0) {
      throw new Error(
        `Balance cannot be negative. Current: ${customer.currentBalance}, Delta: ${delta}`
      );
    }

    customer.currentBalance = newBalance;
    customer.updatedAt = new Date();

    // Auto-place on credit hold if exceeding limit
    if (newBalance > customer.creditLimit && customer.status === CustomerStatus.ACTIVE) {
      customer.status = CustomerStatus.CREDIT_HOLD;
    }
  }

  /**
   * Check if a customer can be invoiced for an additional amount
   * @param customerId - Customer ID
   * @param additionalAmount - Amount to add
   * @returns true if within credit limit
   */
  async checkCreditLimit(customerId: string, additionalAmount: number): Promise<boolean> {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    // Customers on credit hold cannot be invoiced
    if (customer.status === CustomerStatus.CREDIT_HOLD) {
      return false;
    }

    // Inactive customers cannot be invoiced
    if (customer.status === CustomerStatus.INACTIVE) {
      return false;
    }

    const projectedBalance = customer.currentBalance + additionalAmount;
    return projectedBalance <= customer.creditLimit;
  }

  /**
   * Place a customer on credit hold
   */
  async placeOnCreditHold(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (customer.status === CustomerStatus.INACTIVE) {
      throw new Error('Cannot place inactive customer on credit hold');
    }

    customer.status = CustomerStatus.CREDIT_HOLD;
    customer.updatedAt = new Date();
  }

  /**
   * Remove credit hold from a customer (typically after payment arrangements)
   */
  async removeCreditHold(customerId: string): Promise<void> {
    const customer = this.customers.get(customerId);
    if (!customer) {
      throw new Error(`Customer ${customerId} not found`);
    }

    if (customer.status !== CustomerStatus.CREDIT_HOLD) {
      throw new Error('Customer is not on credit hold');
    }

    // Check if balance is now within limit
    if (customer.currentBalance > customer.creditLimit) {
      throw new Error(
        `Cannot remove credit hold: balance ${customer.currentBalance} exceeds limit ${customer.creditLimit}`
      );
    }

    customer.status = CustomerStatus.ACTIVE;
    customer.updatedAt = new Date();
  }

  /**
   * Archive a customer (soft delete)
   */
  async archive(id: string): Promise<void> {
    const customer = this.customers.get(id);
    if (!customer) {
      throw new Error(`Customer ${id} not found`);
    }

    // Cannot archive if there's an outstanding balance
    if (customer.currentBalance > 0) {
      throw new Error('Cannot archive customer with outstanding balance');
    }

    customer.status = CustomerStatus.INACTIVE;
    customer.updatedAt = new Date();
  }

  /**
   * Get all customers with outstanding balances
   */
  async getCustomersWithOutstandingBalance(): Promise<Customer[]> {
    return Array.from(this.customers.values())
      .filter(c => c.currentBalance > 0 && c.status !== CustomerStatus.INACTIVE)
      .sort((a, b) => b.currentBalance - a.currentBalance);
  }

  /**
   * Get customers approaching their credit limit (over 80%)
   */
  async getCustomersApproachingCreditLimit(threshold: number = 0.8): Promise<Customer[]> {
    return Array.from(this.customers.values()).filter(c => {
      if (c.status === CustomerStatus.INACTIVE || c.currentBalance <= 0) return false;
      return c.currentBalance / c.creditLimit >= threshold;
    });
  }

  /**
   * Get total AR balance for a company
   */
  async getTotalARBalance(companyId: string): Promise<number> {
    const customers = Array.from(this.customers.values()).filter(
      c => c.companyId === companyId && c.status !== CustomerStatus.INACTIVE
    );
    return customers.reduce((sum, c) => sum + c.currentBalance, 0);
  }

  /**
   * Get customer count by status
   */
  async getCustomerCountByStatus(): Promise<Record<CustomerStatus, number>> {
    const counts: Record<CustomerStatus, number> = {
      [CustomerStatus.ACTIVE]: 0,
      [CustomerStatus.INACTIVE]: 0,
      [CustomerStatus.CREDIT_HOLD]: 0,
    };

    for (const customer of this.customers.values()) {
      counts[customer.status]++;
    }

    return counts;
  }
}
