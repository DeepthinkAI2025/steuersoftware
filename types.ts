export enum View {
  DOCUMENTS = 'documents',
  SETTINGS = 'settings',
  ANALYSIS = 'analysis',
  RULES = 'rules',
  DEADLINES = 'deadlines',
  LEXOFFICE = 'lexoffice',
  PROFILE = 'profile',
  FÖRDERUNGEN = 'förderungen',
  BUCHHALTUNG = 'buchhaltung',
  BUCHHALTUNG_BELEGE = 'buchhaltung-belege',
  BUCHHALTUNG_EUR = 'buchhaltung-eur',
  BUCHHALTUNG_MELDUNGEN = 'buchhaltung-steuerliche-meldungen',
  BUCHHALTUNG_BUCHUNGEN = 'buchhaltung-buchungen',
}

export enum DocumentSource {
  MANUAL = 'Manuell',
  LOCAL = 'Lokaler PC',
  EMAIL = 'E-Mail',
  WHATSAPP = 'WhatsApp',
  LEXOFFICE = 'Lexoffice',
}

export enum DocumentStatus {
  OK = 'OK',
  MISSING_INVOICE = 'Rechnung fehlt',
  SCREENSHOT = 'Screenshot',
  ANALYZING = 'Analysiere...',
  POTENTIAL_DUPLICATE = 'Mögliches Duplikat',
  ARCHIVED = 'Archiviert',
  ERROR = 'Fehler',
}

export enum InvoiceType {
  INCOMING = 'Eingangsrechnung',
  OUTGOING = 'Ausgangsrechnung',
}

export enum LexofficeStatus {
    NOT_SENT = 'Nicht gesendet',
    SUCCESS = 'Erfolgreich',
    FAILED = 'Fehlgeschlagen',
}

export enum StorageLocationType {
  DIGITAL = 'Digital',
  PHYSICAL = 'Physisch',
  ARCHIVE = 'Archiv',
  LEXOFFICE = 'Lexoffice',
}

export interface StorageLocation {
  id: string;
  label: string;
  type: StorageLocationType;
  description?: string;
  isDefault?: boolean;
}

export const DEFAULT_DIGITAL_STORAGE_ID = 'storage-default-digital';

export interface DocumentFilter {
  year: number;
  quarter?: number;
}

export interface Rule {
  id: string;
  conditionType: 'vendor' | 'textContent';
  conditionValue: string;
  invoiceType: InvoiceType;
  resultCategory: string;
}

export interface RuleSuggestion {
  vendor: string;
  taxCategory: string;
  invoiceType: InvoiceType;
}

export interface UserProfile {
  name: string;
  taxId: string;
  vatId: string;
  taxNumber: string;
  companyForm: string;
  profilePicture?: string;
}

export interface Document {
  id: string;
  name: string;
  date: Date;
  year: number;
  quarter: number;
  source: DocumentSource;
  status: DocumentStatus;
  fileUrl: string;
  file?: File;
  textContent?: string;
  vendor?: string;
  totalAmount?: number;
  vatAmount?: number;
  invoiceNumber?: string;
  invoiceType: InvoiceType;
  taxCategory?: string;
  lexoffice?: {
    status: LexofficeStatus;
    sentAt: Date;
  };
  errorMessage?: string;
  storageLocationId?: string;
  tags?: string[];
  linkedTransactionIds?: string[];
  ocrMetadata?: DocumentOcrMetadata;
}

export interface GeminiAnalysisResult {
    isInvoice: boolean;
    isOrderConfirmation: boolean;
    isEmailBody: boolean;
    documentDate: string; // ISO 8601 format
    textContent: string;
    vendor: string;
    totalAmount: number;
    vatAmount: number;
    invoiceNumber: string;
    invoiceType: InvoiceType;
    taxCategory: string;
    averageConfidence?: number;
    fieldConfidences?: OcrFieldConfidence[];
    warnings?: string[];
    suggestedStorageLocationId?: string;
    pageCount?: number;
}

