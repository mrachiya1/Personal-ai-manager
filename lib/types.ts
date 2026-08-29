// Types mirror the Notion database schemas 1:1 (see claude/orex-os-build-status.md
// in the project) so swapping mockData.ts for a real Notion API client later
// is a mechanical change, not a rewrite.

export type CompanyType = "Studio" | "SaaS" | "Agency" | "Other";

export interface Company {
  id: string;
  name: string;
  type: CompanyType;
  startDate?: string;
  goals?: string;
  description?: string;
  monthlyRevenueTarget?: number;
  plan?: string;
  colorVar: "--blue" | "--orange" | "--aqua" | "--violet" | "--magenta" | "--yellow";
}

export type RuleCategory = "Numerology" | "Astro" | "Personal Pattern" | "Company-specific";

export interface CoreRule {
  id: string;
  rule: string;
  category: RuleCategory;
  condition: string;
  guidance: string;
  active: boolean;
  appliesToCompanyId?: string;
}

export type ProjectStatus = "Idea" | "Planning" | "Production" | "Rendering-Ready" | "Delivered";
export type RenderPriority = "High" | "Medium" | "Low";

export interface Project {
  id: string;
  name: string;
  companyId: string;
  clientId?: string;
  category: string[];
  status: ProjectStatus;
  description?: string;
  deadline?: string;
  renderPriority?: RenderPriority;
  estimatedRenderHours?: number;
  value?: number;

  /* Added for the projects workspace. Every one of these is optional: the
     Notion properties behind them are created on demand (lib/projectSchema.ts),
     so a database that predates them still reads cleanly as undefined rather
     than throwing. */

  /** Team member ids doing the work. */
  assignedTo: string[];
  startDate?: string;
  /** One-line summary shown under the project name. */
  headline?: string;
  /** Extra things the client has asked for, beyond the original scope. */
  clientRequests?: string;
  lastReviewed?: string;
  /** Team member ids who performed that review. */
  reviewedBy: string[];
  /** Notion's own last_edited_time — no property needed, it is always present. */
  lastEditedTime?: string;
  /** Attachments on the project page. */
  files: ProjectFile[];

  /* The completion-feel loop. Written when a project is marked delivered, so
     the advisor can correlate how work felt against what was going on that
     week. All optional — a database without the properties reads undefined. */
  completionFeel?: string;
  completionNote?: string;
  completedOn?: string;

  /** Whatever else is on the Notion page — user-added columns, read by name. */
  custom: Record<string, string | number | boolean | string[] | undefined>;
}

export interface ProjectFile {
  name: string;
  /** Notion-hosted URLs are signed and expire after about an hour, so they are
   *  fetched fresh on each page render rather than stored anywhere. */
  url: string;
  /** "file" = uploaded to Notion, "external" = a link someone pasted in. */
  kind: "file" | "external";
}

export type TaskStatus = "Backlog" | "In Progress" | "Done" | "Blocked";

export interface Task {
  id: string;
  title: string;
  projectId: string;
  status: TaskStatus;
  dueDate?: string;
  tags?: string[];
  /**
   * The task this one sits under, if any.
   *
   * A task with no parent is a milestone directly under its project; a task
   * with one is a sub-task at whatever depth its chain runs to. Nesting is a
   * property of the data rather than three named levels in the code, so
   * "Showreel -> Shot 01 -> Lighting -> Turntable pass" needs no schema change.
   */
  parentTaskId?: string;
  startDate?: string;
  priority?: string;
  assignedTo: string[];
  /** Resource links and attachments on this task specifically. */
  files: AttachedFile[];
  /** The preview image stored in Notion, when there is one. */
  thumbnail?: AttachedFile;
  /** Notion's own stamp, so "Updated" on a sub-row is a fact, not a guess. */
  lastEditedTime?: string;
}

export interface AttachedFile {
  name: string;
  url: string;
}

export type ClientRelationship = "Lead" | "Active" | "VIP" | "Past";

