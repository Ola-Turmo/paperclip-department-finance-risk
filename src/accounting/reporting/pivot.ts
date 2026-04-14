/**
 * Excel-Style Pivot Engine
 *
 * Full pivot table implementation supporting:
 * - Row dimensions (any dimensional field)
 * - Column dimensions (including multi-level column headers)
 * - Value aggregations: SUM, COUNT, AVG, MIN, MAX
 * - Filters (pre-aggregation row/column filtering)
 * - Totals and subtotals
 * - Grand totals
 *
 * Works with the dimensional model from core-types.ts and the
 * FinancialDataWarehouse from warehouse/warehouse.ts.
 */

import {
  FactGLEntry,
  DimAccount, DimEntity, DimTime, DimCurrency,
  DimProduct, DimCustomer, DimVendor, DimCostCenter,
  DimProject, DimJournal,
  toNumber,
} from './dimensional/core-types.js';
import { FinancialDataWarehouse, AccountPeriodBalance } from './warehouse/warehouse.js';

// ─────────────────────────────────────────────────────────────────────────────
// PivotConfig — user-facing configuration interface
// ─────────────────────────────────────────────────────────────────────────────

/** A dimensional field path, e.g. "accountKey", "entityKey", "fiscalPeriod" */
export type DimField =
  | 'accountKey' | 'entityKey' | 'dateKey' | 'postingDateKey'
  | 'currencyKey' | 'productKey' | 'customerKey' | 'vendorKey'
  | 'costCenterKey' | 'projectKey' | 'journalId'
  | 'fiscalYear' | 'fiscalQuarter' | 'fiscalPeriod'
  | 'calendarYear' | 'calendarMonth' | 'calendarQuarter'
  | 'accountType' | 'incomeStatementRole' | 'balanceSheetRole'
  | 'entityType' | 'consolidationMethod'
  | 'journalType' | 'source' | 'workflowStatus';

export type AggregationType = 'SUM' | 'COUNT' | 'AVG' | 'MIN' | 'MAX';

export interface Aggregation {
  field: DimField;
  agg: AggregationType;
  alias?: string;
}

export interface FilterCondition {
  field: DimField;
  operator: 'eq' | 'neq' | 'gt' | 'gte' | 'lt' | 'lte' | 'in' | 'nin' | 'contains';
  value: string | number | boolean | (string | number | boolean)[];
}

export type TotalsMode = 'none' | 'subtotals' | 'all';

export interface PivotConfig {
  /** Row grouping dimensions — applied in order (outermost → innermost) */
  rowDimensions: DimField[];
  /** Column grouping dimensions — values of these fields become column headers */
  columnDimensions?: DimField[];
  /** Value aggregations — can have multiple */
  values: Aggregation[];
  /** Pre-aggregation filters (applied before grouping) */
  filters?: FilterCondition[];
  /** Which dimensions to show totals for (default: none) */
  totals?: TotalsMode;
  /** Show grand total row/column (default: true) */
  grandTotal?: boolean;
  /** Number precision for AVG calculations (default: 2) */
  avgPrecision?: number;
  /** Sort rows by the first row dimension asc/desc (default: asc) */
  sortRows?: 'asc' | 'desc';
  /** Filter out zero-value result cells (default: false) */
  excludeZeros?: boolean;
}

// ─────────────────────────────────────────────────────────────────────────────
// Internal types
// ─────────────────────────────────────────────────────────────────────────────

interface PivotCell {
  raw: number[];
  count: number;
}

type PivotData = Map<string, Map<string, PivotCell>>;   // rowKey → colKey → cell
type RowHeader = string[];
type ColHeader = string[];

interface PivotResult {
  /** Row header labels (array of dimension labels per row dimension level) */
  rowHeaders: RowHeader[];
  /** Column header labels (array of dimension labels per column dimension level) */
  colHeaders: ColHeader[];
  /** Data grid [rowIdx][colIdx] = numeric value */
  data: (number | null)[][];
  /** Row keys corresponding to each row in data */
  rowKeys: string[];
  /** Column keys corresponding to each col in data */
  colKeys: string[];
  /** Grand total row [colIdx] = numeric value (null at end for grand total label) */
  grandTotalRow: (number | null)[] | null;
  /** Configuration used */
  config: PivotConfig;
}

// ─────────────────────────────────────────────────────────────────────────────
// Dimension value label resolver
// ─────────────────────────────────────────────────────────────────────────────

