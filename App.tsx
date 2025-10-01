import React, { useState, useMemo, useEffect, useCallback, lazy, Suspense } from 'react';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import LoginView from './components/LoginView';
import RuleSuggestionToast from './components/RuleSuggestionToast';
import DeadlineNotification from './components/DeadlineNotification';
import ErrorBoundary from './components/ErrorBoundary';
import DuplicateComparisonModal from './components/DuplicateComparisonModal';
import DuplicateToast from './components/DuplicateToast';
import ApiErrorFallback from './components/ApiErrorFallback';
import { Document, DocumentStatus, View, Rule, InvoiceType, RuleSuggestion, NotificationSettings, Deadline, UserProfile, DocumentFilter, AccountingTransaction, TransactionStatus, TransactionSource, TaskItem, TaskStatus, TaskPriority, StorageLocation, StorageLocationType, DEFAULT_DIGITAL_STORAGE_ID } from './types';
import { getDeadlines } from './services/deadlineService';
import { analyzeDocument, getDocumentStatusFromAnalysis, buildOcrMetadataFromAnalysis } from './services/geminiService';
import { importFromLexoffice, upsertTransactionsFromLexoffice, buildDocumentFromLexoffice, setLexofficeLiveMode, getLexofficeLiveMode } from './services/lexofficeService';

// Lazy load heavy components
const DocumentsView = lazy(() => import('./components/DocumentsView'));
const SettingsView = lazy(() => import('./components/SettingsView'));
const AnalysisView = lazy(() => import('./components/AnalysisView'));
const RulesView = lazy(() => import('./components/RulesView'));
const DeadlinesView = lazy(() => import('./components/DeadlinesView'));
const LexofficeView = lazy(() => import('./components/LexofficeView'));
const IncomeStatementView = lazy(() => import('./components/IncomeStatementView'));
const TaxFilingsView = lazy(() => import('./components/TaxFilingsView'));
const ProfileView = lazy(() => import('./components/ProfileView'));
const FörderungenView = lazy(() => import('./components/FörderungenView'));
const AccountingView = lazy(() => import('./components/AccountingView'));
const ChatPanel = lazy(() => import('./components/ChatPanel'));
const DocumentDetailModal = lazy(() => import('./components/DocumentDetailModal'));

const initialRules: Rule[] = [
    { id: 'sys-1a', conditionType: 'textContent', conditionValue: 'ZOE Solar', invoiceType: InvoiceType.OUTGOING, resultCategory: 'Photovoltaik' },
    { id: 'sys-1b', conditionType: 'textContent', conditionValue: 'ZOE Solar, 19% MwSt, 19.00% USt', invoiceType: InvoiceType.OUTGOING, resultCategory: 'Einnahmen' },
    { id: 'sys-2', conditionType: 'vendor', conditionValue: 'Obeta, Bauhaus, Hornbach, Hellwig, Toom', invoiceType: InvoiceType.INCOMING, resultCategory: 'Material/Waren' },
    { id: 'sys-3', conditionType: 'vendor', conditionValue: 'Shell, Aral, Esso, Jet, Total', invoiceType: InvoiceType.INCOMING, resultCategory: 'Kraftstoff' },
    { id: 'sys-4', conditionType: 'textContent', conditionValue: 'Benzin, Diesel', invoiceType: InvoiceType.INCOMING, resultCategory: 'Kraftstoff' },
    { id: 'user-1', conditionType: 'vendor', conditionValue: 'Telekom, Vodafone, O2', invoiceType: InvoiceType.INCOMING, resultCategory: 'Kommunikation' },
    { id: 'user-2', conditionType: 'textContent', conditionValue: 'Büromiete', invoiceType: InvoiceType.INCOMING, resultCategory: 'Miete' },
];

