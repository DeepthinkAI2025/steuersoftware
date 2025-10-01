import React, { useMemo, useState, useEffect, useRef } from 'react';
import {
  AccountingTransaction,
  Document,
  InvoiceType,
  TransactionStatus,
  TransactionSource,
  StorageLocation,
  TaskItem,
  TaskStatus,
  DEFAULT_DIGITAL_STORAGE_ID,
} from '../types';
import { PlusIcon } from './icons/PlusIcon';
import SparklesIcon from './icons/SparklesIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
// ...existing imports duplicated icons removed above
import { importFromLexoffice, upsertTransactionsFromLexoffice, buildDocumentFromLexoffice } from '../services/lexofficeService';
import { StorageLocationType, LexofficeImportResult, DocumentSource, DocumentStatus } from '../types';
import FolderIcon from './icons/FolderIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import SearchIcon from './icons/SearchIcon';

interface AccountingViewProps {
  transactions: AccountingTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<AccountingTransaction[]>>;
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  storageLocations: StorageLocation[];
  onSelectDocument: (document: Document) => void;
  tasks: TaskItem[];
}

interface TransactionFormState {
  id: string;
  date: string;
  description: string;
  amount: number;
  invoiceType: InvoiceType;
  taxCategory: string;
  documentId?: string;
  notes?: string;
  status: TransactionStatus;
  source: TransactionSource;
  createdAt: Date;
  updatedAt: Date;
}

type StatusFilter = TransactionStatus | 'all';
type TypeFilter = InvoiceType | 'all';

type SortKey = 'date' | 'amount' | 'taxCategory';

type SortDirection = 'asc' | 'desc';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('de-DE').format(d);
};

