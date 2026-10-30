export type UtilityType = "LIGHTING" | "AC" | "WATER";

export type Snapshot = {
  id: string;
  moneyCents: number;
  volumeHundredths: number;
  schoolUpdatedAt: string;
  capturedAt: string;
};

export type AlertRule = {
  id: string;
  accountId: string;
  moneyThresholdCents: number;
  volumeThresholdHundredths: number | null;
  forecastDays: number;
  enabled: boolean;
  cooldownHours: number;
  lastAlertLevel: string | null;
  lastAlertAt: string | null;
};

export type Account = {
  id: string;
  type: UtilityType;
  displayName: string;
  unit: string;
  alertRule: AlertRule | null;
  latest: Snapshot | null;
  history: Snapshot[];
};

export type OpenIdInfo = {
  id: string;
  mask: string;
  status: string;
  lastSuccessAt: string | null;
  lastError: string | null;
};

export type Student = {
  id: string;
  name: string;
  email: string;
};

export type DormRecipient = {
  id: string;
  name: string | null;
  email: string;
};

export type AlertEvent = {
  id: string;
  dormId: string;
  dormName: string | null;
  accountId: string | null;
  accountName: string | null;
  level: string;
  metric: string | null;
  valueCents: number | null;
  valueHundredths: number | null;
  status: string;
  recipients: string;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
};

export type MemberRecord = {
  id: string;
  name: string;
  email: string;
  dormId: string;
  dormName: string;
  createdAt: string;
};

export type AlertDormSummary = {
  dormId: string;
  dormName: string;
  total: number;
  criticalCount: number;
  lastAlertAt: string | null;
};

export type ScrapeRun = {
  id: string;
  dormId?: string;
  dormName?: string;
  trigger?: string;
  status: string;
  startedAt: string;
  finishedAt: string | null;
  durationMs: number | null;
  error: string | null;
};

export type Dashboard = {
  dorm: {
    id: string;
    name: string;
    building: string | null;
    room: string | null;
  } | null;
  accounts: Account[];
  openId: OpenIdInfo | null;
  students: Student[];
  recipients: DormRecipient[];
  alerts: AlertEvent[];
  lastRun: ScrapeRun | null;
};

export type DormLatest = {
  accountId: string;
  type: UtilityType;
  displayName: string;
  unit: string;
  moneyCents: number | null;
  volumeHundredths: number | null;
  schoolUpdatedAt: string | null;
  capturedAt: string | null;
};

export type DormSummary = {
  id: string;
  name: string;
  building: string | null;
  room: string | null;
  latest: DormLatest[];
  openId: OpenIdInfo | null;
  lastRun: ScrapeRun | null;
};

export type Paginated<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};

export type SnapshotRecord = {
  id: string;
  accountId: string;
  accountName: string;
  accountType: UtilityType;
  accountUnit: string;
  moneyCents: number;
  volumeHundredths: number;
  schoolUpdatedAt: string;
  capturedAt: string;
};

export type TimeSeriesPoint = {
  id: string;
  capturedAt: string;
  moneyCents: number;
  volumeHundredths: number;
  schoolUpdatedAt: string;
};

export type TimeSeriesAccount = {
  id: string;
  type: UtilityType;
  displayName: string;
  unit: string;
  points: TimeSeriesPoint[];
};

export type TimeSeries = {
  range: "24h" | "7d" | "30d";
  from: string;
  to: string;
  accounts: TimeSeriesAccount[];
};