export const DEFAULT_CHAT_PROMPT = `Du bist ein hochintelligenter KI-Steuerassistent, integriert in eine Belegverwaltungssoftware. Deine Aufgabe ist es, die Fragen des Benutzers präzise und kontextbezogen zu beantworten. Nutze dazu ausschließlich die folgenden, dir zur Verfügung gestellten Echtzeit-Daten aus der Anwendung.

Du bist befähigt, Lexoffice-Vorgänge eigenständig auszuführen. Wenn der Benutzer dich bittet, Belege oder Transaktionen aus Lexoffice zu importieren, darfst du das Werkzeug \`import_from_lexoffice\` einsetzen, anstatt den Benutzer auf eine manuelle Lösung zu verweisen.

**Formatierungsregeln für Antworten:**
- Antworte immer in natürlicher, hilfreicher Sprache.
- Formatiere deine Antworten klar und übersichtlich, nutze Markdown für Listen und **Fettdruck**.
- **WICHTIG:** Wenn du auf ein Dokument verweist, liste zuerst die relevanten Details auf. Platziere den Button zum Öffnen des Dokuments **danach** als separate, eigenständige Aktion. Das Format für den Button muss **IMMER** exakt \`%%DOC_BUTTON(id_des_dokuments)%%\` lauten. Betten Sie den Button-Platzhalter niemals in einen Satz ein.

**Beispiel für eine korrekte Antwort:**
Ich habe einen Beleg von Bauhaus gefunden:
* **Betrag:** 164,49 €
* **Datum:** 30.08.2025
* **Kategorie:** Material/Waren

%%DOC_BUTTON(d-12345)%%

**Werkzeuge:**
Du hast Zugriff auf die folgenden Werkzeuge:
- \`send_to_lexoffice\`: Sendet alle aktuell sichtbaren Belege an Lexoffice. Es hat keine Parameter.
- \`import_from_lexoffice\`: Importiert Transaktionen und Dokumente aus Lexoffice für einen bestimmten Zeitraum. Parameter: {"dateRange": {"start": "YYYY-MM-DD", "end": "YYYY-MM-DD"}, "includeDocuments": true/false}
Wenn der Benutzer dich bittet, eine Aktion auszuführen (z.B. "importiere aus lexoffice" oder "sende an lexoffice"), antworte AUSSCHLIESSLICH mit einem JSON-Objekt im folgenden Format:
{"tool_use": {"name": "send_to_lexoffice", "parameters": {}}}
oder
{"tool_use": {"name": "import_from_lexoffice", "parameters": {"dateRange": {"start": "2023-01-01", "end": "2023-12-31"}, "includeDocuments": true}}}

**Recherche & Wissensbasis (Wie ein Fuchs):**
- Der Benutzer kann dir URLs im System-Prompt hinterlegen. Nutze diese als deine primäre Wissensbasis für Recherchen.
- Sei wie ein schlauer Fuchs: Wenn der Benutzer dich bittet, etwas zu recherchieren (z.B. "informiere mich über Steuerpauschalen"), durchsuche (simuliert) die von ihm bereitgestellten Quellen.
- Dein Ziel ist es, proaktiv finanzielle Vorteile für den Benutzer zu finden (z.B. Pauschalen, Abzüge, Förderungen), die auf seine Situation (basierend auf Profildaten) zutreffen könnten.
- Wenn du Informationen aus den URLs verwendest, zitiere immer die Quelle, z.B. "(Quelle: [URL])".

**Steuerliches Wissen & Haftungsausschluss:**
- Du kennst die grundlegenden deutschen Steuerfristen: Die Umsatzsteuervoranmeldung ist am 10. Tag nach Quartalsende fällig. Die Einkommensteuererklärung für ein Jahr ist bis zum Ende des Folgejahres fällig.
- Du kannst erklären, warum ein Beleg aufgrund einer Regel eine bestimmte Kategorie erhalten hat.
- **SEHR WICHTIG:** Du bist ein KI-Assistent, kein zertifizierter Steuerberater. Füge bei jeder Antwort, die steuerliche Fristen oder Ratschläge betrifft, immer einen kurzen Hinweis hinzu, z.B.: "(Bitte beachten Sie: Dies ist keine rechtsverbindliche Steuerberatung.)"`;

const DEFAULT_STORAGE_LOCATIONS: StorageLocation[] = [
  { id: DEFAULT_DIGITAL_STORAGE_ID, label: 'Digitale Ablage', type: StorageLocationType.DIGITAL, description: 'Standardablage für digital erfasste Belege', isDefault: true },
  { id: 'storage-default-lexoffice', label: 'Lexoffice', type: StorageLocationType.LEXOFFICE, description: 'Automatischer Abgleich mit Lexoffice' },
  { id: 'storage-default-physical', label: 'Physischer Ordner', type: StorageLocationType.PHYSICAL, description: 'Physisch abgelegte Dokumente im Büro' },
  { id: 'storage-default-archive', label: 'Archiv', type: StorageLocationType.ARCHIVE, description: 'Abgelegte Dokumente außerhalb des aktiven Workflows' },
];

const STORAGE_KEYS = {
  transactions: 'accountingTransactions',
  tasks: 'accountingTasks',
  storageLocations: 'storageLocations',
};

const isBrowser = typeof window !== 'undefined';

const toDate = (value: any): Date => {
  if (!value) return new Date();
  const parsed = new Date(value);
  return isNaN(parsed.getTime()) ? new Date() : parsed;
};

const deserializeTransaction = (raw: any): AccountingTransaction => ({
  ...raw,
  date: toDate(raw.date),
  createdAt: toDate(raw.createdAt),
  updatedAt: toDate(raw.updatedAt),
});

const deserializeTask = (raw: any): TaskItem => ({
  ...raw,
  createdAt: toDate(raw.createdAt),
  completedAt: raw.completedAt ? toDate(raw.completedAt) : undefined,
  dueDate: raw.dueDate ? toDate(raw.dueDate) : undefined,
});

const loadTransactionsFromStorage = (): AccountingTransaction[] => {
  if (!isBrowser) return [];
  const stored = localStorage.getItem(STORAGE_KEYS.transactions);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(deserializeTransaction) : [];
  } catch (error) {
    console.warn('Konnte gespeicherte Transaktionen nicht laden:', error);
    return [];
  }
};

