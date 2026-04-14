/**
 * Fixed Asset Register — Asset master record with depreciation tracking
 */

export enum AssetStatus { ACTIVE = 'active', DISPOSED = 'disposed', FULLY_DEPRECIATED = 'fully_depreciated' }
export enum AssetCategory { LAND = 'land', BUILDING = 'building', VEHICLE = 'vehicle', EQUIPMENT = 'equipment', COMPUTER = 'computer', FURNITURE = 'furniture', LEASEHOLD = 'leasehold', INTANGIBLE = 'intangible', OTHER = 'other' }
export enum DepreciationMethod { STRAIGHT_LINE = 'straight_line', DECLINING_BALANCE = 'declining_balance', SUM_OF_YEARS = 'sum_of_years', UNITS_OF_PRODUCTION = 'units_of_production' }

export interface Asset {
  id: string; companyId: string; assetNumber: string;
  name: string; description?: string; category: AssetCategory;
  status: AssetStatus;
  cost: number; salvageValue: number; usefulLifeYears: number;
  depreciationMethod: DepreciationMethod;
  purchaseDate: Date; placedInServiceDate: Date;
  accumulatedDepreciation: number; currentYearDepreciation: number;
  depreciationStartDate: Date; bookValue: number;
  location?: string; departmentId?: string; responsiblePerson?: string;
  vendorId?: string; serialNumber?: string;
  disposalDate?: Date; disposalProceeds?: number; gainOrLoss?: number;
  createdAt: Date; updatedAt: Date;
}

export interface DepreciationScheduleEntry {
  year: number; beginningBookValue: number; depreciationExpense: number;
  accumulatedDepreciation: number; endingBookValue: number;
}

export class AssetRegister {
  private storage = new Map<string, Asset>();
  private idCounter = 0;
  private nextId(): string { return `fa_${Date.now()}_${++this.idCounter}`; }

  private yearsSince(date: Date): number {
    return (Date.now() - new Date(date).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  }

  private totalAccumulated(asset: Asset): number {
    const base = asset.cost - asset.salvageValue;
    if (base <= 0) return 0;
    const yrs = Math.max(0, this.yearsSince(asset.depreciationStartDate));
    if (yrs <= 0) return 0;
    switch (asset.depreciationMethod) {
      case 'straight_line': return (base / asset.usefulLifeYears) * yrs;
      case 'declining_balance': {
        const rate = 2 / asset.usefulLifeYears;
        let val = 0;
        for (let y = 0; y < Math.floor(yrs); y++) val += (asset.cost - val) * rate;
        return Math.min(val, base);
      }
      case 'sum_of_years': {
        const n = asset.usefulLifeYears;
        const sum = (n * (n + 1)) / 2;
        let total = 0;
        for (let y = 0; y < Math.floor(yrs); y++) total += base * ((n - y) / sum);
        return Math.min(total, base);
      }
      default: return Math.min(base / asset.usefulLifeYears * yrs, base);
    }
  }

  async createAsset(params: Omit<Asset, 'id' | 'createdAt' | 'updatedAt' | 'accumulatedDepreciation' | 'currentYearDepreciation' | 'bookValue' | 'status'>): Promise<Asset> {
    const asset: Asset = {
      ...params, id: this.nextId(), status: AssetStatus.ACTIVE,
      accumulatedDepreciation: 0, currentYearDepreciation: 0,
      bookValue: params.cost - params.salvageValue,
      createdAt: new Date(), updatedAt: new Date(),
    };
    this.storage.set(asset.id, asset);
    return asset;
  }

  async getById(id: string): Promise<Asset | null> { return this.storage.get(id) || null; }

  async list(filters?: { status?: AssetStatus; category?: AssetCategory; departmentId?: string; }): Promise<Asset[]> {
    let assets = Array.from(this.storage.values());
    if (filters?.status) assets = assets.filter(a => a.status === filters.status);
    if (filters?.category) assets = assets.filter(a => a.category === filters.category);
    if (filters?.departmentId) assets = assets.filter(a => a.departmentId === filters.departmentId);
    return assets;
  }

  async getBookValue(assetId: string): Promise<number> {
    const asset = this.storage.get(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const accum = this.totalAccumulated(asset);
    return Math.max(asset.salvageValue, asset.cost - accum);
  }

  async updateDepreciation(assetId: string): Promise<Asset> {
    const asset = this.storage.get(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const totalAccum = this.totalAccumulated(asset);
    const currentYear = new Date().getFullYear();
    const purchaseYear = new Date(asset.purchaseDate).getFullYear();
    asset.currentYearDepreciation = currentYear === purchaseYear ? totalAccum : totalAccum - asset.accumulatedDepreciation;
    asset.accumulatedDepreciation = totalAccum;
    asset.bookValue = Math.max(asset.salvageValue, asset.cost - totalAccum);
    if (asset.bookValue <= asset.salvageValue) asset.status = AssetStatus.FULLY_DEPRECIATED;
    asset.updatedAt = new Date();
    return asset;
  }

  async generateSchedule(assetId: string): Promise<DepreciationScheduleEntry[]> {
    const asset = this.storage.get(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const entries: DepreciationScheduleEntry[] = [];
    let accum = 0;
    let beg = asset.cost;
    const base = asset.cost - asset.salvageValue;
    for (let year = 1; year <= asset.usefulLifeYears; year++) {
      const dep = base / asset.usefulLifeYears;
      accum += dep;
      const end = Math.max(asset.salvageValue, asset.cost - accum);
      entries.push({ year, beginningBookValue: beg, depreciationExpense: dep, accumulatedDepreciation: accum, endingBookValue: end });
      beg = end;
      if (end <= asset.salvageValue) break;
    }
    return entries;
  }

  async dispose(assetId: string, proceeds: number, disposalDate: Date): Promise<Asset> {
    const asset = this.storage.get(assetId);
    if (!asset) throw new Error(`Asset ${assetId} not found`);
    const bv = await this.getBookValue(assetId);
    asset.status = AssetStatus.DISPOSED;
    asset.disposalDate = disposalDate;
    asset.disposalProceeds = proceeds;
    asset.gainOrLoss = proceeds - bv;
    asset.updatedAt = new Date();
    return asset;
  }

  async getTotalAssetsValue(): Promise<{ totalCost: number; totalAccumulatedDepreciation: number; totalBookValue: number }> {
    let totalCost = 0, totalAccum = 0;
    const allAssets = Array.from(this.storage.values());
    for (const asset of allAssets) {
      totalCost += asset.cost;
      totalAccum += this.totalAccumulated(asset);
    }
    return { totalCost, totalAccumulatedDepreciation: totalAccum, totalBookValue: totalCost - totalAccum };
  }
}
