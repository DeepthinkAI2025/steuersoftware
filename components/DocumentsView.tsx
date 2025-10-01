import React, { useState, useMemo, useCallback } from 'react';
import { Document, DocumentStatus, InvoiceType, Rule, RuleSuggestion, LexofficeStatus, DocumentFilter, StorageLocation, StorageLocationType } from '../types';
import DocumentItem from './DocumentItem';
import UploadModal from './UploadModal';
import { PlusIcon } from './icons/PlusIcon';
import FolderIcon from './icons/FolderIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import SearchIcon from './icons/SearchIcon';
import ArchiveIcon from './icons/ArchiveIcon';
import TrashIcon from './icons/TrashIcon';
import SortAscIcon from './icons/SortAscIcon';
import SortDescIcon from './icons/SortDescIcon';
import FilterIcon from './icons/FilterIcon';
import ChartBarIcon from './icons/ChartBarIcon';
import SparklesIcon from './icons/SparklesIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';

interface DocumentsViewProps {
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  activeFilter: DocumentFilter | null;
  rules: Rule[];
  onRuleSuggestion: (suggestion: RuleSuggestion) => void;
  apiKey: string;
  lexofficeApiKey: string;
  onSelectDocument: (document: Document) => void;
  storageLocations: StorageLocation[];
  setStorageLocations: React.Dispatch<React.SetStateAction<StorageLocation[]>>;
  onReanalyzeDocument: (document: Document) => Promise<void>;
  reanalyzingDocumentIds: string[];
  onUploadSuccess: (message: string) => void;
  onUploadError: (message: string) => void;
  onDuplicateDetected: (doc: Document) => void;
  onCompareDuplicate: (doc: Document) => void;
}

interface GroupedDocuments {
  [year: number]: {
    [quarter: number]: Document[];
  };
}