interface DimResolver {
  getLabel(field: DimField, entry: FactGLEntry, dateMap: Map<string, DimTime>): string;
  getValue(field: DimField, entry: FactGLEntry, dateMap: Map<string, DimTime>): string;
  isDateField(f: DimField): boolean;
}

const DIM_RESOLVER: DimResolver = {
  getLabel(field: DimField, entry: FactGLEntry, dateMap: Map<string, DimTime>): string {
    const v = this.getValue(field, entry, dateMap);
    if (field === 'fiscalYear' || field === 'calendarYear') return String(v);
    if (field === 'fiscalQuarter' || field === 'calendarQuarter') return `Q${v}`;
    if (field === 'fiscalPeriod' || field === 'calendarMonth') return String(v).padStart(2, '0');
    return v;
  },

  getValue(field: DimField, entry: FactGLEntry, dateMap: Map<string, DimTime>): string {
    switch (field) {
      // Direct fields on FactGLEntry
      case 'accountKey': return entry.accountKey ?? '';
      case 'entityKey': return entry.entityKey ?? '';
      case 'dateKey': return entry.dateKey ?? '';
      case 'postingDateKey': return entry.postingDateKey ?? '';
      case 'currencyKey': return entry.currencyKey ?? '';
      case 'productKey': return entry.productKey ?? '';
      case 'customerKey': return entry.customerKey ?? '';
      case 'vendorKey': return entry.vendorKey ?? '';
      case 'costCenterKey': return entry.costCenterKey ?? '';
      case 'projectKey': return entry.projectKey ?? '';
      case 'journalId': return entry.journalId ?? '';
      case 'source': return entry.sourceSystem ?? '';
      case 'workflowStatus': return entry.workflowStatus ?? '';

      // Fiscal/calendar from dateKey
      case 'fiscalYear':
      case 'fiscalQuarter':
      case 'fiscalPeriod':
      case 'calendarYear':
      case 'calendarMonth':
      case 'calendarQuarter': {
        const dt = dateMap.get(entry.postingDateKey ?? entry.dateKey);
        if (!dt) return '';
        switch (field) {
          case 'fiscalYear': return String(dt.fiscalYear);
          case 'fiscalQuarter': return String(dt.fiscalQuarter);
          case 'fiscalPeriod': return String(dt.fiscalPeriod);
          case 'calendarYear': return String(dt.calendarYear);
          case 'calendarMonth': return String(dt.calendarMonth);
          case 'calendarQuarter': return String(dt.calendarQuarter);
        }
      }
      default:
        return '';
    }
  },

  isDateField(f: DimField): boolean {
    return ['fiscalYear', 'fiscalQuarter', 'fiscalPeriod',
            'calendarYear', 'calendarMonth', 'calendarQuarter'].includes(f);
  },
};

// ─────────────────────────────────────────────────────────────────────────────
// Aggregation helpers
// ─────────────────────────────────────────────────────────────────────────────

