/**
 * Vendor Master - Accounts Payable vendor management
 * Handles 1099 tracking, W-9 status, and vendor CRUD operations
 */

export enum VendorStatus {
  ACTIVE = 'active',
  INACTIVE = 'inactive',
  BLOCKED = 'blocked'
}

export enum TaxIdType {
  SSN = 'ssn',
  EIN = 'ein'
}

export enum Vendor1099Type {
  NONE = 'none',
  MISC_1099 = '1099_misc',
  NEC_1099 = '1099_nec',
  K_1099 = '1099_k'
}

export interface VendorAddress {
  street: string;
  city: string;
  state: string;
  zip: string;
  country: string;
}

export interface VendorContact {
  name: string;
  email: string;
  phone: string;
}

export interface Vendor1099Info {
  type: Vendor1099Type;
  required: boolean;
  threshold: number;
  ytdAmount: number;
  w9OnFile: boolean;
}

export interface VendorPaymentTerms {
  type: 'net' | 'due_on_receipt' | 'end_of_month';
  days: number;
  discountDays?: number;
  discountPercent?: number;
}

export interface Vendor {
  id: string;
  companyId: string;
  status: VendorStatus;
  name: string;
  displayName?: string;
  taxIdType: TaxIdType;
  taxId?: string;
  address: VendorAddress;
  contact: VendorContact;
  paymentTerms: VendorPaymentTerms;
  bankDetails?: { accountName: string; routingNumber: string; accountNumber: string; };
  defaultExpenseAccountId?: string;
  1099: Vendor1099Info;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export class VendorService {
  private storage = new Map<string, Vendor>();
  private idCounter = 0;

  private nextId(): string {
    return `ven_${Date.now()}_${++this.idCounter}`;
  }

  /**
   * Create a new vendor
   */
  async create(vendor: Omit<Vendor, 'id' | 'createdAt' | 'updatedAt'>): Promise<Vendor> {
    const v: Vendor = {
      ...vendor,
      id: this.nextId(),
      createdAt: new Date(),
      updatedAt: new Date()
    };
    this.storage.set(v.id, v);
    return v;
  }

  /**
   * Find a vendor by name (case-insensitive partial match)
   */
  async findByName(name: string): Promise<Vendor | null> {
    const lower = name.toLowerCase();
    return Array.from(this.storage.values()).find(v => v.name.toLowerCase().includes(lower)) || null;
  }

  /**
   * Get a vendor by ID
   */
  async getById(id: string): Promise<Vendor | null> {
    return this.storage.get(id) || null;
  }

  /**
   * Update a vendor's information
   */
  async update(id: string, updates: Partial<Vendor>): Promise<Vendor> {
    const v = this.storage.get(id);
    if (!v) throw new Error(`Vendor ${id} not found`);
    const updated: Vendor = {
      ...v,
      ...updates,
      id: v.id,
      createdAt: v.createdAt,
      updatedAt: new Date()
    };
    this.storage.set(id, updated);
    return updated;
  }

  /**
   * List vendors with optional filtering
   */
  async list(filters?: { status?: VendorStatus; search?: string; }): Promise<Vendor[]> {
    let vendors = Array.from(this.storage.values());
    if (filters?.status) {
      vendors = vendors.filter(v => v.status === filters.status);
    }
    if (filters?.search) {
      vendors = vendors.filter(v => v.name.toLowerCase().includes(filters.search!.toLowerCase()));
    }
    return vendors;
  }

  /**
   * Update 1099 YTD tracking amount for a vendor
   */
  async update1099Tracking(vendorId: string, amount: number): Promise<void> {
    const v = this.storage.get(vendorId);
    if (v) {
      v['1099'] = { ...v['1099'], ytdAmount: v['1099'].ytdAmount + amount };
    }
  }

  /**
   * Check if a vendor has exceeded the 1099 reporting threshold
   */
  async check1099Threshold(vendorId: string): Promise<boolean> {
    const v = this.storage.get(vendorId);
    return v ? v['1099'].ytdAmount >= v['1099'].threshold : false;
  }

  /**
   * Check if vendor requires a W-9 form
   */
  async requiresW9(vendorId: string): Promise<boolean> {
    const v = this.storage.get(vendorId);
    if (!v) return false;
    return v['1099'].required && !v['1099'].w9OnFile;
  }

  /**
   * Update W-9 status for a vendor
   */
  async updateW9Status(vendorId: string, w9OnFile: boolean): Promise<void> {
    const v = this.storage.get(vendorId);
    if (v) {
      v['1099'] = { ...v['1099'], w9OnFile };
      v.updatedAt = new Date();
    }
  }

  /**
   * Archive (soft delete) a vendor
   */
  async archive(id: string): Promise<void> {
    const v = this.storage.get(id);
    if (v) {
      this.storage.delete(id);
    }
  }

  /**
   * Get vendors requiring 1099 forms
   */
  async getVendorsRequiring1099(): Promise<Vendor[]> {
    return Array.from(this.storage.values()).filter(v => 
      v['1099'].required && v['1099'].ytdAmount >= v['1099'].threshold
    );
  }

  /**
   * Get vendors without W-9 on file but requiring 1099
   */
  async getVendorsMissingW9(): Promise<Vendor[]> {
    return Array.from(this.storage.values()).filter(v =>
      v['1099'].required && !v['1099'].w9OnFile
    );
  }

  /**
   * Get total YTD 1099 amounts by type
   */
  async get1099Summary(): Promise<Record<Vendor1099Type, number>> {
    const summary: Record<Vendor1099Type, number> = {
      [Vendor1099Type.NONE]: 0,
      [Vendor1099Type.MISC_1099]: 0,
      [Vendor1099Type.NEC_1099]: 0,
      [Vendor1099Type.K_1099]: 0
    };
    const vendors = Array.from(this.storage.values());
    for (const v of vendors) {
      if (v['1099'].type !== Vendor1099Type.NONE) {
        summary[v['1099'].type] += v['1099'].ytdAmount;
      }
    }
    return summary;
  }

  /**
   * Activate a vendor
   */
  async activate(id: string): Promise<Vendor> {
    return this.update(id, { status: VendorStatus.ACTIVE });
  }

  /**
   * Deactivate a vendor
   */
  async deactivate(id: string): Promise<Vendor> {
    return this.update(id, { status: VendorStatus.INACTIVE });
  }

  /**
   * Block a vendor (prevents new bill creation)
   */
  async block(id: string): Promise<Vendor> {
    return this.update(id, { status: VendorStatus.BLOCKED });
  }

  /**
   * Get vendors by tax ID type
   */
  async getByTaxIdType(taxIdType: TaxIdType): Promise<Vendor[]> {
    return Array.from(this.storage.values()).filter(v => v.taxIdType === taxIdType);
  }

  /**
   * Find vendor by tax ID
   */
  async findByTaxId(taxId: string): Promise<Vendor | null> {
    return Array.from(this.storage.values()).find(v => v.taxId === taxId) || null;
  }

  /**
   * Update payment terms for a vendor
   */
  async updatePaymentTerms(vendorId: string, paymentTerms: VendorPaymentTerms): Promise<Vendor> {
    return this.update(vendorId, { paymentTerms });
  }

  /**
   * Update bank details for a vendor
   */
  async updateBankDetails(vendorId: string, bankDetails: { accountName: string; routingNumber: string; accountNumber: string; }): Promise<Vendor> {
    return this.update(vendorId, { bankDetails });
  }

  /**
   * Clear bank details for a vendor
   */
  async clearBankDetails(vendorId: string): Promise<Vendor> {
    const v = this.storage.get(vendorId);
    if (!v) throw new Error(`Vendor ${vendorId} not found`);
    const { bankDetails, ...rest } = v;
    return this.update(vendorId, rest as Partial<Vendor>);
  }

  /**
   * Add notes to a vendor
   */
  async addNotes(vendorId: string, notes: string): Promise<Vendor> {
    const v = this.storage.get(vendorId);
    if (!v) throw new Error(`Vendor ${vendorId} not found`);
    const existingNotes = v.notes ? `${v.notes}\n${notes}` : notes;
    return this.update(vendorId, { notes: existingNotes });
  }

  /**
   * Get all active vendors
   */
  async getActiveVendors(): Promise<Vendor[]> {
    return this.list({ status: VendorStatus.ACTIVE });
  }

  /**
   * Get vendor count by status
   */
  async getCountByStatus(): Promise<Record<VendorStatus, number>> {
    const counts: Record<VendorStatus, number> = {
      [VendorStatus.ACTIVE]: 0,
      [VendorStatus.INACTIVE]: 0,
      [VendorStatus.BLOCKED]: 0
    };
    const allVendors = Array.from(this.storage.values());
    for (const v of allVendors) {
      counts[v.status]++;
    }
    return counts;
  }

  /**
   * Search vendors by multiple criteria
   */
  async search(criteria: {
    name?: string;
    status?: VendorStatus;
    taxIdType?: TaxIdType;
    requires1099?: boolean;
    missingW9?: boolean;
  }): Promise<Vendor[]> {
    let vendors = Array.from(this.storage.values());
    
    if (criteria.name) {
      const lower = criteria.name.toLowerCase();
      vendors = vendors.filter(v => v.name.toLowerCase().includes(lower));
    }
    if (criteria.status) {
      vendors = vendors.filter(v => v.status === criteria.status);
    }
    if (criteria.taxIdType) {
      vendors = vendors.filter(v => v.taxIdType === criteria.taxIdType);
    }
    if (criteria.requires1099) {
      vendors = vendors.filter(v => v['1099'].required);
    }
    if (criteria.missingW9) {
      vendors = vendors.filter(v => v['1099'].required && !v['1099'].w9OnFile);
    }
    
    return vendors;
  }

  /**
   * Reset 1099 YTD amounts (typically at year start)
   */
  async reset1099Ytd(vendorId: string): Promise<void> {
    const v = this.storage.get(vendorId);
    if (v) {
      v['1099'] = { ...v['1099'], ytdAmount: 0 };
      v.updatedAt = new Date();
    }
  }

  /**
   * Reset all 1099 YTD amounts
   */
  async resetAll1099Ytd(): Promise<void> {
    const allVendors = Array.from(this.storage.values());
    for (const v of allVendors) {
      v['1099'] = { ...v['1099'], ytdAmount: 0 };
      v.updatedAt = new Date();
    }
  }

  /**
   * Bulk update vendor statuses
   */
  async bulkUpdateStatus(vendorIds: string[], status: VendorStatus): Promise<Vendor[]> {
    const results: Vendor[] = [];
    for (const id of vendorIds) {
      try {
        const updated = await this.update(id, { status });
        results.push(updated);
      } catch {
        // Skip vendors that don't exist
      }
    }
    return results;
  }

  /**
   * Get default expense account for a vendor
   */
  async getDefaultExpenseAccount(vendorId: string): Promise<string | undefined> {
    const v = this.storage.get(vendorId);
    return v?.defaultExpenseAccountId;
  }

  /**
   * Set default expense account for a vendor
   */
  async setDefaultExpenseAccount(vendorId: string, accountId: string): Promise<Vendor> {
    return this.update(vendorId, { defaultExpenseAccountId: accountId });
  }
}