const generateTransactionId = () => `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sourceLabels: Record<TransactionSource, string> = {
  [TransactionSource.MANUAL]: 'Manuell',
  [TransactionSource.LEXOFFICE]: 'Lexoffice',
  [TransactionSource.AI]: 'KI-Assistent',
};

const statusBadgeStyle: Record<TransactionStatus, { label: string; className: string; icon: React.ReactNode }> = {
  [TransactionStatus.COMPLETE]: {
    label: 'Beleg verknüpft',
    className: 'bg-green-100 text-green-800',
    icon: <CheckCircleIcon className="w-4 h-4 mr-1" />,
  },
  [TransactionStatus.MISSING_RECEIPT]: {
    label: 'Beleg fehlt',
    className: 'bg-amber-100 text-amber-800',
    icon: <AlertTriangleIcon className="w-4 h-4 mr-1" />,
  },
  [TransactionStatus.DRAFT]: {
    label: 'Entwurf',
    className: 'bg-slate-100 text-slate-700',
    icon: <FolderIcon className="w-4 h-4 mr-1" />,
  },
};

const prepareFormState = (transaction?: AccountingTransaction): TransactionFormState => {
  const baseDate = transaction?.date ?? new Date();
  return {
    id: transaction?.id ?? generateTransactionId(),
    date: new Date(baseDate).toISOString().split('T')[0],
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? 0,
    invoiceType: transaction?.invoiceType ?? InvoiceType.INCOMING,
    taxCategory: transaction?.taxCategory ?? 'Sonstiges',
    documentId: transaction?.documentId,
    notes: transaction?.notes,
    status:
      transaction?.status ?? (transaction?.documentId ? TransactionStatus.COMPLETE : TransactionStatus.MISSING_RECEIPT),
    source: transaction?.source ?? TransactionSource.MANUAL,
    createdAt: transaction?.createdAt ?? new Date(),
    updatedAt: transaction?.updatedAt ?? new Date(),
  };
};

const toTransaction = (state: TransactionFormState): AccountingTransaction => ({
  id: state.id,
  date: new Date(state.date),
  description: state.description.trim(),
  amount: Number(state.amount),
  invoiceType: state.invoiceType,
  taxCategory: state.taxCategory.trim() || 'Sonstiges',
  documentId: state.documentId || undefined,
  status: state.documentId ? TransactionStatus.COMPLETE : TransactionStatus.MISSING_RECEIPT,
  source: state.source,
  notes: state.notes?.trim() || undefined,
  createdAt: state.createdAt,
  updatedAt: new Date(),
});

const AccountingView: React.FC<AccountingViewProps> = ({
  transactions,
  setTransactions,
  documents,
  setDocuments,
  storageLocations,
  onSelectDocument,
  tasks,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [taxCategoryFilter, setTaxCategoryFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [multiSort, setMultiSort] = useState<Array<{ key: SortKey; direction: SortDirection }>>([]);
  const [pageSize, setPageSize] = useState<number>(25);
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [formState, setFormState] = useState<TransactionFormState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = formState ? transactions.some(tx => tx.id === formState.id) : false;
  // Spaltensteuerung & Auswahl
  const [showColumnMenu, setShowColumnMenu] = useState(false);
  const columnMenuRef = useRef<HTMLDivElement | null>(null);
  const [visibleColumns, setVisibleColumns] = useState<{ [key: string]: boolean }>({
    date: true,
    description: true,
    amount: true,
    taxCategory: true,
    type: true,
    document: true,
    status: true,
    actions: true,
  });
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [inlineEdit, setInlineEdit] = useState<{ id: string; field: 'description' | 'amount' | 'taxCategory' } | null>(null);
  // Undo / Redo
  const [undoStack, setUndoStack] = useState<AccountingTransaction[][]>([]);
  const [redoStack, setRedoStack] = useState<AccountingTransaction[][]>([]);
  const pushUndo = (prev: AccountingTransaction[]) => {
    setUndoStack(stack => [...stack.slice(-19), prev.map(t => ({ ...t }))]);
    setRedoStack([]);
  };
  const handleUndo = () => {
    setUndoStack(stack => {
      if (!stack.length) return stack;
      const last = stack[stack.length - 1];
      setTransactions(curr => { setRedoStack(r => [...r, curr.map(t => ({ ...t }))]); return last.map(t => ({ ...t })); });
      return stack.slice(0, -1);
    });
  };
  const handleRedo = () => {
    setRedoStack(stack => {
      if (!stack.length) return stack;
      const last = stack[stack.length - 1];
      setTransactions(curr => { setUndoStack(u => [...u, curr.map(t => ({ ...t }))]); return last.map(t => ({ ...t })); });
      return stack.slice(0, -1);
    });
  };
  // Kontextmenü
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; id: string } | null>(null);
  useEffect(() => {
    const close = () => setContextMenu(null);
    window.addEventListener('click', close);
    window.addEventListener('scroll', close);
    return () => { window.removeEventListener('click', close); window.removeEventListener('scroll', close); };
  }, []);
  // Multi-Source Import zusätzliche State
  const [importSources, setImportSources] = useState<{ lexoffice: boolean; local: boolean; gdrive: boolean }>({ lexoffice: true, local: false, gdrive: false });
  const [localFiles, setLocalFiles] = useState<File[]>([]);
  const [localImportSummary, setLocalImportSummary] = useState<{ added: number } | null>(null);
  const [multiImportRunning, setMultiImportRunning] = useState(false);
  const [multiImportLog, setMultiImportLog] = useState<string[]>([]);
  const appendMultiLog = (msg: string) => setMultiImportLog(l => [...l, `${new Date().toLocaleTimeString()} – ${msg}`]);
  const [showAggregation, setShowAggregation] = useState(false);
  // Toast Benachrichtigungen
  interface Toast { id: string; type: 'info' | 'success' | 'error'; message: string; }
  const [toasts, setToasts] = useState<Toast[]>([]);
  const addToast = (message: string, type: Toast['type'] = 'info') => {
    const id = `toast-${Date.now()}-${Math.random().toString(36).slice(2,7)}`;
    setToasts(t => [...t, { id, type, message }]);
    return id;
  };
  useEffect(() => {
    if (!toasts.length) return;
    const timers = toasts.map(t => setTimeout(() => setToasts(curr => curr.filter(x => x.id !== t.id)), 4000));
    return () => { timers.forEach(clearTimeout); };
  }, [toasts]);

  // Persistenz Keys (v2: erweitert um multiSort & showAggregation)
  const PREF_KEY = 'accountingTable:prefs:v2';

  // Prefs laden (v2)
  useEffect(() => {
    try {
      const raw = localStorage.getItem(PREF_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed.visibleColumns) setVisibleColumns((prev: any) => ({ ...prev, ...parsed.visibleColumns }));
        if (parsed.pageSize && [10,25,50,100].includes(parsed.pageSize)) setPageSize(parsed.pageSize);
        if (parsed.sortKey) setSortKey(parsed.sortKey);
        if (parsed.sortDirection) setSortDirection(parsed.sortDirection);
        if (Array.isArray(parsed.multiSort)) setMultiSort(parsed.multiSort.filter((m: any) => m.key && m.direction));
        if (typeof parsed.showAggregation === 'boolean') setShowAggregation(parsed.showAggregation);
      }
    } catch (e) {
      console.warn('Konnte Tabellen-Prefs nicht laden', e);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefs speichern erweitert
  useEffect(() => {
    const prefs = {
      visibleColumns,
      pageSize,
      sortKey,
      sortDirection,
      multiSort,
      showAggregation,
    };
    try { localStorage.setItem(PREF_KEY, JSON.stringify(prefs)); } catch {}
  }, [visibleColumns, pageSize, sortKey, sortDirection, multiSort, showAggregation]);

  // Tastaturkürzel Undo/Redo
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const key = e.key.toLowerCase();
      if ((e.ctrlKey || e.metaKey) && key === 'z' && !e.shiftKey) {
        e.preventDefault();
        handleUndo();
      } else if ((e.ctrlKey || e.metaKey) && (key === 'y' || (key === 'z' && e.shiftKey))) {
        e.preventDefault();
        handleRedo();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [undoStack, redoStack]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (showColumnMenu && columnMenuRef.current && !columnMenuRef.current.contains(e.target as Node)) {
        setShowColumnMenu(false);
      }
    };
    window.addEventListener('mousedown', handler);
    return () => window.removeEventListener('mousedown', handler);
  }, [showColumnMenu]);

  // Lexoffice Import State
  type RangePreset = 'current-month' | 'current-year' | 'last-year' | `year-${number}` | 'custom';
  const [showImportModal, setShowImportModal] = useState(false);
  const [rangePreset, setRangePreset] = useState<RangePreset>('current-month');
  const now = new Date();
  const presetRange = (preset: RangePreset) => {
    const y = now.getFullYear();
    const m = now.getMonth();
    switch (preset) {
      case 'current-month':
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
      case 'current-year':
        return { start: new Date(y, 0, 1), end: new Date(y, 11, 31, 23, 59, 59, 999) };
      case 'last-year':
        return { start: new Date(y - 1, 0, 1), end: new Date(y - 1, 11, 31, 23, 59, 59, 999) };
      default: {
        if (preset.startsWith('year-')) {
          const year = Number(preset.split('-')[1]);
          return { start: new Date(year, 0, 1), end: new Date(year, 11, 31, 23, 59, 59, 999) };
        }
        return { start: new Date(y, m, 1), end: new Date(y, m + 1, 0, 23, 59, 59, 999) };
      }
    }
  };
  const initialPreset = presetRange('current-month');
  const [startDate, setStartDate] = useState(initialPreset.start.toISOString().split('T')[0]);
  const [endDate, setEndDate] = useState(initialPreset.end.toISOString().split('T')[0]);
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importSummary, setImportSummary] = useState<LexofficeImportResult['summary'] | null>(null);
  const [importNotifications, setImportNotifications] = useState<string[]>([]);
  const [fetchedDocumentsCount, setFetchedDocumentsCount] = useState<number | null>(null);
  const [addedDocumentsCount, setAddedDocumentsCount] = useState<number | null>(null);
  const ENV = (import.meta as any).env || {};
  const envLexofficeApiKey: string | undefined = (ENV.VITE_LEXOFFICE_API_KEY || '').trim() || undefined;
  const isLiveMode = Boolean(envLexofficeApiKey) || (ENV.VITE_LEXOFFICE_ENABLE_REAL_API === 'true');

  const selectedRange = (() => {
    const s = new Date(startDate);
    const e = new Date(endDate);
    if (isNaN(s.getTime()) || isNaN(e.getTime())) return null;
    s.setHours(0, 0, 0, 0);
    e.setHours(23, 59, 59, 999);
    return { start: s, end: e };
  })();

  const lexofficeStorageId = useMemo(() => {
    const storage = storageLocations.find(loc => loc.type === StorageLocationType.LEXOFFICE);
    return storage?.id || DEFAULT_DIGITAL_STORAGE_ID;
  }, [storageLocations]);

  const handleRunImport = async () => {
    if (!selectedRange) {
      setImportFeedback({ type: 'error', message: 'Bitte gültigen Zeitraum wählen.' });
      addToast('Zeitraum ungültig', 'error');
      return;
    }
    setIsImporting(true);
    setImportFeedback(null);
    setImportSummary(null);
    setImportNotifications([]);
    setFetchedDocumentsCount(null);
    setAddedDocumentsCount(null);
    try {
      const result = await importFromLexoffice({
        apiKey: envLexofficeApiKey, // falls vorhanden, aktiviert Live
        dateRange: selectedRange,
        includeDocuments,
      });
      const candidateDocuments = (result.documents || []).map(d => buildDocumentFromLexoffice(d, lexofficeStorageId));
      setFetchedDocumentsCount(candidateDocuments.length);

      // Map invoice numbers to existing docs for linking
      const invoiceMap = new Map<string, string>();
      documents.forEach(doc => { if (doc.invoiceNumber) invoiceMap.set(doc.invoiceNumber, doc.id); });
      candidateDocuments.forEach(doc => { if (doc.invoiceNumber) invoiceMap.set(doc.invoiceNumber, doc.id); });
      const { updatedTransactions, notifications } = upsertTransactionsFromLexoffice({
        incoming: result.transactions,
        existingTransactions: transactions,
        linkedByInvoice: invoiceMap,
      });
      setTransactions(updatedTransactions);

      const existingIds = new Set(documents.map(d => d.id));
      const existingInvoiceNumbers = new Set(documents.map(d => d.invoiceNumber).filter(Boolean) as string[]);
      
      const DEBUG_ENABLED = (import.meta as any).env?.VITE_LEXOFFICE_DEBUG === 'true';
      if (DEBUG_ENABLED) {
        console.log('[AccountingView] Duplikatfilter-Analyse', {
          kandidaten: candidateDocuments.length,
          existingIds: existingIds.size,
          existingInvoiceNumbers: existingInvoiceNumbers.size,
          candidates: candidateDocuments.map(d => ({ id: d.id, invoiceNumber: d.invoiceNumber, filename: d.name }))
        });
      }
      
      const additions = candidateDocuments.filter(doc => {
        const hasId = existingIds.has(doc.id);
        const hasInvoice = doc.invoiceNumber && existingInvoiceNumbers.has(doc.invoiceNumber);
        if (DEBUG_ENABLED && (hasId || hasInvoice)) {
          console.log('[AccountingView] Duplikat gefiltert', { id: doc.id, invoiceNumber: doc.invoiceNumber, filename: doc.name, hasId, hasInvoice });
        }
        return !hasId && !hasInvoice;
      });
      if (additions.length) {
        setDocuments(prev => [...prev, ...additions]);
      }
      setAddedDocumentsCount(additions.length);

      const notes = [...notifications];
      if (additions.length) notes.push(`${additions.length} Beleg${additions.length > 1 ? 'e' : ''} übernommen.`);
      if (result.summary.missingReceipts) notes.push(`${result.summary.missingReceipts} Transaktion${result.summary.missingReceipts > 1 ? 'en' : ''} ohne Beleg.`);
      setImportNotifications(notes);
      setImportSummary(result.summary);
      const fmt = new Intl.DateTimeFormat('de-DE');
      setImportFeedback({ type: 'success', message: `${result.mode === 'live' ? 'Live' : 'Simulation'}: Zeitraum ${fmt.format(selectedRange.start)} – ${fmt.format(selectedRange.end)} importiert.` });
      addToast('Lexoffice Import abgeschlossen', 'success');
    } catch (e) {
      setImportFeedback({ type: 'error', message: e instanceof Error ? e.message : 'Import fehlgeschlagen.' });
      addToast('Lexoffice Import fehlgeschlagen', 'error');
    } finally {
      setIsImporting(false);
    }
  };

  const handlePresetChange = (preset: RangePreset) => {
    setRangePreset(preset);
    if (preset !== 'custom') {
      const r = presetRange(preset);
      setStartDate(r.start.toISOString().split('T')[0]);
      setEndDate(r.end.toISOString().split('T')[0]);
    }
  };

  // Lokale Dateien verarbeiten
  const createDocumentFromFile = (file: File): Document => {
    const now = new Date();
    const year = now.getFullYear();
    const quarter = Math.floor(now.getMonth() / 3) + 1;
    return {
      id: `doc-local-${now.getTime()}-${Math.random().toString(36).slice(2,8)}`,
      name: file.name,
      date: now,
      year,
      quarter,
      source: DocumentSource.LOCAL,
      status: DocumentStatus.OK,
      fileUrl: URL.createObjectURL(file),
      file,
      invoiceType: InvoiceType.INCOMING,
      storageLocationId: DEFAULT_DIGITAL_STORAGE_ID,
      linkedTransactionIds: [],
    };
  };

  const handleLocalFiles = (files: FileList | null) => {
    if (!files) return;
    const list = Array.from(files);
    setLocalFiles(prev => [...prev, ...list]);
  };

  const runLocalImport = () => {
    if (!localFiles.length) { appendMultiLog('Keine lokalen Dateien ausgewählt.'); return { added: 0 }; }
    const newDocs: Document[] = localFiles.map(createDocumentFromFile);
    setDocuments(prev => [...prev, ...newDocs]);
    setLocalImportSummary({ added: newDocs.length });
    appendMultiLog(`${newDocs.length} lokale Datei(en) importiert.`);
    addToast(`${newDocs.length} lokale Datei(en) importiert`, 'success');
    return { added: newDocs.length };
  };

  const runLexofficeImportWrapper = async () => {
    appendMultiLog('Starte Lexoffice Import ...');
    await handleRunImport();
    if (importSummary) {
      appendMultiLog(`Lexoffice: ${importSummary.imported} neu, ${importSummary.updated} aktualisiert.`);
    }
  };

  const handleRunMultiImport = async () => {
    if (multiImportRunning) return;
    setMultiImportLog([]);
    setMultiImportRunning(true);
    setImportFeedback(null);
    try {
      if (importSources.lexoffice) {
        await runLexofficeImportWrapper();
      }
      if (importSources.local) {
        runLocalImport();
      }
      if (importSources.gdrive) {
        appendMultiLog('Google Drive Import (Platzhalter) – noch nicht implementiert.');
        addToast('Google Drive Platzhalter – keine Dateien importiert', 'info');
      }
      appendMultiLog('Multi-Import abgeschlossen.');
      addToast('Multi-Import abgeschlossen', 'success');
    } catch (e) {
      appendMultiLog('Fehler beim Multi-Import.');
      addToast('Multi-Import Fehler', 'error');
    } finally {
      setMultiImportRunning(false);
    }
  };

  const taxCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => tx.taxCategory && set.add(tx.taxCategory));
    documents.forEach(doc => doc.taxCategory && set.add(doc.taxCategory));
    return Array.from(set).sort();
  }, [transactions, documents]);

  const summary = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let missing = 0;

    transactions.forEach(tx => {
      if (tx.invoiceType === InvoiceType.OUTGOING) {
        income += tx.amount;
      } else {
        expenses += tx.amount;
      }
      if (tx.status === TransactionStatus.MISSING_RECEIPT) {
        missing += 1;
      }
    });

  const openTasks = tasks.filter(task => task.status !== TaskStatus.DONE).length;

    return {
      income,
      expenses,
      missing,
      openTasks,
    };
  }, [transactions, tasks]);

  const filteredTransactions = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    const base = transactions.filter(tx => {
      if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
      if (typeFilter !== 'all' && tx.invoiceType !== typeFilter) return false;
      if (taxCategoryFilter !== 'all' && tx.taxCategory !== taxCategoryFilter) return false;
      if (!searchLower) return true;
      const doc = tx.documentId ? documents.find(d => d.id === tx.documentId) : undefined;
      return [tx.description, tx.taxCategory, formatCurrency(tx.amount), doc?.name, doc?.vendor]
        .filter(Boolean)
        .some(v => v!.toString().toLowerCase().includes(searchLower));
    });
    const criteria = multiSort.length ? multiSort : [{ key: sortKey, direction: sortDirection }];
    return [...base].sort((a, b) => {
      for (const c of criteria) {
        const dir = c.direction === 'asc' ? 1 : -1;
        let cmp = 0;
        switch (c.key) {
          case 'amount': cmp = a.amount - b.amount; break;
          case 'taxCategory': cmp = a.taxCategory.localeCompare(b.taxCategory); break;
          case 'date': default: cmp = a.date.getTime() - b.date.getTime();
        }
        if (cmp !== 0) return cmp * dir;
      }
      return 0;
    });
  }, [transactions, statusFilter, typeFilter, taxCategoryFilter, searchTerm, documents, sortKey, sortDirection, multiSort]);

  // Reset Pagination bei Filter/Suche Sortierung
  useEffect(() => {
    setCurrentPage(1);
  }, [statusFilter, typeFilter, taxCategoryFilter, searchTerm, sortKey, sortDirection]);

  const pagination = useMemo(() => {
    const total = filteredTransactions.length;
    const totalPages = Math.max(1, Math.ceil(total / pageSize));
    const safePage = Math.min(currentPage, totalPages);
    const start = (safePage - 1) * pageSize;
    const end = start + pageSize;
    const slice = filteredTransactions.slice(start, end);
    return { total, totalPages, page: safePage, slice, start: start + 1, end: Math.min(end, total) };
  }, [filteredTransactions, pageSize, currentPage]);

  const filteredTotals = useMemo(() => {
    let income = 0;
    let expenses = 0;
    filteredTransactions.forEach(tx => {
      if (tx.invoiceType === InvoiceType.OUTGOING) {
        income += tx.amount;
      } else {
        expenses += tx.amount;
      }
    });
    return { income, expenses, net: income - expenses };
  }, [filteredTransactions]);

  const aggregatedByTaxCategory = useMemo(() => {
    const map = new Map<string, { income: number; expenses: number }>();
    filteredTransactions.forEach(tx => {
      const key = tx.taxCategory || 'Sonstiges';
      if (!map.has(key)) map.set(key, { income: 0, expenses: 0 });
      const bucket = map.get(key)!;
      if (tx.invoiceType === InvoiceType.OUTGOING) bucket.income += tx.amount; else bucket.expenses += tx.amount;
    });
    const rows = Array.from(map.entries()).map(([taxCategory, v]) => ({
      taxCategory,
      income: v.income,
      expenses: v.expenses,
      net: v.income - v.expenses,
    }));
    rows.sort((a,b) => b.net - a.net);
    return rows;
  }, [filteredTransactions]);

  const exportCsv = (onlySelection = false) => {
    const scope = onlySelection && selectedIds.size > 0
      ? filteredTransactions.filter(tx => selectedIds.has(tx.id))
      : filteredTransactions;
    const header = [
      'ID', 'Datum', 'Beschreibung', 'Betrag_EUR', 'Typ', 'Steuerkategorie', 'Status', 'Quelle', 'Belegname', 'Notizen'
    ];
    const rows = scope.map(tx => {
      const doc = tx.documentId ? documents.find(d => d.id === tx.documentId) : undefined;
      return [
        tx.id,
        tx.date.toISOString().split('T')[0],
        tx.description.replace(/"/g, '""'),
        tx.amount.toFixed(2),
        tx.invoiceType === InvoiceType.OUTGOING ? 'Einnahme' : 'Ausgabe',
        tx.taxCategory,
        statusBadgeStyle[tx.status].label,
        sourceLabels[tx.source],
        doc?.name || '',
        (tx.notes || '').replace(/"/g, '""'),
      ];
    });
    const csv = [header, ...rows]
      .map(r => r.map(v => (v?.includes(',') || v?.includes('"') ? `"${v.replace(/"/g, '""')}"` : v)).join(','))
      .join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `transaktionen_${onlySelection ? 'auswahl' : 'gefiltert'}_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const exportAggregationCsv = () => {
    const header = ['Steuerkategorie','Einnahmen_EUR','Ausgaben_EUR','Netto_EUR'];
    const rows = aggregatedByTaxCategory.map(r => [
      r.taxCategory.replace(/"/g,'""'),
      r.income.toFixed(2),
      r.expenses.toFixed(2),
      r.net.toFixed(2),
    ]);
    rows.push(['GESAMT', filteredTotals.income.toFixed(2), filteredTotals.expenses.toFixed(2), filteredTotals.net.toFixed(2)]);
    const csv = [header, ...rows].map(r => r.map(v => (v.includes(',')?`"${v}"`:v)).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `aggregation_${new Date().toISOString().split('T')[0]}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    addToast('Aggregation als CSV exportiert', 'success');
  };

  const toggleRowSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const toggleSelectPage = () => {
    const pageIds = pagination.slice.map(tx => tx.id);
    const allSelected = pageIds.every(id => selectedIds.has(id));
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) {
        pageIds.forEach(id => next.delete(id));
      } else {
        pageIds.forEach(id => next.add(id));
      }
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());
  const bulkDelete = () => {
    if (selectedIds.size === 0) return;
    if (!window.confirm(`${selectedIds.size} Transaktion(en) löschen?`)) return;
    setTransactions(prev => { pushUndo(prev); return prev.filter(tx => !selectedIds.has(tx.id)); });
    clearSelection();
  };

  const visibleColumnOrder: Array<{ key: string; label: string; sortable?: boolean; sortKey?: SortKey }> = [
    { key: 'date', label: 'Datum', sortable: true, sortKey: 'date' },
    { key: 'description', label: 'Beschreibung' },
    { key: 'amount', label: 'Betrag', sortable: true, sortKey: 'amount' },
    { key: 'taxCategory', label: 'Steuerkategorie', sortable: true, sortKey: 'taxCategory' },
    { key: 'type', label: 'Typ' },
    { key: 'document', label: 'Beleg' },
    { key: 'status', label: 'Status' },
    { key: 'actions', label: 'Aktionen' },
  ];
  const activeColumns = visibleColumnOrder.filter(c => visibleColumns[c.key]);
  const totalVisibleColumns = 1 + activeColumns.length; // + Auswahl Spalte

  const handleOpenNew = () => {
    setFormState(prepareFormState());
    setIsModalOpen(true);
    setFormError(null);
  };

  const handleEdit = (transaction: AccountingTransaction) => {
    setFormState(prepareFormState(transaction));
    setIsModalOpen(true);
    setFormError(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormState(null);
    setFormError(null);
  };

  const handleChange = <K extends keyof TransactionFormState>(key: K, value: TransactionFormState[K]) => {
    if (!formState) return;
    setFormState({ ...formState, [key]: value });
  };

  const handleSave = () => {
    if (!formState) return;

    if (!formState.description.trim()) {
      setFormError('Bitte geben Sie eine aussagekräftige Beschreibung an.');
      return;
    }

    if (!formState.date) {
      setFormError('Bitte wählen Sie ein Buchungsdatum.');
      return;
    }

    if (!Number.isFinite(formState.amount) || formState.amount === 0) {
      setFormError('Der Betrag darf nicht 0 sein.');
      return;
    }

    if (!formState.taxCategory.trim()) {
      setFormError('Bitte geben Sie eine Steuerkategorie an.');
      return;
    }

    const transaction = toTransaction(formState);

    setTransactions(prev => {
      pushUndo(prev);
      const exists = prev.some(tx => tx.id === transaction.id);
      const next = exists
        ? prev.map(tx => (tx.id === transaction.id ? transaction : tx))
        : [transaction, ...prev];
      return [...next].sort((a, b) => b.date.getTime() - a.date.getTime());
    });
    addToast(isEditing ? 'Transaktion aktualisiert' : 'Transaktion erstellt', 'success');

    if (transaction.documentId) {
      const defaultStorage = storageLocations.find(loc => loc.isDefault)?.id ?? DEFAULT_DIGITAL_STORAGE_ID;
      setDocuments(prevDocs =>
        prevDocs.map(doc => {
          if (doc.id !== transaction.documentId) return doc;
          if (doc.storageLocationId) return doc;
          return {
            ...doc,
            storageLocationId: defaultStorage,
          };
        })
      );
    }

    handleCloseModal();
  };

  const handleDelete = (transaction: AccountingTransaction) => {
    if (!window.confirm('Transaktion wirklich löschen?')) return;
    setTransactions(prev => { pushUndo(prev); return prev.filter(tx => tx.id !== transaction.id); });
    addToast('Transaktion gelöscht', 'info');
    handleCloseModal();
  };

  const toggleSort = (key: SortKey, shift = false) => {
    if (!shift) {
      if (sortKey === key) {
        setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
      } else {
        setSortKey(key); setSortDirection('desc');
      }
      setMultiSort([]);
      return;
    }
    setMultiSort(prev => {
      const existing = prev.find(p => p.key === key);
      if (!existing) return [...prev, { key, direction: 'desc' }];
      return prev.map(p => p.key === key ? { ...p, direction: p.direction === 'asc' ? 'desc' : 'asc' } : p);
    });
  };

  const renderSortIcon = (key: SortKey) => {
    const multi = multiSort.find(m => m.key === key);
    if (!multi && sortKey !== key) return <ChevronDownIcon className="w-4 h-4 text-slate-400" />;
    if (multi) {
      return (
        <span className={`flex items-center ${multi.direction === 'asc' ? 'rotate-180' : ''}`}>
          <ChevronDownIcon className="w-4 h-4 text-slate-500" />
          <span className="ml-0.5 text-[10px] font-semibold text-slate-500">{multiSort.indexOf(multi)+1}</span>
        </span>
      );
    }
    if (sortKey !== key) return <ChevronDownIcon className="w-4 h-4 text-slate-400" />;
    return (
      <ChevronDownIcon
        className={`w-4 h-4 text-slate-500 transition-transform ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`}
      />
    );
  };

  const beginInlineEdit = (id: string, field: 'description' | 'amount' | 'taxCategory') => {
    setInlineEdit({ id, field });
  };

  const commitInlineEdit = (id: string, field: 'description' | 'amount' | 'taxCategory', value: string) => {
    setTransactions(prev => {
      pushUndo(prev);
      return prev.map(tx => {
        if (tx.id !== id) return tx;
        if (field === 'amount') {
          const num = Number(value.replace(/,/g, '.'));
          if (!isNaN(num)) return { ...tx, amount: num, updatedAt: new Date() };
          return tx;
        }
        if (field === 'description') return { ...tx, description: value, updatedAt: new Date() };
        if (field === 'taxCategory') return { ...tx, taxCategory: value || 'Sonstiges', updatedAt: new Date() };
        return tx;
      });
    });
    setInlineEdit(null);
    addToast('Änderung gespeichert', 'success');
  };

  const cancelInlineEdit = () => setInlineEdit(null);

  const inlineInput = (transaction: AccountingTransaction, field: 'description' | 'amount' | 'taxCategory', className?: string) => {
    const isActive = inlineEdit && inlineEdit.id === transaction.id && inlineEdit.field === field;
    if (!isActive) return null;
    const baseClasses = 'w-full border border-blue-300 rounded px-1 py-0.5 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white';
    const commonProps = {
      autoFocus: true,
      onBlur: (e: React.FocusEvent<HTMLInputElement>) => commitInlineEdit(transaction.id, field, e.target.value.trim()),
      onKeyDown: (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key === 'Enter') commitInlineEdit(transaction.id, field, (e.target as HTMLInputElement).value.trim());
        if (e.key === 'Escape') { cancelInlineEdit(); (e.target as HTMLInputElement).blur(); }
      },
      className: `${baseClasses} ${className || ''}`,
    };
    if (field === 'amount') {
      return <input type="number" step="0.01" defaultValue={transaction.amount.toFixed(2)} {...commonProps} />;
    }
    return <input type="text" defaultValue={transaction[field] as string} {...commonProps} />;
  };

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Gesamteinnahmen</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">{formatCurrency(summary.income)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Gesamtausgaben</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{formatCurrency(summary.expenses)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Belege fehlen</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{summary.missing}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Offene Aufgaben</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{summary.openTasks}</p>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-64">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <SearchIcon className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Transaktionen durchsuchen..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value as TypeFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Typen</option>
              <option value={InvoiceType.OUTGOING}>Einnahmen</option>
              <option value={InvoiceType.INCOMING}>Ausgaben</option>
            </select>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as StatusFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Status</option>
              <option value={TransactionStatus.COMPLETE}>Beleg verknüpft</option>
              <option value={TransactionStatus.MISSING_RECEIPT}>Beleg fehlt</option>
              <option value={TransactionStatus.DRAFT}>Entwurf</option>
            </select>
            <select
              value={taxCategoryFilter}
              onChange={event => setTaxCategoryFilter(event.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Kategorien</option>
              {taxCategories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              onClick={() => setShowImportModal(true)}
              className="inline-flex items-center justify-center bg-emerald-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-emerald-700 transition"
            >
              <SparklesIcon className="w-4 h-4 mr-2" /> Importieren
            </button>
            <button
              onClick={() => setShowAggregation(s => !s)}
              className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-200 transition border border-slate-300"
            >
              {showAggregation ? 'Aggregation aus' : 'Aggregation an'}
            </button>
            <div className="relative" ref={columnMenuRef}>
              <button
                onClick={() => setShowColumnMenu(s => !s)}
                className="inline-flex items-center justify-center bg-slate-100 text-slate-700 font-semibold px-4 py-2 rounded-lg hover:bg-slate-200 transition border border-slate-300"
                title="Sichtbare Spalten konfigurieren"
              >
                Spalten
              </button>
              {showColumnMenu && (
                <div className="absolute right-0 mt-2 w-56 rounded-lg border border-slate-200 bg-white shadow-lg z-20 p-2 space-y-1">
                  <p className="text-xs font-semibold text-slate-500 px-1">Spalten ein/aus</p>
                  {visibleColumnOrder.map(col => (
                    <label key={col.key} className="flex items-center gap-2 px-2 py-1 rounded hover:bg-slate-50 text-sm cursor-pointer select-none">
                      <input
                        type="checkbox"
                        className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={visibleColumns[col.key]}
                        onChange={() => setVisibleColumns(v => ({ ...v, [col.key]: !v[col.key] }))}
                      />
                      <span className="truncate">{col.label}</span>
                    </label>
                  ))}
                </div>
              )}
            </div>
            <button
              onClick={() => exportCsv(false)}
              className="inline-flex items-center justify-center bg-slate-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-slate-700 transition"
              title="Gefilterte Transaktionen als CSV exportieren"
            >
              CSV
            </button>
            <button
              onClick={() => exportCsv(true)}
              disabled={selectedIds.size === 0}
              className="inline-flex items-center justify-center bg-slate-500 disabled:opacity-40 text-white font-semibold px-4 py-2 rounded-lg hover:bg-slate-600 transition"
              title="Nur Auswahl exportieren"
            >
              Auswahl
            </button>
            <button
              onClick={handleOpenNew}
              className="inline-flex items-center justify-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Transaktion hinzufügen
            </button>
            <div className="flex items-center gap-1 text-xs text-slate-500 ml-2">
              <span>{pagination.total} Treffer</span>
              <span>·</span>
              <span>{pagination.start}-{pagination.end}</span>
            </div>
          </div>
        </div>

        <div className="overflow-x-auto max-h-[60vh] overflow-y-auto rounded-lg border border-slate-200 relative">
          <table className="min-w-full divide-y divide-slate-200 relative" aria-label="Buchungsliste">
            <thead className="bg-slate-50 sticky top-0 z-10 shadow-[0_1px_0_0_rgba(0,0,0,0.05)]">
              <tr>
                <th className="px-2 py-3 w-8 text-center">
                  <input
                    type="checkbox"
                    aria-label="Seite auswählen"
                    className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                    onChange={toggleSelectPage}
                    checked={pagination.slice.length > 0 && pagination.slice.every(tx => selectedIds.has(tx.id))}
                  />
                </th>
                {activeColumns.map(col => {
                  const isSortable = col.sortable && col.sortKey;
                  const isActiveSort = isSortable && sortKey === col.sortKey;
                  return (
                    <th
                      key={col.key}
                      className={`px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider ${isSortable ? 'cursor-pointer text-slate-600' : 'text-slate-600'} select-none`}
                      onClick={() => isSortable && toggleSort(col.sortKey!)}
                      aria-sort={isActiveSort ? (sortDirection === 'asc' ? 'ascending' : 'descending') : 'none'}
                    >
                      <span className="inline-flex items-center gap-1">
                        {col.label}
                        {isSortable && <span className="inline-flex ml-0.5 align-middle">{renderSortIcon(col.sortKey!)}</span>}
                      </span>
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {pagination.slice.map(transaction => {
                const relatedDocument = transaction.documentId
                  ? documents.find(doc => doc.id === transaction.documentId)
                  : undefined;
                const badge = statusBadgeStyle[transaction.status];
                const isSelected = selectedIds.has(transaction.id);
                return (
                  <tr
                    key={transaction.id}
                    onContextMenu={(e) => { e.preventDefault(); setContextMenu({ x: e.clientX, y: e.clientY, id: transaction.id }); }}
                    className={`hover:bg-slate-50 ${transaction.status === TransactionStatus.MISSING_RECEIPT ? 'bg-amber-50/30' : ''} ${isSelected ? 'ring-1 ring-inset ring-blue-300 bg-blue-50/40' : ''}`}
                  >
                    <td className="px-2 py-3 text-center align-top">
                      <input
                        type="checkbox"
                        aria-label="Transaktion auswählen"
                        className="h-4 w-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500"
                        checked={isSelected}
                        onChange={() => toggleRowSelection(transaction.id)}
                      />
                    </td>
                    {visibleColumns.date && (
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap align-top" title={transaction.date.toISOString()}>{formatDate(transaction.date)}</td>
                    )}
                    {visibleColumns.description && (
                      <td className="px-4 py-3 text-sm text-slate-700 max-w-xs align-top group">
                        <div
                          className="font-medium text-slate-800 truncate cursor-text group-hover:underline decoration-dotted"
                          title={transaction.description}
                          onDoubleClick={() => beginInlineEdit(transaction.id, 'description')}
                        >
                          {inlineEdit?.id === transaction.id && inlineEdit.field === 'description'
                            ? inlineInput(transaction, 'description')
                            : transaction.description}
                        </div>
                        <div className="text-xs text-slate-500">Quelle: {sourceLabels[transaction.source]}</div>
                        {transaction.notes && <div className="text-[11px] mt-1 text-slate-400 line-clamp-1" title={transaction.notes}>📝 {transaction.notes}</div>}
                      </td>
                    )}
                    {visibleColumns.amount && (
                      <td
                        className={`px-4 py-3 text-sm font-semibold whitespace-nowrap align-top text-right tabular-nums ${transaction.invoiceType === InvoiceType.OUTGOING ? 'text-green-600' : 'text-red-600'}`}
                        onDoubleClick={() => beginInlineEdit(transaction.id, 'amount')}
                      >
                        {inlineEdit?.id === transaction.id && inlineEdit.field === 'amount'
                          ? inlineInput(transaction, 'amount', 'text-right')
                          : formatCurrency(transaction.amount)}
                      </td>
                    )}
                    {visibleColumns.taxCategory && (
                      <td
                        className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap align-top cursor-text"
                        onDoubleClick={() => beginInlineEdit(transaction.id, 'taxCategory')}
                      >
                        {inlineEdit?.id === transaction.id && inlineEdit.field === 'taxCategory'
                          ? inlineInput(transaction, 'taxCategory')
                          : transaction.taxCategory}
                      </td>
                    )}
                    {visibleColumns.type && (
                      <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap align-top">{transaction.invoiceType === InvoiceType.OUTGOING ? 'Einnahme' : 'Ausgabe'}</td>
                    )}
                    {visibleColumns.document && (
                      <td className="px-4 py-3 text-sm text-slate-700 align-top">
                        {relatedDocument ? (
                          <button
                            onClick={() => onSelectDocument(relatedDocument)}
                            className="text-blue-600 hover:text-blue-700 font-medium"
                          >
                            {relatedDocument.name}
                          </button>
                        ) : (
                          <span className="inline-flex items-center text-amber-600 text-sm">
                            <AlertTriangleIcon className="w-4 h-4 mr-1" />
                            fehlt
                          </span>
                        )}
                      </td>
                    )}
                    {visibleColumns.status && (
                      <td className="px-4 py-3 text-sm align-top">
                        <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                          {badge.icon}
                          {badge.label}
                        </span>
                      </td>
                    )}
                    {visibleColumns.actions && (
                      <td className="px-4 py-3 text-sm text-right space-x-2 whitespace-nowrap align-top">
                        <button
                          onClick={() => handleEdit(transaction)}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                        >
                          <PencilIcon className="w-4 h-4 mr-1" />
                          Bearbeiten
                        </button>
                        <button
                          onClick={() => handleDelete(transaction)}
                          className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                        >
                          <TrashIcon className="w-4 h-4 mr-1" />
                          Löschen
                        </button>
                      </td>
                    )}
                  </tr>
                );
              })}
              {pagination.total === 0 && (
                <tr>
                  <td colSpan={totalVisibleColumns} className="px-4 py-6 text-center text-sm text-slate-500">
                    Keine Transaktionen gefunden.
                  </td>
                </tr>
              )}
            </tbody>
            <tfoot className="sticky bottom-0 bg-slate-100">
              <tr className="border-t border-slate-200 text-sm font-medium">
                <td className="px-2 py-2 text-xs text-slate-500">{selectedIds.size > 0 ? `${selectedIds.size} gewählt` : ''}</td>
                {visibleColumns.date && <td className="px-4 py-2 text-xs text-slate-500">Summen (gefiltert)</td>}
                {visibleColumns.description && <td className="px-4 py-2 text-xs text-slate-500" />}
                {visibleColumns.amount && (
                  <td className="px-4 py-2 whitespace-nowrap text-right text-xs">
                    <div className="flex flex-col items-end">
                      <span className="text-green-600">E: {formatCurrency(filteredTotals.income)}</span>
                      <span className="text-red-600">A: {formatCurrency(filteredTotals.expenses)}</span>
                      <span className={`font-semibold ${filteredTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>N: {formatCurrency(filteredTotals.net)}</span>
                    </div>
                  </td>
                )}
                {visibleColumns.taxCategory && <td className="px-4 py-2" />}
                {visibleColumns.type && <td className="px-4 py-2" />}
                {visibleColumns.document && <td className="px-4 py-2" />}
                {visibleColumns.status && <td className="px-4 py-2" />}
                {visibleColumns.actions && (
                  <td className="px-4 py-2 text-right text-[11px] text-slate-500">{formatDate(new Date())}</td>
                )}
              </tr>
            </tfoot>
          </table>
        </div>

        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <div className="flex items-center gap-2 text-sm">
            <label className="text-slate-600">Pro Seite:</label>
            <select
              value={pageSize}
              onChange={e => { setPageSize(Number(e.target.value)); setCurrentPage(1); }}
              className="border border-slate-300 rounded-md px-2 py-1 text-sm bg-white"
            >
              {[10,25,50,100].map(size => <option key={size} value={size}>{size}</option>)}
            </select>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-1">
              <button
                onClick={handleUndo}
                disabled={!undoStack.length}
                className="px-2 py-1.5 text-xs rounded-md border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50"
              >Undo</button>
              <button
                onClick={handleRedo}
                disabled={!redoStack.length}
                className="px-2 py-1.5 text-xs rounded-md border border-slate-300 bg-white disabled:opacity-40 hover:bg-slate-50"
              >Redo</button>
            </div>
            {selectedIds.size > 0 && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => exportCsv(true)}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 font-medium"
                >Export Auswahl</button>
                <button
                  onClick={bulkDelete}
                  className="px-3 py-1.5 text-xs rounded-md border border-red-300 bg-red-50 hover:bg-red-100 text-red-600 font-medium"
                >Löschen ({selectedIds.size})</button>
                <button
                  onClick={clearSelection}
                  className="px-3 py-1.5 text-xs rounded-md border border-slate-300 bg-white hover:bg-slate-50 text-slate-600"
                >Auswahl aufheben</button>
              </div>
            )}
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={pagination.page === 1}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Zurück
            </button>
            <div className="text-xs text-slate-600">Seite {pagination.page} / {pagination.totalPages}</div>
            <button
              onClick={() => setCurrentPage(p => Math.min(pagination.totalPages, p + 1))}
              disabled={pagination.page === pagination.totalPages}
              className="px-3 py-1.5 text-sm rounded-md border border-slate-300 bg-white disabled:opacity-40 disabled:cursor-not-allowed hover:bg-slate-50"
            >
              Weiter
            </button>
          </div>
        </div>
      </section>

      {showAggregation && (
        <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-700">Aggregation nach Steuerkategorie (gefilterte Daten)</h3>
            <span className="text-xs text-slate-500">{aggregatedByTaxCategory.length} Kategorien</span>
          </div>
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-2 text-left font-semibold text-slate-600">Steuerkategorie</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">Einnahmen</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">Ausgaben</th>
                  <th className="px-4 py-2 text-right font-semibold text-slate-600">Netto</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {aggregatedByTaxCategory.map(row => (
                  <tr key={row.taxCategory} className="hover:bg-slate-50">
                    <td className="px-4 py-2 font-medium text-slate-700">{row.taxCategory}</td>
                    <td className="px-4 py-2 text-right text-green-600 tabular-nums">{formatCurrency(row.income)}</td>
                    <td className="px-4 py-2 text-right text-red-600 tabular-nums">{formatCurrency(row.expenses)}</td>
                    <td className={`px-4 py-2 text-right font-semibold tabular-nums ${row.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(row.net)}</td>
                  </tr>
                ))}
                {aggregatedByTaxCategory.length === 0 && (
                  <tr>
                    <td colSpan={4} className="px-4 py-4 text-center text-xs text-slate-500">Keine Daten</td>
                  </tr>
                )}
              </tbody>
              <tfoot>
                <tr className="bg-slate-100 border-t border-slate-200 text-sm">
                  <td className="px-4 py-2 font-semibold text-slate-700">Gesamt</td>
                  <td className="px-4 py-2 text-right text-green-700 font-medium">{formatCurrency(filteredTotals.income)}</td>
                  <td className="px-4 py-2 text-right text-red-700 font-medium">{formatCurrency(filteredTotals.expenses)}</td>
                  <td className={`px-4 py-2 text-right font-bold ${filteredTotals.net >= 0 ? 'text-emerald-700' : 'text-rose-700'}`}>{formatCurrency(filteredTotals.net)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        </section>
      )}

      {isModalOpen && formState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                {isEditing ? 'Transaktion bearbeiten' : 'Neue Transaktion'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-500 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="px-6 py-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600">Datum</label>
                  <input
                    type="date"
                    value={formState.date}
                    onChange={event => handleChange('date', event.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Betrag</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.amount}
                    onChange={event => handleChange('amount', Number(event.target.value))}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600">Beschreibung</label>
                  <input
                    type="text"
                    value={formState.description}
                    onChange={event => handleChange('description', event.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Typ</label>
                  <select
                    value={formState.invoiceType}
                    onChange={event => handleChange('invoiceType', event.target.value as InvoiceType)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={InvoiceType.OUTGOING}>Einnahme</option>
                    <option value={InvoiceType.INCOMING}>Ausgabe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Steuerkategorie</label>
                  <input
                    type="text"
                    value={formState.taxCategory}
                    onChange={event => handleChange('taxCategory', event.target.value)}
                    list="transaction-tax-categories"
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <datalist id="transaction-tax-categories">
                    {taxCategories.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Beleg verknüpfen</label>
                  <select
                    value={formState.documentId || ''}
                    onChange={event => handleChange('documentId', event.target.value || undefined)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Kein Beleg verknüpft</option>
                    {documents.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600">Notiz</label>
                  <textarea
                    value={formState.notes || ''}
                    onChange={event => handleChange('notes', event.target.value)}
                    rows={3}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                Erstellt am {formatDate(formState.createdAt)} · Zuletzt aktualisiert am {formatDate(formState.updatedAt)}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  Abbrechen
                </button>
                {isEditing && (
                  <button
                    onClick={() => handleDelete(toTransaction(formState))}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                  >
                    Löschen
                  </button>
                )}
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

  {showImportModal && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black/50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-5xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                <SparklesIcon className="w-5 h-5 mr-2 text-emerald-600" /> Import Center
              </h2>
              <button onClick={() => setShowImportModal(false)} className="text-slate-500 hover:text-slate-700">✕</button>
            </div>
            <div className="px-6 py-6 space-y-8 max-h-[75vh] overflow-y-auto text-sm">
              <div className="grid md:grid-cols-3 gap-4">
                <div className={`p-4 border rounded-lg space-y-3 ${importSources.lexoffice ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <label className="flex items-center gap-2 font-medium cursor-pointer select-none">
                    <input type="checkbox" checked={importSources.lexoffice} onChange={e => setImportSources(s => ({ ...s, lexoffice: e.target.checked }))} />
                    Lexoffice
                  </label>
                  {importSources.lexoffice && (
                    <div className="space-y-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-600">Voreinstellung Zeitraum</label>
                        <select
                          value={rangePreset}
                          onChange={e => handlePresetChange(e.target.value as RangePreset)}
                          className="mt-1 w-full border border-slate-300 rounded-md px-2 py-1 focus:ring-blue-500 focus:border-blue-500 text-xs"
                        >
                          <option value="current-month">Aktueller Monat</option>
                          <option value="current-year">Aktuelles Jahr</option>
                          <option value="last-year">Letztes Jahr</option>
                          <option value={`year-${now.getFullYear() - 2}`}>Jahr {now.getFullYear() - 2}</option>
                          <option value={`year-${now.getFullYear() - 1}`}>Jahr {now.getFullYear() - 1}</option>
                          <option value={`year-${now.getFullYear()}`}>Jahr {now.getFullYear()}</option>
                          <option value="custom">Benutzerdefiniert</option>
                        </select>
                      </div>
                      <div className="flex gap-2">
                        <div className="flex-1">
                          <label className="block text-[11px] font-medium text-slate-600">Start</label>
                          <input type="date" value={startDate} onChange={e => { setStartDate(e.target.value); setRangePreset('custom'); }} className="mt-0.5 w-full border border-slate-300 rounded-md px-2 py-1 text-xs" />
                        </div>
                        <div className="flex-1">
                          <label className="block text-[11px] font-medium text-slate-600">Ende</label>
                          <input type="date" value={endDate} onChange={e => { setEndDate(e.target.value); setRangePreset('custom'); }} className="mt-0.5 w-full border border-slate-300 rounded-md px-2 py-1 text-xs" />
                        </div>
                      </div>
                      <label className="flex items-center gap-2 text-xs text-slate-600 select-none">
                        <input type="checkbox" checked={includeDocuments} onChange={e => setIncludeDocuments(e.target.checked)} className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500" />
                        Belege mit importieren
                      </label>
                      <div className="text-[11px] text-slate-500">Modus: {isLiveMode ? 'Live (API Key gesetzt)' : 'Simulation'}</div>
                    </div>
                  )}
                </div>
                <div className={`p-4 border rounded-lg space-y-3 ${importSources.local ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <label className="flex items-center gap-2 font-medium cursor-pointer select-none">
                    <input type="checkbox" checked={importSources.local} onChange={e => setImportSources(s => ({ ...s, local: e.target.checked }))} />
                    Lokale Dateien
                  </label>
                  {importSources.local && (
                    <div className="space-y-3">
                      <div className="border-2 border-dashed rounded-md p-4 text-xs text-slate-500 bg-white">
                        <p className="mb-2 font-medium text-slate-600">Dateien wählen/ziehen</p>
                        <input
                          type="file"
                          multiple
                          onChange={e => handleLocalFiles(e.target.files)}
                          className="block text-xs"
                          accept="application/pdf,image/*"
                        />
                        {localFiles.length > 0 && (
                          <p className="mt-2 text-[11px] text-slate-500">{localFiles.length} Datei(en) ausgewählt.</p>
                        )}
                      </div>
                      {localImportSummary && (
                        <div className="rounded bg-emerald-50 border border-emerald-200 px-2 py-1 text-[11px] text-emerald-700">Zuletzt: {localImportSummary.added} Dokument(e)</div>
                      )}
                    </div>
                  )}
                </div>
                <div className={`p-4 border rounded-lg space-y-3 ${importSources.gdrive ? 'border-emerald-400 bg-emerald-50/40' : 'border-slate-200 bg-slate-50'}`}>
                  <label className="flex items-center gap-2 font-medium cursor-pointer select-none">
                    <input type="checkbox" checked={importSources.gdrive} onChange={e => setImportSources(s => ({ ...s, gdrive: e.target.checked }))} />
                    Google Drive
                  </label>
                  {importSources.gdrive && (
                    <div className="space-y-3 text-xs text-slate-600">
                      <p>Integration folgt. Platzhalter.</p>
                      <button disabled className="px-3 py-1.5 rounded-md bg-slate-200 text-slate-500 text-xs">Authentifizieren</button>
                    </div>
                  )}
                </div>
              </div>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4 justify-between">
                <div className="flex items-center gap-2 text-xs text-slate-500 flex-wrap">
                  <span>Quellen aktiv:</span>
                  {Object.entries(importSources).filter(([_, v]) => v).map(([k]) => (
                    <span key={k} className="px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium capitalize">{k}</span>
                  ))}
                  {Object.entries(importSources).every(([_, v]) => !v) && <span className="text-amber-600">Keine Quelle ausgewählt</span>}
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={handleRunMultiImport}
                    disabled={multiImportRunning || Object.values(importSources).every(v => !v)}
                    className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-600 disabled:bg-emerald-300 text-white font-semibold text-sm shadow hover:bg-emerald-700"
                  >
                    {multiImportRunning && <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-b-transparent" />}
                    {multiImportRunning ? 'Läuft…' : 'Import starten'}
                  </button>
                  <button
                    onClick={() => { setImportSources({ lexoffice: true, local: false, gdrive: false }); setLocalFiles([]); setLocalImportSummary(null); setMultiImportLog([]); }}
                    disabled={multiImportRunning}
                    className="px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white hover:bg-slate-50"
                  >Zurücksetzen</button>
                </div>
              </div>

              {(importFeedback || importSummary || localImportSummary) && (
                <div className="grid md:grid-cols-3 lg:grid-cols-6 gap-3 text-center">
                  {importFeedback && (
                    <div className={`rounded-lg p-3 border text-xs ${importFeedback.type === 'success' ? 'bg-green-50 border-green-200 text-green-700' : 'bg-red-50 border-red-200 text-red-700'}`}>{importFeedback.message}</div>
                  )}
                  {importSummary && (
                    <>
                      <div className="rounded-lg p-3 border border-slate-200 bg-slate-50">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Neu</p>
                        <p className="text-lg font-bold text-slate-800">{importSummary.imported}</p>
                      </div>
                      <div className="rounded-lg p-3 border border-slate-200 bg-slate-50">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Aktualisiert</p>
                        <p className="text-lg font-bold text-slate-800">{importSummary.updated}</p>
                      </div>
                      <div className="rounded-lg p-3 border border-slate-200 bg-slate-50">
                        <p className="text-[10px] font-semibold uppercase text-slate-500">Übersprungen</p>
                        <p className="text-lg font-bold text-slate-800">{importSummary.skipped}</p>
                      </div>
                      <div className="rounded-lg p-3 border border-amber-200 bg-amber-50">
                        <p className="text-[10px] font-semibold uppercase text-amber-600">Fehlende Belege</p>
                        <p className="text-lg font-bold text-amber-700">{importSummary.missingReceipts}</p>
                      </div>
                    </>
                  )}
                  {localImportSummary && (
                    <div className="rounded-lg p-3 border border-emerald-200 bg-emerald-50">
                      <p className="text-[10px] font-semibold uppercase text-emerald-600">Lokale Dokumente</p>
                      <p className="text-lg font-bold text-emerald-700">{localImportSummary.added}</p>
                    </div>
                  )}
                </div>
              )}

              {importNotifications.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                  <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
                    <CheckCircleIcon className="h-4 w-4 text-emerald-500" /> Import-Notizen
                  </p>
                  <ul className="space-y-2 text-xs text-slate-600">
                    {importNotifications.map((note, idx) => (
                      <li key={idx} className="flex items-start gap-2">
                        <AlertTriangleIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                        <span>{note}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {multiImportLog.length > 0 && (
                <div className="rounded-lg border border-slate-200 bg-white p-3 max-h-40 overflow-y-auto text-[11px] font-mono leading-relaxed">
                  {multiImportLog.map((l,i) => <div key={i}>{l}</div>)}
                </div>
              )}
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-end items-center gap-4">
              <div className="text-[10px] text-slate-500">Schließen ohne Import möglich.</div>
              <button onClick={() => setShowImportModal(false)} className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">Schließen</button>
            </div>
          </div>
        </div>
      )}
      {contextMenu && (
        <div
          className="fixed z-50 w-48 bg-white border border-slate-200 rounded-md shadow-lg text-sm"
          style={{ top: contextMenu.y, left: contextMenu.x }}
        >
          <button
            onClick={() => { toggleRowSelection(contextMenu.id); setContextMenu(null); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
          >{selectedIds.has(contextMenu.id) ? 'Auswahl entfernen' : 'Auswählen'}</button>
          <button
            onClick={() => { const t = transactions.find(tx => tx.id === contextMenu.id); if (t) handleEdit(t); setContextMenu(null); }}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
          >Bearbeiten</button>
          <button
            onClick={() => { const t = transactions.find(tx => tx.id === contextMenu.id); if (t) handleDelete(t); setContextMenu(null); }}
            className="w-full text-left px-3 py-2 text-xs text-red-600 hover:bg-red-50 hover:text-red-700"
          >Löschen</button>
          <button
            onClick={() => setContextMenu(null)}
            className="w-full text-left px-3 py-2 text-xs hover:bg-slate-50"
          >Schließen</button>
        </div>
      )}
    </div>
  );
};

export default AccountingView;