const DocumentsView: React.FC<DocumentsViewProps> = ({ documents, setDocuments, activeFilter, rules, onRuleSuggestion, apiKey, lexofficeApiKey, onSelectDocument, storageLocations, setStorageLocations, onReanalyzeDocument, reanalyzingDocumentIds, onUploadSuccess, onUploadError, onDuplicateDetected, onCompareDuplicate }) => {
  const [isUploadModalOpen, setIsUploadModalOpen] = useState(false);
  const [expandedFolders, setExpandedFolders] = useState<{ [key: string]: boolean }>({ [new Date().getFullYear()]: true, [`${new Date().getFullYear()}-Q${Math.floor((new Date().getMonth() + 3) / 3)}`]: true});
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDocumentIds, setSelectedDocumentIds] = useState<Set<string>>(new Set());
  const [sendingDocId, setSendingDocId] = useState<string | null>(null);
  
  const [sortConfig, setSortConfig] = useState<{ key: 'date' | 'name' | 'vendor' | 'amount' | 'confidence'; direction: 'ascending' | 'descending' }>({ key: 'date', direction: 'descending' });
  const [statusFilter, setStatusFilter] = useState<DocumentStatus | 'all'>('all');
  const [typeFilter, setTypeFilter] = useState<InvoiceType | 'all'>('all');
  const [storageFilter, setStorageFilter] = useState<string>('all');
  const [confidenceFilter, setConfidenceFilter] = useState<'all' | 'high' | 'medium' | 'low'>('all');
  const [showWarningsOnly, setShowWarningsOnly] = useState(false);

  const activeDocuments = useMemo(() => {
      return documents.filter(doc => doc.status !== DocumentStatus.ARCHIVED);
  }, [documents]);

  const overview = useMemo(() => {
    const total = documents.length;
    const warningCount = documents.filter(doc => {
      const hasOcrWarnings = (doc.ocrMetadata?.warnings?.length || 0) > 0;
      const hasStatusWarning = [DocumentStatus.MISSING_INVOICE, DocumentStatus.ERROR, DocumentStatus.POTENTIAL_DUPLICATE].includes(doc.status);
      return hasOcrWarnings || hasStatusWarning;
    }).length;
    const missingCount = documents.filter(doc => [DocumentStatus.MISSING_INVOICE, DocumentStatus.SCREENSHOT, DocumentStatus.ERROR].includes(doc.status)).length;
    const analysedDocs = documents.filter(doc => typeof doc.ocrMetadata?.averageConfidence === 'number');
    const analysedCount = analysedDocs.length;
    const averageConfidence = analysedCount > 0
      ? Number((analysedDocs.reduce((sum, doc) => sum + (doc.ocrMetadata?.averageConfidence ?? 0), 0) / analysedCount).toFixed(1))
      : 0;
    const withoutStorage = documents.filter(doc => !doc.storageLocationId).length;

    return { total, warningCount, missingCount, averageConfidence, withoutStorage, analysedCount };
  }, [documents]);
  
  const handleSendSingleToLexoffice = useCallback(async (docId: string) => {
    if (!lexofficeApiKey) {
        alert('Bitte hinterlegen Sie zuerst Ihren Lexoffice API-Schlüssel in den Einstellungen.');
        return;
    }
    setSendingDocId(docId);
    // Simulate API call
    await new Promise(resolve => setTimeout(resolve, 1500));

    const isSuccess = Math.random() > 0.1; // Simulate random failure for demo

    setDocuments(prevDocs => 
        prevDocs.map(doc => {
            if (doc.id === docId) {
                return {
                    ...doc,
                    lexoffice: {
                        status: isSuccess ? LexofficeStatus.SUCCESS : LexofficeStatus.FAILED,
                        sentAt: new Date(),
                    }
                };
            }
            return doc;
        })
    );
    setSendingDocId(null);
  }, [lexofficeApiKey, setDocuments]);

  const processedDocuments = useMemo(() => {
    let filtered = activeDocuments.filter(doc => {
      const statusMatch = statusFilter === 'all' || doc.status === statusFilter;
      const typeMatch = typeFilter === 'all' || doc.invoiceType === typeFilter;
      const storageMatch = storageFilter === 'all'
        ? true
        : storageFilter === 'none'
          ? !doc.storageLocationId
          : doc.storageLocationId === storageFilter;

      const confidenceValue = doc.ocrMetadata?.averageConfidence ?? null;
      const confidenceMatch = (() => {
        if (confidenceFilter === 'all') return true;
        if (confidenceValue === null) return false;
        if (confidenceFilter === 'high') return confidenceValue >= 90;
        if (confidenceFilter === 'medium') return confidenceValue >= 70 && confidenceValue < 90;
        if (confidenceFilter === 'low') return confidenceValue < 70;
        return true;
      })();

  const hasWarnings = (doc.ocrMetadata?.warnings?.length || 0) > 0 || [DocumentStatus.MISSING_INVOICE, DocumentStatus.ERROR, DocumentStatus.POTENTIAL_DUPLICATE].includes(doc.status);
  const warningsMatch = !showWarningsOnly || hasWarnings;

      if (!statusMatch || !typeMatch || !storageMatch || !confidenceMatch || !warningsMatch) return false;

      if (searchQuery.trim()) {
        const lowerCaseQuery = searchQuery.toLowerCase();
        return (
          doc.name.toLowerCase().includes(lowerCaseQuery) ||
          doc.vendor?.toLowerCase().includes(lowerCaseQuery) ||
          doc.textContent?.toLowerCase().includes(lowerCaseQuery) ||
          (doc.tags || []).some(tag => tag.toLowerCase().includes(lowerCaseQuery))
        );
      }
      return true;
    });

    filtered.sort((a, b) => {
      let comparison = 0;
      switch (sortConfig.key) {
        case 'name': comparison = a.name.localeCompare(b.name); break;
        case 'vendor': comparison = (a.vendor || '').localeCompare(b.vendor || ''); break;
        case 'amount': comparison = (a.totalAmount || 0) - (b.totalAmount || 0); break;
        case 'confidence': comparison = (a.ocrMetadata?.averageConfidence ?? -1) - (b.ocrMetadata?.averageConfidence ?? -1); break;
        case 'date': default: comparison = new Date(a.date).getTime() - new Date(b.date).getTime(); break;
      }
      return sortConfig.direction === 'ascending' ? comparison : -comparison;
    });
    return filtered;
  }, [activeDocuments, searchQuery, sortConfig, statusFilter, typeFilter, storageFilter, confidenceFilter, showWarningsOnly]);

  const groupedDocuments = useMemo(() => {
    return processedDocuments.reduce((acc, doc) => {
      const { year, quarter } = doc;
      if (!acc[year]) acc[year] = { 1: [], 2: [], 3: [], 4: [] };
      if (!acc[year][quarter]) acc[year][quarter] = [];
      acc[year][quarter].push(doc);
      return acc;
    }, {} as GroupedDocuments);
  }, [processedDocuments]);

  const toggleFolder = (key: string) => {
    setExpandedFolders(prev => ({ ...prev, [key]: !prev[key] }));
  };
  
  const handleToggleSelection = useCallback((id: string) => {
    setSelectedDocumentIds(prev => {
      const newSet = new Set(prev);
      if (newSet.has(id)) newSet.delete(id); else newSet.add(id);
      return newSet;
    });
  }, []);

  const handleToggleSelectAll = () => {
    if (selectedDocumentIds.size === processedDocuments.length) {
      setSelectedDocumentIds(new Set());
    } else {
      setSelectedDocumentIds(new Set(processedDocuments.map(doc => doc.id)));
    }
  };

  const handleDeleteSingle = useCallback((id: string) => {
    if (!window.confirm('Möchten Sie diesen Beleg wirklich endgültig löschen?')) return;

    (async () => {
      try {
        const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
        if (!response.ok && response.status !== 404) {
          throw new Error(await response.text());
        }

        setDocuments(prev => prev.filter(doc => doc.id !== id));
        setSelectedDocumentIds(prev => {
          if (!prev.has(id)) return prev;
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
        onUploadSuccess('Beleg gelöscht.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Löschen fehlgeschlagen.';
        onUploadError(message);
      }
    })();
  }, [onUploadError, onUploadSuccess, setDocuments]);

  const handleDelete = useCallback(() => {
    if (selectedDocumentIds.size === 0) return;
    if (!window.confirm(`Möchten Sie ${selectedDocumentIds.size} Beleg(e) wirklich endgültig löschen?`)) return;

    const ids = Array.from(selectedDocumentIds);
    const idsSet = new Set(ids);

    (async () => {
      try {
        await Promise.all(ids.map(async id => {
          const response = await fetch(`/api/documents/${id}`, { method: 'DELETE' });
          if (!response.ok && response.status !== 404) {
            throw new Error(await response.text());
          }
        }));

        setDocuments(prev => prev.filter(doc => !idsSet.has(doc.id)));
        setSelectedDocumentIds(new Set());
        onUploadSuccess(`${ids.length} Beleg(e) gelöscht.`);
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Löschen fehlgeschlagen.';
        onUploadError(message);
      }
    })();
  }, [onUploadError, onUploadSuccess, selectedDocumentIds, setDocuments]);

  const handleDeleteAll = useCallback(() => {
    if (documents.length === 0) return;
    if (!window.confirm('Möchten Sie wirklich alle Belege dauerhaft löschen?')) return;

    (async () => {
      try {
        const response = await fetch('/api/documents', { method: 'DELETE' });
        if (!response.ok) {
          throw new Error(await response.text());
        }
        setDocuments([]);
        setSelectedDocumentIds(new Set());
        onUploadSuccess('Alle Belege gelöscht.');
      } catch (error) {
        const message = error instanceof Error ? error.message : 'Löschen fehlgeschlagen.';
        onUploadError(message);
      }
    })();
  }, [documents.length, onUploadError, onUploadSuccess, setDocuments]);

  const handleArchive = () => {
    if (window.confirm(`Möchten Sie ${selectedDocumentIds.size} Beleg(e) wirklich archivieren?`)) {
        setDocuments(prev => prev.map(doc => 
            selectedDocumentIds.has(doc.id) ? { ...doc, status: DocumentStatus.ARCHIVED } : doc
        ));
        setSelectedDocumentIds(new Set());
    }
  };

  const handleUpdateStorage = useCallback((documentId: string, storageId?: string) => {
    setDocuments(prev => prev.map(doc => doc.id === documentId ? { ...doc, storageLocationId: storageId } : doc));
  }, [setDocuments]);

  const handleCreateStorageLocation = useCallback(() => {
    const label = window.prompt('Name der neuen Ablage?');
    if (!label) return;
    const trimmed = label.trim();
    if (!trimmed) return;

    setStorageLocations(prev => {
      if (prev.some(loc => loc.label.toLowerCase() === trimmed.toLowerCase())) {
        return prev;
      }
      const newLocation: StorageLocation = {
        id: `storage-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        label: trimmed,
        type: StorageLocationType.DIGITAL,
      };
      return [...prev, newLocation];
    });
  }, [setStorageLocations]);

  const handleReanalyze = useCallback(async (document: Document) => {
    try {
      await onReanalyzeDocument(document);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Reanalyse fehlgeschlagen.';
      alert(message);
    }
  }, [onReanalyzeDocument]);

  const handleSortDirectionToggle = () => setSortConfig(prev => ({ ...prev, direction: prev.direction === 'ascending' ? 'descending' : 'ascending' }));
  const handleSortKeyChange = (e: React.ChangeEvent<HTMLSelectElement>) => setSortConfig(prev => ({ ...prev, key: e.target.value as any }));

  const viewTitle = useMemo(() => {
    if (!activeFilter) return "Alle Belege";
    if (activeFilter.quarter) return `Belege für ${activeFilter.year} / Q${activeFilter.quarter}`;
    return `Alle Belege für ${activeFilter.year}`;
  }, [activeFilter]);

  const sortedYears = Object.keys(groupedDocuments).map(Number).sort((a, b) => b - a);

  return (
    <>
      <div className="flex flex-col md:flex-row justify-between md:items-center mb-6 gap-4">
        <h2 className="text-3xl font-bold text-slate-800">{viewTitle}</h2>
        <div className="flex flex-col sm:flex-row gap-2 w-full md:w-auto">
          <button
            onClick={() => setIsUploadModalOpen(true)}
            className="flex items-center justify-center bg-blue-600 text-white font-semibold py-2 px-5 rounded-lg hover:bg-blue-700 transition duration-300 shadow-sm w-full"
          >
            <PlusIcon className="w-5 h-5 mr-2" />
            Beleg hinzufügen
          </button>
          {documents.length > 0 && (
            <button
              onClick={handleDeleteAll}
              className="flex items-center justify-center border border-rose-200 bg-rose-50 text-rose-700 font-semibold py-2 px-5 rounded-lg hover:bg-rose-100 transition duration-300 shadow-sm w-full"
            >
              <TrashIcon className="w-5 h-5 mr-2" />
              Alle Belege löschen
            </button>
          )}
        </div>
      </div>

      <div className="grid gap-4 mb-6 md:grid-cols-2 xl:grid-cols-4">
        <div className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <span className="rounded-lg bg-blue-50 p-3 text-blue-600">
            <ChartBarIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Belege gesamt</p>
            <p className="text-2xl font-bold text-slate-900">{overview.total}</p>
            <p className="text-xs text-slate-500">{processedDocuments.length} aktiv</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-emerald-200 bg-white p-4 shadow-sm">
          <span className="rounded-lg bg-emerald-50 p-3 text-emerald-600">
            <SparklesIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ø OCR-Vertrauen</p>
            <p className="text-2xl font-bold text-slate-900">
              {overview.analysedCount > 0
                ? `${overview.averageConfidence.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`
                : '–'}
            </p>
            <p className="text-xs text-slate-500">
              {overview.analysedCount > 0 ? `${overview.analysedCount} analysiert` : 'Noch keine Analysen'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-amber-200 bg-white p-4 shadow-sm">
          <span className="rounded-lg bg-amber-50 p-3 text-amber-600">
            <AlertTriangleIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Warnungen</p>
            <p className="text-2xl font-bold text-slate-900">{overview.warningCount}</p>
            <p className="text-xs text-slate-500">{overview.missingCount} fehlen / fehlerhaft</p>
          </div>
        </div>
        <div className="flex items-center gap-4 rounded-xl border border-violet-200 bg-white p-4 shadow-sm">
          <span className="rounded-lg bg-violet-50 p-3 text-violet-600">
            <FolderIcon className="h-6 w-6" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Ohne Ablage</p>
            <p className="text-2xl font-bold text-slate-900">{overview.withoutStorage}</p>
            <p className="text-xs text-slate-500">{storageLocations.length} Ablagen verfügbar</p>
          </div>
        </div>
      </div>

      {reanalyzingDocumentIds.length > 0 && (
        <div className="mb-6 flex items-center gap-3 rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-sm font-medium text-blue-700">
          <SparklesIcon className="h-4 w-4" />
          <span>
            {reanalyzingDocumentIds.length} Beleg{reanalyzingDocumentIds.length > 1 ? 'e' : ''} werden aktuell neu analysiert.
          </span>
        </div>
      )}

      <div className="bg-white p-4 rounded-xl shadow-sm border border-slate-200">
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3">
            <div className="relative flex-grow w-full">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none"><SearchIcon className="w-5 h-5 text-slate-400" /></div>
              <input type="text" placeholder="Belege durchsuchen..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="block w-full pl-10 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white" />
            </div>
            {selectedDocumentIds.size > 0 && (
              <div className="flex items-center space-x-2 w-full sm:w-auto justify-end">
                <span className="text-sm text-slate-600">{selectedDocumentIds.size} ausgewählt</span>
                <button onClick={handleArchive} className="p-2 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-lg" title="Archivieren"><ArchiveIcon className="w-5 h-5" /></button>
                <button onClick={handleDelete} className="p-2 text-slate-500 hover:text-red-600 hover:bg-slate-100 rounded-lg" title="Löschen"><TrashIcon className="w-5 h-5" /></button>
              </div>
            )}
          </div>
          <div className="flex flex-col xl:flex-row xl:items-center flex-wrap gap-4 text-sm">
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="status-filter" className="text-slate-600 font-medium">Status:</label>
              <select
                id="status-filter"
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value as any)}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 focus:bg-white sm:flex-none"
              >
                <option value="all">Alle</option>
                {Object.values(DocumentStatus)
                  .filter(s => s !== DocumentStatus.ANALYZING && s !== DocumentStatus.ARCHIVED)
                  .map(status => (
                    <option key={status} value={status}>{status}</option>
                  ))}
              </select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="type-filter" className="text-slate-600 font-medium">Typ:</label>
              <select
                id="type-filter"
                value={typeFilter}
                onChange={e => setTypeFilter(e.target.value as any)}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 focus:bg-white sm:flex-none"
              >
                <option value="all">Alle Typen</option>
                <option value={InvoiceType.INCOMING}>Ausgaben</option>
                <option value={InvoiceType.OUTGOING}>Einnahmen</option>
              </select>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="storage-filter" className="text-slate-600 font-medium">Ablage:</label>
              <select
                id="storage-filter"
                value={storageFilter}
                onChange={e => setStorageFilter(e.target.value)}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 focus:bg-white sm:flex-none"
              >
                <option value="all">Alle Orte</option>
                <option value="none">Ohne Zuordnung</option>
                {storageLocations.map(location => (
                  <option key={location.id} value={location.id}>{location.label}</option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleCreateStorageLocation}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-medium text-slate-600 transition hover:bg-slate-100"
              >
                Neu
              </button>
            </div>
            <div className="flex items-center gap-2 w-full sm:w-auto">
              <label htmlFor="confidence-filter" className="text-slate-600 font-medium">OCR:</label>
              <select
                id="confidence-filter"
                value={confidenceFilter}
                onChange={e => setConfidenceFilter(e.target.value as 'all' | 'high' | 'medium' | 'low')}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 focus:bg-white sm:flex-none"
              >
                <option value="all">Alle Stufen</option>
                <option value="high">≥ 90 %</option>
                <option value="medium">70–89 %</option>
                <option value="low">&lt; 70 %</option>
              </select>
            </div>
            <button
              type="button"
              onClick={() => setShowWarningsOnly(prev => !prev)}
              aria-pressed={showWarningsOnly}
              className={`inline-flex items-center gap-2 rounded-lg border px-3 py-2 font-medium transition ${showWarningsOnly ? 'border-amber-200 bg-amber-50 text-amber-700' : 'border-slate-200 text-slate-600 hover:bg-slate-100'}`}
            >
              <FilterIcon className="h-4 w-4" />
              Warnungen
              <span className={`inline-flex h-5 min-w-[1.5rem] items-center justify-center rounded-full text-xs font-semibold ${showWarningsOnly ? 'bg-white/80 text-amber-700' : 'bg-slate-100 text-slate-600'}`}>
                {overview.warningCount}
              </span>
            </button>
            <div className="flex-grow" />
            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <label htmlFor="sort-by" className="text-slate-600 font-medium">Sortieren:</label>
              <select
                id="sort-by"
                value={sortConfig.key}
                onChange={handleSortKeyChange}
                className="flex-1 rounded-lg border border-slate-300 bg-slate-50 px-3 py-2 focus:bg-white sm:flex-none"
              >
                <option value="date">Datum</option>
                <option value="name">Name</option>
                <option value="vendor">Verkäufer</option>
                <option value="amount">Betrag</option>
                <option value="confidence">OCR Vertrauen</option>
              </select>
              <button onClick={handleSortDirectionToggle} className="rounded-lg p-2 hover:bg-slate-100" title={`Sortierung: ${sortConfig.direction}`}>
                {sortConfig.direction === 'ascending' ? <SortAscIcon className="w-5 h-5 text-slate-600" /> : <SortDescIcon className="w-5 h-5 text-slate-600" />}
              </button>
            </div>
          </div>
        </div>

        <div className="mt-6">
          {processedDocuments.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-lg">
              <p className="text-slate-500">Keine Belege für Ihre Auswahl gefunden.</p>
            </div>
          ) : (
            <div className="space-y-1">
               <div className="flex items-center px-4 py-2 border-b border-slate-200">
                  <input type="checkbox" className="h-4 w-4 text-blue-600 rounded border-slate-300" checked={selectedDocumentIds.size > 0 && selectedDocumentIds.size === processedDocuments.length} onChange={handleToggleSelectAll} aria-label="Alle auswählen" />
                  <span className="ml-4 text-xs font-semibold text-slate-500 uppercase tracking-wider">Belegdetails</span>
               </div>
              {sortedYears.map(year => (
                <div key={year}>
                  <button onClick={() => toggleFolder(`${year}`)} className="w-full flex items-center p-3 text-left text-base font-semibold text-slate-700 rounded-md hover:bg-slate-50"><ChevronDownIcon className={`w-4 h-4 mr-3 text-slate-400 transition-transform ${expandedFolders[`${year}`] ? '' : '-rotate-90'}`} />{year}</button>
                  {expandedFolders[`${year}`] && (
                    <div className="pl-4 space-y-2">
                      {([4, 3, 2, 1]).map(quarter => {
                        const quarterDocs = groupedDocuments[year]?.[quarter] || [];
                        if (quarterDocs.length > 0) {
                          const quarterKey = `${year}-Q${quarter}`;
                          return (
                            <div key={quarterKey}>
                              <button onClick={() => toggleFolder(quarterKey)} className="w-full flex items-center p-2 pl-6 text-left text-sm font-medium text-slate-600 rounded-md hover:bg-slate-50"><ChevronDownIcon className={`w-4 h-4 mr-2 text-slate-400 transition-transform ${expandedFolders[quarterKey] ? '' : '-rotate-90'}`} />Quartal {quarter}</button>
                              {expandedFolders[quarterKey] && (
                                <div className="pl-8 mt-1 space-y-px">
                                    {quarterDocs.map(doc => (
                                      <DocumentItem
                                        key={doc.id}
                                        document={doc}
                                        onSelect={onSelectDocument}
                                        isSelected={selectedDocumentIds.has(doc.id)}
                                        onToggleSelection={handleToggleSelection}
                                        onSendToLexoffice={handleSendSingleToLexoffice}
                                        isSendingToLexoffice={sendingDocId === doc.id}
                                        storageLocations={storageLocations}
                                        onUpdateStorage={handleUpdateStorage}
                                        onReanalyze={handleReanalyze}
                                        isReanalyzing={reanalyzingDocumentIds.includes(doc.id)}
                                        onCompareDuplicate={onCompareDuplicate}
                                        onDelete={handleDeleteSingle}
                                      />
                                    ))}
                                </div>
                              )}
                            </div>
                          )
                        }
                        return null;
                      })}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {isUploadModalOpen && (
        <UploadModal
          onClose={() => setIsUploadModalOpen(false)}
          setDocuments={setDocuments}
          rules={rules}
          onRuleSuggestion={onRuleSuggestion}
          apiKey={apiKey}
          onUploadSuccess={onUploadSuccess}
          onUploadError={onUploadError}
          onDuplicateDetected={onDuplicateDetected}
        />
      )}
    </>
  );
};

export default DocumentsView;
