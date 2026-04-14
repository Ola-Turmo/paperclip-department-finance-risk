/**
 * Vendor Master — uses Repository<T> for storage, configurable numbering.
 */

import { Repository } from '../core/interfaces.js';
import { CompanyConfigService } from '../core/company-config.js';

export enum VendorStatus { ACTIVE = 'active', INACTIVE = 'inactive', BLOCKED = 'blocked' }
export enum TaxIdType { SSN = 'ssn', EIN = 'ein', FOREIGN = 'foreign', NONE = 'none' }
export enum Vendor1099Type { NONE = 'none', NEC = 'nec', MISC = 'misc', K = 'k' }

export interface Vendor {
  id: string; number: string; name: string; status: VendorStatus;
  companyId: string;
  taxIdType: TaxIdType; taxId: string;
  address: { street: string; city: string; state: string; zip: string; country: string; };
  contact: { name: string; email: string; phone: string; };
  paymentTerms: { type: 'immediate' | 'net' | 'cod' | 'prepay'; days?: number; discountDays?: number; discountPercent?: number; };
  1099: { type: Vendor1099Type; required: boolean; threshold: number; ytdAmount: number; w9OnFile: boolean; };
  bankAccounts: { accountName: string; routingNumber: string; accountNumber: string; accountType: 'checking' | 'savings'; isPrimary: boolean; }[];
  notes?: string; createdAt: Date; updatedAt: Date; ytdAmount?: number;
}

export class VendorService {
  constructor(
    private repo: Repository<Vendor>,
    private companyConfig: CompanyConfigService,
  ) {}

  async create(data: Omit<Vendor, 'id' | 'number' | 'createdAt' | 'updatedAt'>): Promise<Vendor> {
    const company = await this.companyConfig.get(data.companyId);
    const prefix = company?.accountingPolicy.vendorNumberPrefix ?? 'VEN-';
    const count = await this.repo.count({ companyId: data.companyId });
    const vendor: Vendor = {
      ...data,
      id: `vendor_${Date.now()}_${Math.random().toString(36)[2]}`,
      number: `${prefix}${String(count + 1).padStart(5, '0')}`,
      createdAt: new Date(), updatedAt: new Date(),
    };
    return this.repo.save(vendor);
  }

  async getById(id: string): Promise<Vendor | null> { return this.repo.findById(id); }

  async findByName(companyId: string, name: string): Promise<Vendor[]> {
    return this.repo.findAll({ companyId, name } as any);
  }

  async list(companyId: string): Promise<Vendor[]> { return this.repo.findAll({ companyId } as any); }

  async update(id: string, data: Partial<Vendor>): Promise<Vendor> {
    const existing = await this.repo.findById(id);
    if (!existing) throw new Error(`Vendor ${id} not found`);
    const updated = { ...existing, ...data, id, updatedAt: new Date() };
    return this.repo.save(updated);
  }

  async record1099Payment(vendorId: string, amount: number): Promise<void> {
    const v = await this.repo.findById(vendorId);
    if (v) {
      v.ytdAmount = (v.ytdAmount || 0) + amount;
      await this.repo.save(v);
    }
  }
}