export interface ChatMessage {
  role: 'user' | 'model';
  content: string;
  rawContent?: string; // Original, unmodified text from the model
  documentId?: string;
}

export interface Deadline {
  id: string;
  title: string;
  dueDate: Date;
  remainingDays: number;
}

export interface NotificationSettings {
  notify14Days: boolean;
  notify1Day: boolean;
}

export interface FundingOpportunity {
  id: string;
  title: string;
  source: string;
  description: string;
  eligibilitySummary: string;
  link: string;
}

export interface OcrFieldConfidence {
  field: string;
  value: string;
  confidence: number;
  confidenceDescription?: string;
}

export interface DocumentOcrMetadata {
  averageConfidence: number;
  analysedAt: Date;
  engineVersion: string;
  pageCount?: number;
  fields: OcrFieldConfidence[];
  warnings?: string[];
}

export enum TransactionStatus {
  COMPLETE = 'complete',
  MISSING_RECEIPT = 'missing_receipt',
  DRAFT = 'draft',
}

export enum TransactionSource {
  MANUAL = 'manual',
  LEXOFFICE = 'lexoffice',
  AI = 'ai',
}

export interface AccountingTransaction {
  id: string;
  externalId?: string;
  date: Date;
  description: string;
  amount: number;
  invoiceType: InvoiceType;
  taxCategory: string;
  documentId?: string;
  status: TransactionStatus;
  source: TransactionSource;
  notes?: string;
  createdAt: Date;
  updatedAt: Date;
}

export enum TaskStatus {
  OPEN = 'open',
  IN_PROGRESS = 'in_progress',
  DONE = 'done',
}

export enum TaskPriority {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export interface TaskItem {
  id: string;
  title: string;
  description?: string;
  status: TaskStatus;
  priority: TaskPriority;
  relatedTransactionId?: string;
  relatedDocumentId?: string;
  dueDate?: Date;
  createdAt: Date;
  completedAt?: Date;
}

export interface LexofficeImportResult {
  transactions: AccountingTransaction[];
  documents?: Document[];
  summary: {
    imported: number;
    updated: number;
    skipped: number;
    missingReceipts: number;
  };
}

export enum UStVAStatus {
  DRAFT = 'draft',
  READY = 'ready',
  SUBMITTED = 'submitted',
  ACCEPTED = 'accepted',
  REJECTED = 'rejected',
}

export interface UStVAQuarterData {
  // Umsätze
  umsatzsteuerpflichtigeUmsaetze: number; // Feld 81
  umsaetzeInnergemeinschaftlicheLieferungen: number; // Feld 41
  steuerfreieUmsaetze: number; // Feld 43
  steuerfreieUmsaetze13b: number; // Feld 53
  
  // Vorsteuer
  vorsteuerbetrag: number; // Feld 66
  vorsteuerAusInvestitionen: number; // Feld 67
  
  // Berechnete Steuer
  umsatzsteuer: number; // Feld 81 * 19%
  abziehbareVorsteuer: number; // Feld 66 + 67
  zahllast: number; // Umsatzsteuer - abziehbare Vorsteuer
  
  // Sonstige Felder
  steuerermaessigung: number; // Feld 62
  sonstigeBetriebsausgaben: number; // Feld 68
  
  // Berechnungsbasis
  transactions: AccountingTransaction[];
  period: {
    year: number;
    quarter: number;
    startDate: Date;
    endDate: Date;
  };
}

export interface UStVA {
  id: string;
  year: number;
  quarter: number;
  status: UStVAStatus;
  data: UStVAQuarterData;
  createdAt: Date;
  updatedAt: Date;
  submittedAt?: Date;
  elsterReference?: string;
  notes?: string;
}

export interface UStVAField {
  id: string;
  label: string;
  description: string;
  value: number;
  isCalculated: boolean;
  formula?: string;
}