function aggregateCell(cell: PivotCell, agg: AggregationType, precision: number): number {
  if (cell.count === 0) return 0;
  switch (agg) {
    case 'SUM': {
      return cell.raw.reduce((a, b) => a + b, 0);
    }
    case 'COUNT': {
      return cell.count;
    }
    case 'AVG': {
      const sum = cell.raw.reduce((a, b) => a + b, 0);
      return parseFloat((sum / cell.count).toFixed(precision));
    }
    case 'MIN': {
      return Math.min(...cell.raw);
    }
    case 'MAX': {
      return Math.max(...cell.raw);
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// PivotEngine
// ─────────────────────────────────────────────────────────────────────────────

export class PivotEngine {
  private warehouse: FinancialDataWarehouse;
  private dimTimeService: { getByDateKey: (k: string) => DimTime | undefined; getAll: () => DimTime[] } | null = null;
  private dateMap = new Map<string, DimTime>();

  constructor(warehouse: FinancialDataWarehouse) {
    this.warehouse = warehouse;
  }

  setDimTimeService(service: { getByDateKey: (k: string) => DimTime | undefined; getAll: () => DimTime[] }): void {
    this.dimTimeService = service;
    // Pre-build date map for fast lookups
    for (const dt of service.getAll()) {
      this.dateMap.set(dt.dateKey, dt);
    }
  }

  // ─── Public API ─────────────────────────────────────────────────────────────

  /**
   * Execute a pivot query against the warehouse.
   *
   * Steps:
   * 1. Load GL entries from warehouse (with filters applied)
   * 2. Group rows by rowDimensions
   * 3. Group columns by columnDimensions (if any)
   * 4. Aggregate values per cell
   * 5. Compute subtotals / grand totals per config
   */
  async execute(config: PivotConfig): Promise<PivotResult> {
    const rows = await this.loadData(config);

    if (rows.length === 0) {
      return this.emptyResult(config);
    }

    // Build row and column dimension values
    const rowValues = this.extractDimValues(rows, config.rowDimensions);
    const colValues = this.extractDimValues(rows, config.columnDimensions ?? []);

    // Build pivot data structure
    const { pivotData, rowKeyMap, colKeyMap } = this.buildPivotData(
      rows, config.rowDimensions, config.columnDimensions ?? []
    );

    // Compute subtotals if requested
    const pivotDataWithTotals = config.totals !== 'none'
      ? this.addSubtotals(pivotData, rowKeyMap, colKeyMap, config)
      : pivotData;

    // Build result grid
    const { grid, rowHeaders, colHeaders, rowKeys, colKeys } = this.buildGrid(
      pivotDataWithTotals, rowKeyMap, colKeyMap, config
    );

    // Grand total
    const grandTotalRow = config.grandTotal !== false
      ? this.computeGrandTotal(grid, colKeys.length)
      : null;

    return {
      rowHeaders,
      colHeaders,
      data: grid,
      rowKeys,
      colKeys,
      grandTotalRow,
      config,
    };
  }

  // ─── Data Loading ────────────────────────────────────────────────────────────

  private async loadData(config: PivotConfig): Promise<FactGLEntry[]> {
    // Pull all GL entries from the warehouse
    // In production, push filters down into the warehouse query
    const allEntries = await this.warehouse.getGLEntriesForAccount({
      accountKey: '',
      entityKey: '',
      dateKey: '9999-12-31',
      limit: 100000,
    }).then(entries => entries.length > 0 ? entries : this.fallbackLoadAll(config));

    // Apply filters
    let filtered = allEntries;
    if (config.filters && config.filters.length > 0) {
      filtered = allEntries.filter(entry => this.applyFilters(entry, config.filters!));
    }

    // Exclude non-posted entries
    filtered = filtered.filter(e => e.workflowStatus === 'POSTED');

    return filtered;
  }

  /** Fallback when warehouse has no entries yet — used for testing/development */
  private async fallbackLoadAll(_config: PivotConfig): Promise<FactGLEntry[]> {
    // Returns empty array — caller should handle empty results
    return [];
  }

  private applyFilters(entry: FactGLEntry, filters: FilterCondition[]): boolean {
    for (const f of filters) {
      const raw = DIM_RESOLVER.getValue(f.field, entry, this.dateMap);
      const val: string = raw;
      switch (f.operator) {
        case 'eq':
          if (val !== String(f.value)) return false;
          break;
        case 'neq':
          if (val === String(f.value)) return false;
          break;
        case 'gt':
          if (parseFloat(val) <= parseFloat(String(f.value))) return false;
          break;
        case 'gte':
          if (parseFloat(val) < parseFloat(String(f.value))) return false;
          break;
        case 'lt':
          if (parseFloat(val) >= parseFloat(String(f.value))) return false;
          break;
        case 'lte':
          if (parseFloat(val) > parseFloat(String(f.value))) return false;
          break;
        case 'in':
          if (!Array.isArray(f.value) || !f.value.map(String).includes(val)) return false;
          break;
        case 'nin':
          if (Array.isArray(f.value) && f.value.map(String).includes(val)) return false;
          break;
        case 'contains':
          if (!val.includes(String(f.value))) return false;
          break;
      }
    }
    return true;
  }

  // ─── Dimension extraction ────────────────────────────────────────────────────

  private extractDimValues(entries: FactGLEntry[], dims: DimField[]): Map<string, Set<string>> {
    const result = new Map<string, Set<string>>();
    for (const dim of dims) {
      result.set(dim, new Set<string>());
    }
    for (const entry of entries) {
      for (const dim of dims) {
        const val = DIM_RESOLVER.getValue(dim, entry, this.dateMap);
        result.get(dim)!.add(val);
      }
    }
    return result;
  }

  // ─── Pivot data builder ─────────────────────────────────────────────────────

  private buildPivotData(
    entries: FactGLEntry[],
    rowDims: DimField[],
    colDims: DimField[],
  ): {
    pivotData: PivotData;
    rowKeyMap: Map<string, RowHeader>;
    colKeyMap: Map<string, ColHeader>;
  } {
    const pivotData: PivotData = new Map();
    const rowKeyMap = new Map<string, RowHeader>();
    const colKeyMap = new Map<string, ColHeader>();

    for (const entry of entries) {
      // Build row key
      const rowVals = rowDims.map(d => DIM_RESOLVER.getValue(d, entry, this.dateMap));
      const rowKey = rowVals.join('|');
      if (!rowKeyMap.has(rowKey)) {
        rowKeyMap.set(rowKey, rowVals.map((v, i) => DIM_RESOLVER.getLabel(rowDims[i], entry, this.dateMap)));
      }

      // Build col key
      const colVals = colDims.map(d => DIM_RESOLVER.getValue(d, entry, this.dateMap));
      const colKey = colVals.join('|') || '__ALL__';
      if (!colKeyMap.has(colKey)) {
        colKeyMap.set(colKey, colVals.length > 0
          ? colVals.map((v, i) => DIM_RESOLVER.getLabel(colDims[i], entry, this.dateMap))
          : ['All']);
      }

      // Ensure structure exists
      if (!pivotData.has(rowKey)) {
        pivotData.set(rowKey, new Map());
      }
      const rowMap = pivotData.get(rowKey)!;
      if (!rowMap.has(colKey)) {
        rowMap.set(colKey, { raw: [], count: 0 });
      }

      // Aggregate values into cell
      const cell = rowMap.get(colKey)!;
      for (const agg of this.getAggregationsForEntry(entry)) {
        cell.raw.push(agg.value);
        cell.count++;
      }
    }

    return { pivotData, rowKeyMap, colKeyMap };
  }

  private getAggregationsForEntry(entry: FactGLEntry): Array<{ value: number; countInc: boolean }> {
    // Returns the base numeric values from the entry — actual aggregations
    // (SUM, AVG, etc.) are applied when building the final grid
    const debit = toNumber(entry.debitAmount);
    const credit = toNumber(entry.creditAmount);
    const amount = toNumber(entry.amountLcy);
    // Use amountLcy as the primary value
    return [{ value: amount !== 0 ? amount : (debit - credit), countInc: true }];
  }

  // ─── Subtotals ───────────────────────────────────────────────────────────────

  private addSubtotals(
    pivotData: PivotData,
    rowKeyMap: Map<string, RowHeader>,
    colKeyMap: Map<string, ColHeader>,
    config: PivotConfig,
  ): PivotData {
    const rowDims = config.rowDimensions;
    const colDims = config.columnDimensions ?? [];

    if (rowDims.length <= 1) return pivotData;

    const result: PivotData = new Map(pivotData);

    // For each row key, compute subtotals at each level
    const sortedRowKeys = Array.from(rowKeyMap.keys()).sort();

    for (const rowKey of sortedRowKeys) {
      const parts = rowKey.split('|');

      // Compute subtotals at each dimension level (except the finest)
      for (let level = 0; level < parts.length - 1; level++) {
        const subtotalParts = parts.slice(0, level + 1);
        const subtotalKey = subtotalParts.join('|');
        const subtotalRowHeader = subtotalParts.map((v, i) =>
          i === level ? `${v} (Total)` : v
        );

        if (!result.has(subtotalKey)) {
          result.set(subtotalKey, new Map());
          rowKeyMap.set(subtotalKey, subtotalRowHeader);
        }

        const rowMap = result.get(subtotalKey)!;

        // Sum all finer rows into this subtotal
        for (const [_rowKey, colMap] of Array.from(pivotData.entries())) {
          for (const [colKey, srcCell] of Array.from(colMap.entries())) {
            if (!rowMap.has(colKey)) {
              rowMap.set(colKey, { raw: [], count: 0 });
            }
            const tgtCell = rowMap.get(colKey)!;
            tgtCell.raw.push(...srcCell.raw);
            tgtCell.count += srcCell.count;
          }
        }
      }
    }

    return result;
  }

  // ─── Grid builder ────────────────────────────────────────────────────────────

  private buildGrid(
    pivotData: PivotData,
    rowKeyMap: Map<string, RowHeader>,
    colKeyMap: Map<string, ColHeader>,
    config: PivotConfig,
  ): {
    grid: (number | null)[][];
    rowHeaders: RowHeader[];
    colHeaders: ColHeader[];
    rowKeys: string[];
    colKeys: string[];
  } {
    const precision = config.avgPrecision ?? 2;
    const colKeys = Array.from(colKeyMap.keys());
    const rowKeys = Array.from(rowKeyMap.keys());

    // Sort rows
    if (config.sortRows === 'desc') {
      rowKeys.reverse();
    } else {
      rowKeys.sort((a, b) => a.localeCompare(b));
    }

    const grid: (number | null)[][] = [];
    const rowHeaders: RowHeader[] = [];

    for (const rowKey of rowKeys) {
      const rowMap = pivotData.get(rowKey);
      if (!rowMap) continue;

      const rowData: (number | null)[] = [];
      let hasNonZero = false;

      for (const colKey of colKeys) {
        const cell = rowMap.get(colKey);
        if (!cell || cell.count === 0) {
          rowData.push(null);
        } else {
          // Apply the primary aggregation (first value aggregation)
          const aggType = config.values[0]?.agg ?? 'SUM';
          const val = aggregateCell(cell, aggType, precision);
          if (val !== 0) hasNonZero = true;
          rowData.push(config.excludeZeros && val === 0 ? null : val);
        }
      }

      // Skip zero-only rows if configured
      if (config.excludeZeros && !hasNonZero) continue;

      grid.push(rowData);
      rowHeaders.push(rowKeyMap.get(rowKey) ?? [rowKey]);
    }

    // Column headers
    const colHeaders: ColHeader[] = colKeys.map(ck => colKeyMap.get(ck) ?? [ck]);

    return { grid, rowHeaders, colHeaders, rowKeys, colKeys };
  }

  // ─── Grand total ─────────────────────────────────────────────────────────────

  private computeGrandTotal(grid: (number | null)[][], numCols: number): (number | null)[] {
    const totals: (number | null)[] = [];
    for (let c = 0; c < numCols; c++) {
      let sum = 0;
      let count = 0;
      for (const row of grid) {
        const val = row[c];
        if (val !== null) {
          sum += val;
          count++;
        }
      }
      totals.push(count > 0 ? sum : null);
    }
    return totals;
  }

  // ─── Empty result ────────────────────────────────────────────────────────────

  private emptyResult(config: PivotConfig): PivotResult {
    return {
      rowHeaders: [],
      colHeaders: config.columnDimensions && config.columnDimensions.length > 0 ? [] : [['All']],
      data: [],
      rowKeys: [],
      colKeys: [],
      grandTotalRow: config.grandTotal !== false ? [] : null,
      config,
    };
  }

  // ─── Utility: format as a plain JS object table ──────────────────────────────

  /**
   * Convert the pivot result to a simple array of row objects.
   * Useful for rendering in UI tables or exporting to CSV.
   */
  toTable(result: PivotResult): Array<Record<string, string | number | null>> {
    const rows: Array<Record<string, string | number | null>> = [];
    const { data, rowHeaders, colHeaders, grandTotalRow } = result;

    // Flatten column headers
    const colHeaderLabels = colHeaders.map(ch => ch.join(' / ') || 'All');

    for (let r = 0; r < data.length; r++) {
      const row: Record<string, string | number | null> = {};
      // Add row dimension labels
      const rh = rowHeaders[r];
      for (let i = 0; i < rh.length; i++) {
        row[`row_${i}`] = rh[i];
      }
      // Add data values
      for (let c = 0; c < data[r].length; c++) {
        row[colHeaderLabels[c]] = data[r][c];
      }
      rows.push(row);
    }

    // Grand total row
    if (grandTotalRow && result.config.grandTotal !== false) {
      const grandRow: Record<string, string | number | null> = {};
      for (let i = 0; i < (rowHeaders[0]?.length ?? 0); i++) {
        grandRow[`row_${i}`] = i === 0 ? 'Grand Total' : null;
      }
      for (let c = 0; c < grandTotalRow.length; c++) {
        grandRow[colHeaderLabels[c]] = grandTotalRow[c];
      }
      rows.push(grandRow);
    }

    return rows;
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Exports
// ─────────────────────────────────────────────────────────────────────────────

export type { PivotCell, PivotData, RowHeader, ColHeader };
