/**
 * Depreciation Engine — Monthly depreciation posting
 */

import { AssetRegister, AssetStatus } from './asset-register.js';

export interface DepreciationJournalEntry {
  assetId: string; assetName: string; date: Date;
  depreciationExpense: number; accumulatedDepreciation: number; bookValue: number;
}

export class DepreciationEngine {
  constructor(private assetRegister: AssetRegister) {}

  async calculateMonthlyDepreciation(year: number, month: number): Promise<DepreciationJournalEntry[]> {
    const entries: DepreciationJournalEntry[] = [];
    const assets = await this.assetRegister.list({ status: AssetStatus.ACTIVE as AssetStatus });
    const endOfMonth = new Date(year, month, 0);
    for (const asset of assets) {
      if (new Date(asset.purchaseDate) > endOfMonth) continue;
      const schedule = await this.assetRegister.generateSchedule(asset.id);
      const yearEntry = schedule[year - 1];
      if (!yearEntry) continue;
      const monthlyDep = yearEntry.depreciationExpense / 12;
      entries.push({ assetId: asset.id, assetName: asset.name, date: new Date(year, month - 1, 1), depreciationExpense: monthlyDep, accumulatedDepreciation: yearEntry.accumulatedDepreciation, bookValue: yearEntry.endingBookValue });
    }
    return entries;
  }

  async postMonthlyDepreciation(year: number, month: number): Promise<{ totalDepreciationExpense: number; assetCount: number; journalEntryIds: string[] }> {
    const entries = await this.calculateMonthlyDepreciation(year, month);
    for (const entry of entries) await this.assetRegister.updateDepreciation(entry.assetId);
    return { totalDepreciationExpense: entries.reduce((s, e) => s + e.depreciationExpense, 0), assetCount: entries.length, journalEntryIds: [] };
  }

  async postYearEndDepreciation(year: number): Promise<{ totalDepreciation: number; assetCount: number }> {
    const assets = await this.assetRegister.list({ status: AssetStatus.ACTIVE as AssetStatus });
    let totalDep = 0;
    for (const asset of assets) {
      const updated = await this.assetRegister.updateDepreciation(asset.id);
      totalDep += updated.currentYearDepreciation;
    }
    return { totalDepreciation: totalDep, assetCount: assets.length };
  }
}