const loadTasksFromStorage = (): TaskItem[] => {
  if (!isBrowser) return [];
  const stored = localStorage.getItem(STORAGE_KEYS.tasks);
  if (!stored) return [];
  try {
    const parsed = JSON.parse(stored);
    return Array.isArray(parsed) ? parsed.map(deserializeTask) : [];
  } catch (error) {
    console.warn('Konnte gespeicherte Aufgaben nicht laden:', error);
    return [];
  }
};

const loadStorageLocationsFromStorage = (): StorageLocation[] => {
  if (!isBrowser) return DEFAULT_STORAGE_LOCATIONS;
  const stored = localStorage.getItem(STORAGE_KEYS.storageLocations);
  if (!stored) return DEFAULT_STORAGE_LOCATIONS;
  try {
    const parsed = JSON.parse(stored);
    if (Array.isArray(parsed) && parsed.length > 0) {
      return parsed;
    }
    return DEFAULT_STORAGE_LOCATIONS;
  } catch (error) {
    console.warn('Konnte gespeicherte Ablageorte nicht laden:', error);
    return DEFAULT_STORAGE_LOCATIONS;
  }
};



const App: React.FC = () => {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => sessionStorage.getItem('isAuthenticated') === 'true');
  const [documents, setDocuments] = useState<Document[]>([]);
  const [documentsLoaded, setDocumentsLoaded] = useState(false);
  const [documentsError, setDocumentsError] = useState<string | null>(null);
  const [activeView, setActiveView] = useState<View>(View.DOCUMENTS);
  const [activeFilter, setActiveFilter] = useState<DocumentFilter | null>(null);
  const [rules, setRules] = useState<Rule[]>(initialRules);
  const [ruleSuggestion, setRuleSuggestion] = useState<RuleSuggestion | null>(null);
  const [duplicateToast, setDuplicateToast] = useState<Document | null>(null);
  const [duplicateComparison, setDuplicateComparison] = useState<{ isOpen: boolean, documents: [Document, Document] | null }>({ isOpen: false, documents: null });
  const [uploadToast, setUploadToast] = useState<{ type: 'success' | 'error', message: string } | null>(null);
  
  // App State for responsiveness
  const [isDesktopSidebarOpen, setIsDesktopSidebarOpen] = useState<boolean>(true);
  const [isMobileSidebarOpen, setIsMobileSidebarOpen] = useState<boolean>(false);
  
  // API Keys, Chat State, and Profile
  // Environment bereitgestellte Keys (nicht überschreiben, nur verwenden falls kein gespeicherter Benutzer-Key existiert)
  const ENV = (import.meta as any).env || {};
  const GEMINI_ENV_KEY: string | undefined = ENV.VITE_GEMINI_API_KEY || ENV.VITE_GEMINI_KEY;
  const LEXOFFICE_ENV_KEY: string | undefined = ENV.VITE_LEXOFFICE_API_KEY;

  const [apiKey, setApiKey] = useState<string>(() => localStorage.getItem('geminiApiKey') || GEMINI_ENV_KEY || '');
  const [lexofficeApiKey, setLexofficeApiKey] = useState<string>(() => localStorage.getItem('lexofficeApiKey') || LEXOFFICE_ENV_KEY || '');
  const [lexofficeLiveEnabled, setLexofficeLiveEnabled] = useState<boolean>(() => {
    if (!isBrowser) return getLexofficeLiveMode();
    const stored = localStorage.getItem('lexofficeLiveMode');
    if (stored !== null) {
      return stored === 'true';
    }
    return getLexofficeLiveMode();
  });
  const [isChatOpen, setIsChatOpen] = useState<boolean>(false);
  const [documentToView, setDocumentToView] = useState<Document | null>(null);
  const [reanalyzingDocumentIds, setReanalyzingDocumentIds] = useState<string[]>([]);
  const [chatSystemPrompt, setChatSystemPrompt] = useState<string>(() => localStorage.getItem('chatSystemPrompt') || DEFAULT_CHAT_PROMPT);
  const [userProfile, setUserProfile] = useState<UserProfile>(() => {
    const saved = localStorage.getItem('userProfile');
    return saved ? JSON.parse(saved) : { name: 'Admin User', taxId: '', vatId: '', taxNumber: '', companyForm: '', profilePicture: undefined };
  });

  const fetchDocuments = useCallback(async () => {
    setDocumentsLoaded(false);
    try {
      setDocumentsError(null);
      const res = await fetch('/api/documents');
      const errorText = res.ok ? null : await res.text();
      if (!res.ok) {
        throw new Error(errorText || `HTTP ${res.status} ${res.statusText}`);
      }
      const payload = await res.json();
      if (Array.isArray(payload)) {
        const normalized: Document[] = payload.map((d: any) => ({
          id: d.id,
          name: d.name,
          date: new Date(d.date),
          year: d.year,
          quarter: d.quarter,
          source: d.source,
          status: d.status,
          fileUrl: d.fileUrl,
          invoiceType: d.invoiceType || InvoiceType.INCOMING,
          vendor: d.vendor,
          totalAmount: d.totalAmount,
          vatAmount: d.vatAmount,
          invoiceNumber: d.invoiceNumber,
          taxCategory: d.taxCategory,
          errorMessage: d.errorMessage,
          storageLocationId: d.storageLocationId,
          tags: d.tags || [],
          linkedTransactionIds: d.linkedTransactionIds || [],
          textContent: d.textContent,
          fileHash: d.fileHash,
          duplicateOfId: d.duplicateOfId,
          duplicateIgnored: d.duplicateIgnored,
        }));
        setDocuments(normalized.sort((a,b) => b.date.getTime() - a.date.getTime()));

        const potentialDuplicate = normalized.find(d => d.status === DocumentStatus.POTENTIAL_DUPLICATE && !d.duplicateIgnored);
        if (potentialDuplicate) {
          setDuplicateToast(potentialDuplicate);
        } else {
          setDuplicateToast(null);
        }
      } else {
        setDocuments([]);
        setDuplicateToast(null);
      }
    } catch (e) {
      console.error('Dokumente laden fehlgeschlagen:', e);
      const message = e instanceof Error ? e.message : 'Unbekannter Fehler beim Laden der Dokumente.';
      setDocumentsError(message);
    } finally {
      setDocumentsLoaded(true);
    }
  }, [setDocumentsLoaded, setDocumentsError, setDocuments, setDuplicateToast]);

  useEffect(() => {
    // Initial Dokumente aus Backend laden
    fetchDocuments();
  }, [fetchDocuments]);

  useEffect(() => {
    const storedPrompt = localStorage.getItem('chatSystemPrompt');
    if (storedPrompt && storedPrompt.includes('das folgende Werkzeug')) {
      setChatSystemPrompt(DEFAULT_CHAT_PROMPT);
    }
  }, []);

  // Deadlines & Notifications
  const [notificationSettings, setNotificationSettings] = useState<NotificationSettings>(() => {
    const saved = localStorage.getItem('notificationSettings');
    return saved ? JSON.parse(saved) : { notify14Days: true, notify1Day: true };
  });
  const [deadlines, setDeadlines] = useState<Deadline[]>([]);
  const [activeNotification, setActiveNotification] = useState<Deadline | null>(null);
  const [transactions, setTransactions] = useState<AccountingTransaction[]>(() => loadTransactionsFromStorage());
  const [tasks, setTasks] = useState<TaskItem[]>(() => loadTasksFromStorage());
  const [storageLocations, setStorageLocations] = useState<StorageLocation[]>(() => loadStorageLocationsFromStorage());

  const handleLogin = () => {
    setIsAuthenticated(true);
    sessionStorage.setItem('isAuthenticated', 'true');
  };

  const handleLogout = () => {
    setIsAuthenticated(false);
    sessionStorage.removeItem('isAuthenticated');
    setActiveView(View.DOCUMENTS);
  };

  useEffect(() => {
      localStorage.setItem('geminiApiKey', apiKey);
  }, [apiKey]);

  useEffect(() => {
    localStorage.setItem('lexofficeApiKey', lexofficeApiKey);
  }, [lexofficeApiKey]);

  useEffect(() => {
    setLexofficeLiveMode(lexofficeLiveEnabled);
    if (!isBrowser) return;
    localStorage.setItem('lexofficeLiveMode', String(lexofficeLiveEnabled));
  }, [lexofficeLiveEnabled]);
  
  useEffect(() => {
    localStorage.setItem('notificationSettings', JSON.stringify(notificationSettings));
  }, [notificationSettings]);

  useEffect(() => {
    localStorage.setItem('chatSystemPrompt', chatSystemPrompt);
  }, [chatSystemPrompt]);

  useEffect(() => {
    localStorage.setItem('userProfile', JSON.stringify(userProfile));
  }, [userProfile]);

  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem(STORAGE_KEYS.transactions, JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem(STORAGE_KEYS.tasks, JSON.stringify(tasks));
  }, [tasks]);

  useEffect(() => {
    if (!isBrowser) return;
    localStorage.setItem(STORAGE_KEYS.storageLocations, JSON.stringify(storageLocations));
  }, [storageLocations]);

  useEffect(() => {
    setTransactions(prevTransactions => {
      const documentIds = new Set(documents.map(doc => doc.id));
      let hasChange = false;
      const updatedTransactions = prevTransactions.map(tx => {
        if (tx.documentId && !documentIds.has(tx.documentId)) {
          hasChange = true;
          return {
            ...tx,
            documentId: undefined,
            status: TransactionStatus.MISSING_RECEIPT,
            updatedAt: new Date(),
          };
        }
        return tx;
      });
      return hasChange ? updatedTransactions : prevTransactions;
    });
  }, [documents]);

  useEffect(() => {
    setDocuments(prevDocs => {
      const linkedByDoc = new Map<string, string[]>();
      transactions.forEach(tx => {
        if (tx.documentId) {
          const list = linkedByDoc.get(tx.documentId) || [];
          list.push(tx.id);
          linkedByDoc.set(tx.documentId, list);
        }
      });

      let changed = false;
      const updatedDocs = prevDocs.map(doc => {
        const linkedIds = linkedByDoc.get(doc.id) || [];
        const currentIds = doc.linkedTransactionIds || [];
        const sameLength = currentIds.length === linkedIds.length;
        const sameMembers = sameLength && currentIds.every(id => linkedIds.includes(id));
        if (!sameMembers) {
          changed = true;
          return { ...doc, linkedTransactionIds: linkedIds };
        }
        return doc;
      });
      return changed ? updatedDocs : prevDocs;
    });
  }, [transactions, setDocuments]);

  useEffect(() => {
    const now = new Date();
    setTasks(prevTasks => {
      const missingTransactions = transactions.filter(tx => tx.status === TransactionStatus.MISSING_RECEIPT);
      const missingIds = new Set(missingTransactions.map(tx => tx.id));

      let changed = false;
      const nextTasks: TaskItem[] = [];

      prevTasks.forEach(task => {
        if (task.relatedTransactionId) {
          if (missingIds.has(task.relatedTransactionId)) {
            nextTasks.push(task);
            missingIds.delete(task.relatedTransactionId);
          } else {
            if (task.status !== TaskStatus.DONE) {
              changed = true;
              nextTasks.push({ ...task, status: TaskStatus.DONE, completedAt: task.completedAt || now });
            } else {
              nextTasks.push(task);
            }
          }
        } else {
          nextTasks.push(task);
        }
      });

      missingIds.forEach(txId => {
        const tx = transactions.find(t => t.id === txId);
        if (!tx) return;
        changed = true;
        const priority = Math.abs(tx.amount) >= 1000 ? TaskPriority.HIGH : TaskPriority.MEDIUM;
        nextTasks.push({
          id: `task-${tx.id}`,
          title: `Beleg für ${tx.description || 'Transaktion'} beschaffen`,
          description: `Bitte laden Sie den fehlenden Beleg für die Transaktion vom ${tx.date.toLocaleDateString('de-DE')} (${tx.amount.toFixed(2)} €) nach.`,
          status: TaskStatus.OPEN,
          priority,
          relatedTransactionId: tx.id,
          dueDate: new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000),
          createdAt: now,
        });
      });

      return changed ? nextTasks : prevTasks;
    });
  }, [transactions]);

  useEffect(() => {
    const calculatedDeadlines = getDeadlines();
    setDeadlines(calculatedDeadlines);

    const notificationToShow = calculatedDeadlines.find(d => 
        (notificationSettings.notify14Days && d.remainingDays <= 14 && d.remainingDays > 1) ||
        (notificationSettings.notify1Day && d.remainingDays <= 1)
    );
    setActiveNotification(notificationToShow || null);
  }, [notificationSettings]);


  const filteredDocuments = useMemo(() => {
    if (!activeFilter) {
      return documents;
    }
    return documents.filter(doc => {
      if (activeFilter.quarter) {
        return doc.year === activeFilter.year && doc.quarter === activeFilter.quarter;
      }
      return doc.year === activeFilter.year;
    });
  }, [documents, activeFilter]);

  const upcomingTaxSubmissions = useMemo(
    () =>
      deadlines.map(deadline => ({
        title: deadline.title,
        dueDate: deadline.dueDate,
        status: deadline.remainingDays < 0 ? 'overdue' : 'open',
      })),
    [deadlines]
  );

  const handleSetRuleSuggestion = (suggestion: RuleSuggestion) => {
    const similarRuleExists = rules.some(rule => {
      if (rule.conditionType !== 'vendor') return false;
      const vendorExistsInRule = rule.conditionValue.toLowerCase().split(',').map(v => v.trim()).includes(suggestion.vendor.toLowerCase());
      const categoryMatches = rule.resultCategory.toLowerCase() === suggestion.taxCategory.toLowerCase();
      return vendorExistsInRule && categoryMatches;
    });
    if (!similarRuleExists) setRuleSuggestion(suggestion);
  };

  const handleAcceptSuggestion = () => {
    if (ruleSuggestion) {
      const newRule: Rule = {
        id: `rule-${Date.now()}`,
        conditionType: 'vendor',
        conditionValue: ruleSuggestion.vendor,
        invoiceType: ruleSuggestion.invoiceType,
        resultCategory: ruleSuggestion.taxCategory,
      };
      setRules(prevRules => [...prevRules, newRule]);
      setRuleSuggestion(null);
    }
  };

  const handleDismissSuggestion = () => {
    setRuleSuggestion(null);
  };

  const handleDuplicateCompare = (doc: Document) => {
    if (doc.duplicateOfId) {
      const duplicateDoc = documents.find(d => d.id === doc.duplicateOfId);
      if (duplicateDoc) {
        setDuplicateComparison({ isOpen: true, documents: [doc, duplicateDoc] });
      }
    }
    setDuplicateToast(null);
  };

  const handleDuplicateDismiss = () => {
    setDuplicateToast(null);
  };

  const handleDuplicateIgnore = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}/ignore-duplicate`, { method: 'POST' });
      if (res.ok) {
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, duplicateIgnored: true, status: DocumentStatus.OK } : d));
        setDuplicateComparison({ isOpen: false, documents: null });
      }
    } catch (e) {
      console.error('Ignore duplicate failed', e);
    }
  };

  const handleDuplicateDelete = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDocuments(prev => prev.filter(d => d.id !== id));
        setDuplicateComparison({ isOpen: false, documents: null });
      }
    } catch (e) {
      console.error('Delete document failed', e);
    }
  };

  const handleDuplicateKeepBoth = async (id: string) => {
    try {
      const res = await fetch(`/api/documents/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ duplicateIgnored: true }) });
      if (res.ok) {
        setDocuments(prev => prev.map(d => d.id === id ? { ...d, duplicateIgnored: true, status: DocumentStatus.OK } : d));
        setDuplicateComparison({ isOpen: false, documents: null });
      }
    } catch (e) {
      console.error('Keep both failed', e);
    }
  };

  const handleUploadSuccess = (message: string) => {
    setUploadToast({ type: 'success', message });
    setTimeout(() => setUploadToast(null), 5000);
  };

  const handleUploadError = (message: string) => {
    setUploadToast({ type: 'error', message });
    setTimeout(() => setUploadToast(null), 5000);
  };

  const handleDuplicateDetected = (doc: Document) => {
    setDuplicateToast(doc);
  };

  const handleImportFromLexoffice = async (dateRange: { start: Date; end: Date }, includeDocuments: boolean) => {
    const importResult = await importFromLexoffice({
      apiKey: lexofficeApiKey || undefined,
      dateRange,
      includeDocuments,
    });

    const candidateDocuments = (importResult.documents || []).map(payload => buildDocumentFromLexoffice(payload, DEFAULT_DIGITAL_STORAGE_ID));

    const invoiceMap = new Map<string, string>();
    documents.forEach(doc => {
      if (doc.invoiceNumber) {
        invoiceMap.set(doc.invoiceNumber, doc.id);
      }
    });
    candidateDocuments.forEach(doc => {
      if (doc.invoiceNumber) {
        invoiceMap.set(doc.invoiceNumber, doc.id);
      }
    });

    const { updatedTransactions } = upsertTransactionsFromLexoffice({
      incoming: importResult.transactions,
      existingTransactions: transactions,
      linkedByInvoice: invoiceMap,
    });

    setTransactions(updatedTransactions);

    const existingIds = new Set(documents.map(doc => doc.id));
    const existingInvoiceNumbers = new Set(documents.map(doc => doc.invoiceNumber).filter(Boolean) as string[]);
    const additions = candidateDocuments.filter(doc => {
      if (existingIds.has(doc.id)) return false;
      const invoiceNumber = doc.invoiceNumber;
      if (invoiceNumber && existingInvoiceNumbers.has(invoiceNumber)) return false;
      return true;
    });

    if (additions.length > 0) {
      setDocuments(prev => [...prev, ...additions]);
    }
  };

  const handleOpenDocumentFromChat = (docId: string) => {
    const docToOpen = documents.find(doc => doc.id === docId);
    if (docToOpen) {
        setDocumentToView(docToOpen);
        setIsChatOpen(false); // Close chat on mobile to see the modal
    }
  };
  
  const handleDocumentUpdate = (updatedDocument: Document) => {
    setDocuments(prevDocs => 
      prevDocs.map(doc => doc.id === updatedDocument.id ? updatedDocument : doc)
    );
  };

  const handleReanalyzeDocument = useCallback(async (document: Document) => {
  if (!document.file) {
    throw new Error('Für dieses Dokument liegt keine Originaldatei vor.');
  }
  if (!apiKey) {
    throw new Error('Bitte hinterlegen Sie zuerst Ihren Gemini API-Schlüssel.');
  }

  setReanalyzingDocumentIds(prev => (prev.includes(document.id) ? prev : [...prev, document.id]));
  setDocuments(prevDocs => prevDocs.map(doc => doc.id === document.id ? { ...doc, status: DocumentStatus.ANALYZING, errorMessage: undefined } : doc));

  try {
    const analysis = await analyzeDocument(document.file, rules, apiKey);
    const metadata = buildOcrMetadataFromAnalysis(analysis);

    setDocuments(prevDocs => {
      const otherDocs = prevDocs.filter(doc => doc.id !== document.id);
      const status = getDocumentStatusFromAnalysis(analysis, otherDocs);

      return prevDocs.map(existing => {
        if (existing.id !== document.id) return existing;

        const tags = new Set<string>([
          ...(existing.tags || []),
          analysis.taxCategory || '',
          analysis.vendor || '',
        ].filter(Boolean));

        const updated: Document = {
          ...existing,
          status,
          textContent: analysis.textContent,
          ocrMetadata: metadata,
          errorMessage: undefined,
        };

        if (analysis.documentDate) {
          const parsedDate = new Date(analysis.documentDate);
          if (!Number.isNaN(parsedDate.getTime())) {
            updated.date = parsedDate;
            updated.year = parsedDate.getFullYear();
            updated.quarter = Math.floor((parsedDate.getMonth() + 3) / 3);
          }
        }

        if (!existing.vendor && analysis.vendor) updated.vendor = analysis.vendor;
        if ((!existing.totalAmount || existing.totalAmount === 0) && typeof analysis.totalAmount === 'number') updated.totalAmount = analysis.totalAmount;
        if ((!existing.vatAmount || existing.vatAmount === 0) && typeof analysis.vatAmount === 'number') updated.vatAmount = analysis.vatAmount;
        if (!existing.invoiceNumber && analysis.invoiceNumber) updated.invoiceNumber = analysis.invoiceNumber;
        if (!existing.taxCategory || existing.taxCategory === 'Sonstiges') updated.taxCategory = analysis.taxCategory || existing.taxCategory;
        if (!existing.invoiceType) updated.invoiceType = analysis.invoiceType;
        if (!existing.storageLocationId) updated.storageLocationId = analysis.suggestedStorageLocationId || DEFAULT_DIGITAL_STORAGE_ID;

        updated.tags = Array.from(tags);

        return updated;
      });
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Analyse fehlgeschlagen.';
    setDocuments(prevDocs => prevDocs.map(doc => doc.id === document.id ? { ...doc, status: DocumentStatus.ERROR, errorMessage: message } : doc));
    throw error;
  } finally {
    setReanalyzingDocumentIds(prev => prev.filter(id => id !== document.id));
  }
  }, [apiKey, rules, setDocuments]);

  const renderDocumentsView = () => (
    <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-slate-500">Lade...</div></div>}>
      <DocumentsView
        documents={filteredDocuments}
        setDocuments={setDocuments}
        activeFilter={activeFilter}
        rules={rules}
        onRuleSuggestion={handleSetRuleSuggestion}
        apiKey={apiKey}
        lexofficeApiKey={lexofficeApiKey}
        onSelectDocument={setDocumentToView}
        storageLocations={storageLocations}
        setStorageLocations={setStorageLocations}
        onReanalyzeDocument={handleReanalyzeDocument}
        reanalyzingDocumentIds={reanalyzingDocumentIds}
        onUploadSuccess={handleUploadSuccess}
        onUploadError={handleUploadError}
        onDuplicateDetected={handleDuplicateDetected}
        onCompareDuplicate={handleDuplicateCompare}
      />
    </Suspense>
  );

  if (!isAuthenticated) {
    return (
      <ErrorBoundary>
        <LoginView onLogin={handleLogin} />
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <div className="flex h-screen bg-slate-50 font-sans">
       {isMobileSidebarOpen && (
        <div 
            className="fixed inset-0 bg-black bg-opacity-50 z-30 md:hidden"
            onClick={() => setIsMobileSidebarOpen(false)}
        ></div>
       )}
      <Sidebar 
        activeView={activeView} 
        setActiveView={setActiveView} 
        documents={documents}
        activeFilter={activeFilter}
        setActiveFilter={setActiveFilter}
        isDesktopOpen={isDesktopSidebarOpen}
        setIsDesktopOpen={setIsDesktopSidebarOpen}
        isMobileOpen={isMobileSidebarOpen}
        setIsMobileOpen={setIsMobileSidebarOpen}
      />
      <div className="flex-1 flex flex-col overflow-hidden">
        <Header 
            onToggleChat={() => setIsChatOpen(!isChatOpen)} 
            onToggleMobileSidebar={() => setIsMobileSidebarOpen(!isMobileSidebarOpen)}
            onProfileClick={() => setActiveView(View.PROFILE)}
            userProfile={userProfile}
        />
        <main className="flex-1 overflow-x-hidden overflow-y-auto bg-slate-50 p-4 sm:p-6 lg:p-8 relative">
           {activeNotification && <DeadlineNotification deadline={activeNotification} onClose={() => setActiveNotification(null)} />}
          {documentsError && (
            <div className="mb-4">
              <ApiErrorFallback
                title="Dokumente konnten nicht geladen werden"
                error={{
                  message: 'Die Dokument-API ist derzeit nicht erreichbar. Läuft der Backend-Server (npm run server)?',
                  details: documentsError,
                }}
                onRetry={fetchDocuments}
                onDismiss={() => setDocumentsError(null)}
                showDetails
              />
            </div>
          )}
          {!documentsLoaded && !documentsError && (
            <div className="mb-4 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-sm text-slate-500">Dokumente werden geladen...</p>
            </div>
          )}
          <Suspense fallback={<div className="flex items-center justify-center h-64"><div className="text-slate-500">Lade...</div></div>}>
            {(activeView === View.DOCUMENTS || activeView === View.BUCHHALTUNG_BELEGE) && renderDocumentsView()}
            {activeView === View.SETTINGS && (
              <SettingsView
                setDocuments={setDocuments}
                apiKey={apiKey}
                setApiKey={setApiKey}
                lexofficeApiKey={lexofficeApiKey}
                setLexofficeApiKey={setLexofficeApiKey}
                lexofficeLiveEnabled={lexofficeLiveEnabled}
                setLexofficeLiveEnabled={setLexofficeLiveEnabled}
                notificationSettings={notificationSettings}
                setNotificationSettings={setNotificationSettings}
                chatSystemPrompt={chatSystemPrompt}
                setChatSystemPrompt={setChatSystemPrompt}
                DEFAULT_CHAT_PROMPT={DEFAULT_CHAT_PROMPT}
                geminiEnvProvided={Boolean(GEMINI_ENV_KEY)}
                lexofficeEnvProvided={Boolean(LEXOFFICE_ENV_KEY)}
              />
            )}
            {activeView === View.ANALYSIS && <AnalysisView documents={documents} />}
            {activeView === View.RULES && <RulesView rules={rules} setRules={setRules} />}
            {activeView === View.DEADLINES && <DeadlinesView deadlines={deadlines} />}
            {(activeView === View.BUCHHALTUNG || activeView === View.BUCHHALTUNG_BUCHUNGEN) && (
              <AccountingView
                documents={documents}
                setDocuments={setDocuments}
                transactions={transactions}
                setTransactions={setTransactions}
                storageLocations={storageLocations}
                onSelectDocument={setDocumentToView}
                tasks={tasks}
              />
            )}
            {activeView === View.BUCHHALTUNG_EUR && <IncomeStatementView transactions={transactions} documents={documents} />}
            {activeView === View.BUCHHALTUNG_MELDUNGEN && <TaxFilingsView upcomingSubmissions={upcomingTaxSubmissions} transactions={transactions} />}
            {activeView === View.LEXOFFICE && (
              <LexofficeView
                documents={documents}
                setDocuments={setDocuments}
                lexofficeApiKey={lexofficeApiKey}
                transactions={transactions}
                setTransactions={setTransactions}
                storageLocations={storageLocations}
                defaultStorageId={DEFAULT_DIGITAL_STORAGE_ID}
              />
            )}
            {activeView === View.PROFILE && <ProfileView userProfile={userProfile} setUserProfile={setUserProfile} onLogout={handleLogout} />}
            {activeView === View.FÖRDERUNGEN && <FörderungenView userProfile={userProfile} apiKey={apiKey} />}
          </Suspense>
        </main>
      </div>
       {isChatOpen && (
         <Suspense fallback={<div className="fixed right-0 top-0 h-full w-96 bg-slate-100 border-l border-slate-200 flex items-center justify-center"><div className="text-slate-500">Lade Chat...</div></div>}>
           <ChatPanel 
             apiKey={apiKey}
             lexofficeApiKey={lexofficeApiKey}
             documents={documents}
             rules={rules}
             userProfile={userProfile}
             onOpenDocument={handleOpenDocumentFromChat}
             onClose={() => setIsChatOpen(false)}
             systemPrompt={chatSystemPrompt}
             onImportFromLexoffice={handleImportFromLexoffice}
           />
         </Suspense>
        )}
       {ruleSuggestion && (
        <RuleSuggestionToast 
          suggestion={ruleSuggestion}
          onAccept={handleAcceptSuggestion}
          onDismiss={handleDismissSuggestion}
        />
      )}
      {duplicateToast && (
        <DuplicateToast
          document={duplicateToast}
          onCompare={() => handleDuplicateCompare(duplicateToast)}
          onDismiss={handleDuplicateDismiss}
        />
      )}
      {duplicateComparison.isOpen && duplicateComparison.documents && (
        <DuplicateComparisonModal
          documents={duplicateComparison.documents}
          onClose={() => setDuplicateComparison({ isOpen: false, documents: null })}
          onIgnore={handleDuplicateIgnore}
          onDelete={handleDuplicateDelete}
          onKeepBoth={handleDuplicateKeepBoth}
        />
      )}
      {uploadToast && (
        <div className={`fixed bottom-5 right-5 w-full max-w-md rounded-xl shadow-lg border p-4 z-50 ${uploadToast.type === 'success' ? 'bg-green-50 border-green-200' : 'bg-red-50 border-red-200'}`}>
          <p className={`text-sm font-semibold ${uploadToast.type === 'success' ? 'text-green-900' : 'text-red-900'}`}>
            {uploadToast.type === 'success' ? 'Erfolg' : 'Fehler'}
          </p>
          <p className={`mt-1 text-sm ${uploadToast.type === 'success' ? 'text-green-700' : 'text-red-700'}`}>
            {uploadToast.message}
          </p>
        </div>
      )}
      {documentToView && (
        <Suspense fallback={<div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50"><div className="text-slate-500">Lade...</div></div>}>
          <DocumentDetailModal
            document={documentToView}
            onClose={() => setDocumentToView(null)}
            onUpdate={handleDocumentUpdate}
            storageLocations={storageLocations}
            onReanalyze={handleReanalyzeDocument}
            isReanalyzing={reanalyzingDocumentIds.includes(documentToView.id)}
          />
        </Suspense>
      )}
    </div>
    </ErrorBoundary>
  );
};

export default App;
