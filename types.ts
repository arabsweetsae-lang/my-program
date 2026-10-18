
export interface Expense {
  id: string;
  description: string;
  amount: number;
  notes?: string;
}

export interface BranchData {
  id: string;
  branchName: string;
  date: string;
  cashier1Sales: number;
  totalBranchSales: number;
  openingBalance: number; // النقد المتبقي من أمس
  cashReceived: number;
  visaReceived: number;
  expenses: Expense[];
  adminName: string;
}

export interface Settings {
  companyName: string;
  companyLogo: string;
  adminFullName: string;
  adminPassword: string;
  currency: string;
  branches: string[];
}

export interface AppState {
  isLoggedIn: boolean;
  settings: Settings;
  dailyEntries: Record<string, Record<string, BranchData>>; // branchId -> date -> data
}