export interface ClientRecord {
  id: string;
  name: string;
  email?: string;
  phone?: string;
  country?: string;
  companyId: string;
  relationship: ClientRelationship;
  preferredContact?: string;
  referredBy?: string;
  lastContact?: string;
  nextFollowUp?: string;
  onTimePaymentRate?: number;
  notes?: string;
  tags?: string[];
  avatarInitial: string;
  avatarGradient: string;
}

export type PaymentStatus = "Pending" | "Partially Paid" | "Paid" | "Overdue";

export interface Payment {
  id: string;
  label: string;
  clientId: string;
  projectId?: string;
  amount: number;
  currency?: string;
  dueDate?: string;
  paidDate?: string;
  status: PaymentStatus;
  linkedIncomeId?: string;
}

export type IdeaPriority = "Now" | "Later" | "Someday";

export interface Idea {
  id: string;
  idea: string;
  description?: string;
  tags?: string[];
  linkedCompanyId?: string;
  linkedProjectId?: string;
  priority: IdeaPriority;
}

export type LearningProgress = "Not Started" | "In Progress" | "Completed";

export interface LearningTopic {
  id: string;
  topic: string;
  description?: string;
  resources?: string;
  progress: LearningProgress;
  sessionNotes?: string;
  /** Notion's own created_time — always present, no property required. */
  createdTime?: string;
  /** Optional "Completion" number column, 0-100, if the database has one. */
  completion?: number;
  /** Optional "Target Date" column, if the database has one. */
  targetDate?: string;
}

export interface FinanceGoal {
  id: string;
  goal: string;
  type: "Personal" | "Company";
  targetAmount: number;
  currentAmount: number;
  deadline?: string;
  linkedCompanyId?: string;
  linkedAccountId?: string;
  linkedProjectId?: string;
  /** Notion's own created_time, used to show elapsed time against a deadline. */
  createdTime?: string;
}

export interface WishlistItem {
  id: string;
  item: string;
  category?: string;
  estimatedCost?: number;
  priority: "High" | "Medium" | "Low";
}

export interface DailyLog {
  id: string;
  date: string;
  moodScore?: number;
  energyLevel?: "Low" | "Medium" | "High";
  notes?: string;
  aiDailyPlan?: string;
}

export interface AstroEvent {
  id: string;
  name: string;
  eventDate: string;
  keyTransits?: string;
  aiInterpretation?: string;
}

export interface SleepLog {
  id: string;
  name: string;
  sleepTime?: string; // ISO datetime
  wakeTime?: string; // ISO datetime
  durationHours?: number;
  notes?: string;
}

export interface TimelineEvent {
  id: string;
  title: string;
  meta: string;
  colorVar: string;
}

export interface TeamMember {
  id: string;
  name: string;
  role?: string;
  companyId?: string;
  email?: string;
  phone?: string;
  status: "Active" | "Inactive";
  notes?: string;
}

export type ExpenseCategory = "Subscription" | "Software" | "Fuel" | "Salary" | "Rent" | "Donation" | "Other";

export interface Expense {
  id: string;
  name: string;
  category: ExpenseCategory;
  amount: number;
  currency?: "LKR" | "USD";
  vendor?: string;
  date?: string;
  recurring: boolean;
  companyId?: string;
  accountId?: string;
  notes?: string;
}

export type IncomeSource = "Client Payment" | "Salary" | "Freelance" | "Investment" | "Gift" | "Donation Received" | "Other";

export interface Income {
  id: string;
  name: string;
  source: IncomeSource;
  amount: number;
  currency?: string;
  date?: string;
  recurring: boolean;
  companyId?: string;
  accountId?: string;
  notes?: string;
  linkedPaymentId?: string;
}

export type AccountType = "Bank" | "Investment" | "Cash" | "Credit Card" | "Other";

export interface Account {
  id: string;
  name: string;
  type: AccountType;
  balance: number;
  currency?: string;
  institution?: string;
  lastUpdated?: string;
  notes?: string;
}
