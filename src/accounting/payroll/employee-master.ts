/**
 * Employee Master — Employee records, pay types, tax elections
 */

export enum EmployeeStatus { ACTIVE = 'active', ON_LEAVE = 'on_leave', TERMINATED = 'terminated' }
export enum PayFrequency { WEEKLY = 'weekly', BIWEEKLY = 'biweekly', SEMIMONTHLY = 'semimonthly', MONTHLY = 'monthly' }
export enum PayType { SALARY = 'salary', HOURLY = 'hourly', COMMISSION = 'commission' }

export interface EmployeeAddress { street: string; city: string; state: string; zip: string; }
export interface EmployeeEmergencyContact { name: string; relationship: string; phone: string; }
export interface EmployeeTaxElection {
  federalFilingStatus: 'single' | 'married' | 'head_of_household';
  federalAllowances: number; federalAdditionalWithholding: number;
  stateFilingStatus: string; stateAllowances: number; stateAdditionalWithholding: number;
  localFilingStatus?: string; localAllowances?: number;
}

export interface Employee {
  id: string; companyId: string; status: EmployeeStatus;
  firstName: string; lastName: string; email: string;
  ssn: string; hireDate: Date; terminationDate?: Date;
  payType: PayType; payFrequency: PayFrequency; payRate: number;
  address: EmployeeAddress;
  emergencyContact: EmployeeEmergencyContact;
  taxElection: EmployeeTaxElection;
  departmentId: string; managerId?: string;
  bankAccount?: { bankName: string; routingNumber: string; accountNumber: string; };
  createdAt: Date; updatedAt: Date;
}

export class EmployeeMasterService {
  private storage = new Map<string, Employee>();
  private idCounter = 0;
  private nextId(): string { return `emp_${Date.now()}_${++this.idCounter}`; }

  async create(employee: Omit<Employee, 'id' | 'createdAt' | 'updatedAt'>): Promise<Employee> {
    const emp: Employee = { ...employee, id: this.nextId(), createdAt: new Date(), updatedAt: new Date() };
    this.storage.set(emp.id, emp);
    return emp;
  }
  async getById(id: string): Promise<Employee | null> { return this.storage.get(id) || null; }
  async update(id: string, updates: Partial<Employee>): Promise<Employee> {
    const e = this.storage.get(id);
    if (!e) throw new Error(`Employee ${id} not found`);
    const updated = { ...e, ...updates, id: e.id, createdAt: e.createdAt, updatedAt: new Date() };
    this.storage.set(id, updated);
    return updated;
  }
  async list(filters?: { status?: EmployeeStatus; departmentId?: string; }): Promise<Employee[]> {
    let emps = Array.from(this.storage.values());
    if (filters?.status) emps = emps.filter(e => e.status === filters.status);
    if (filters?.departmentId) emps = emps.filter(e => e.departmentId === filters.departmentId);
    return emps;
  }
  async terminate(id: string, terminationDate: Date): Promise<Employee> {
    return this.update(id, { status: EmployeeStatus.TERMINATED as EmployeeStatus, terminationDate });
  }
}
