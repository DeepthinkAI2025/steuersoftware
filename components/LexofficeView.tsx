import React, { useState, useMemo, useEffect } from 'react';
import { Document, LexofficeStatus, AccountingTransaction, StorageLocation, StorageLocationType, LexofficeImportResult } from '../types';
import { LexofficeVoucher, LexofficeContact } from '../services/lexofficeService';
import LexofficeIcon from './icons/LexofficeIcon';
import UserIcon from './icons/UserIcon';
import { PlusIcon } from './icons/PlusIcon';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
import SparklesIcon from './icons/SparklesIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import { buildDocumentFromLexoffice, importFromLexoffice, sendDocumentsToLexoffice, upsertTransactionsFromLexoffice, createVoucherInLexoffice, updateVoucherInLexoffice, deleteVoucherInLexoffice, createContactInLexoffice, updateContactInLexoffice, deleteContactInLexoffice, fetchVouchersFromLexoffice, fetchContactsFromLexoffice } from '../services/lexofficeService';

const META_ENV = (import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env ?? {};

interface LexofficeViewProps {
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  lexofficeApiKey: string;
  transactions: AccountingTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<AccountingTransaction[]>>;
  storageLocations: StorageLocation[];
  defaultStorageId: string;
}

type RangePreset =
  | 'current-month'
  | 'current-year'
  | 'last-year'
  | 'year-2025'
  | 'year-2024'
  | 'year-2023'
  | 'custom';

const PRESET_OPTIONS: Array<{ value: RangePreset; label: string }> = [
  { value: 'current-month', label: 'Aktueller Monat' },
  { value: 'current-year', label: 'Aktuelles Jahr' },
  { value: 'last-year', label: 'Letztes Jahr' },
  { value: 'year-2025', label: 'Jahr 2025' },
  { value: 'year-2024', label: 'Jahr 2024' },
  { value: 'year-2023', label: 'Jahr 2023' },
  { value: 'custom', label: 'Benutzerdefiniert' },
];

const formatInputDate = (date: Date) => date.toISOString().split('T')[0];

const computeRange = (preset: RangePreset): { start: Date; end: Date } => {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth();

  switch (preset) {
    case 'current-month':
      return {
        start: new Date(currentYear, currentMonth, 1, 0, 0, 0, 0),
        end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999),
      };
    case 'current-year':
      return {
        start: new Date(currentYear, 0, 1, 0, 0, 0, 0),
        end: new Date(currentYear, 11, 31, 23, 59, 59, 999),
      };
    case 'last-year': {
      const previousYear = currentYear - 1;
      return {
        start: new Date(previousYear, 0, 1, 0, 0, 0, 0),
        end: new Date(previousYear, 11, 31, 23, 59, 59, 999),
      };
    }
    default: {
      if (preset.startsWith('year-')) {
        const targetYear = Number(preset.split('-')[1]);
        return {
          start: new Date(targetYear, 0, 1, 0, 0, 0, 0),
          end: new Date(targetYear, 11, 31, 23, 59, 59, 999),
        };
      }

      return {
        start: new Date(currentYear, currentMonth, 1, 0, 0, 0, 0),
        end: new Date(currentYear, currentMonth + 1, 0, 23, 59, 59, 999),
      };
    }
  }
};

const StatusBadge: React.FC<{ status: LexofficeStatus }> = ({ status }) => {
    const statusStyles = {
        [LexofficeStatus.SUCCESS]: 'bg-green-100 text-green-800',
        [LexofficeStatus.FAILED]: 'bg-red-100 text-red-800',
        [LexofficeStatus.NOT_SENT]: 'bg-slate-100 text-slate-800',
    };
    return <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusStyles[status]}`}>{status}</span>;
}

const LexofficeView: React.FC<LexofficeViewProps> = ({ documents, setDocuments, lexofficeApiKey, transactions, setTransactions, storageLocations, defaultStorageId }) => {
  const initialRange = computeRange('current-month');

  const envLexofficeApiKey = (META_ENV.VITE_LEXOFFICE_API_KEY ?? '').trim();
  const isLiveModeEnabled = (META_ENV.VITE_LEXOFFICE_ENABLE_REAL_API ?? 'false') === 'true';

  const [startDate, setStartDate] = useState(() => formatInputDate(initialRange.start));
  const [endDate, setEndDate] = useState(() => formatInputDate(initialRange.end));
  const [rangePreset, setRangePreset] = useState<RangePreset>('current-month');
  const [includeDocuments, setIncludeDocuments] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [progress, setProgress] = useState({ current: 0, total: 0 });
  const [isImporting, setIsImporting] = useState(false);
  const [importFeedback, setImportFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [importSummary, setImportSummary] = useState<LexofficeImportResult['summary'] | null>(null);
  const [importNotifications, setImportNotifications] = useState<string[]>([]);
  const [fetchedDocumentsCount, setFetchedDocumentsCount] = useState<number | null>(null);
  const [addedDocumentsCount, setAddedDocumentsCount] = useState<number | null>(null);
  const [vouchers, setVouchers] = useState<LexofficeVoucher[]>([]);
  const [contacts, setContacts] = useState<LexofficeContact[]>([]);
  const [isLoadingVouchers, setIsLoadingVouchers] = useState(false);
  const [isLoadingContacts, setIsLoadingContacts] = useState(false);
  const [crudFeedback, setCrudFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);
  const [editingVoucher, setEditingVoucher] = useState<LexofficeVoucher | null>(null);
  const [editingContact, setEditingContact] = useState<LexofficeContact | null>(null);
  const [isCreatingVoucher, setIsCreatingVoucher] = useState(false);
  const [isCreatingContact, setIsCreatingContact] = useState(false);

  useEffect(() => {
    if (rangePreset === 'custom') return;
    const { start, end } = computeRange(rangePreset);
    setStartDate(formatInputDate(start));
    setEndDate(formatInputDate(end));
  }, [rangePreset]);

  const selectedRange = useMemo(() => {
    const start = new Date(startDate);
    const end = new Date(endDate);
    if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime())) {
      return null;
    }
    start.setHours(0, 0, 0, 0);
    end.setHours(23, 59, 59, 999);
    return { start, end };
  }, [startDate, endDate]);

  const lexofficeStorageId = useMemo(() => {
    const storage = storageLocations.find(location => location.type === StorageLocationType.LEXOFFICE);
    return storage?.id || defaultStorageId;
  }, [storageLocations, defaultStorageId]);

  const documentsToSend = useMemo(() => {
    if (!selectedRange) return [];
    const { start, end } = selectedRange;

    return documents
      .filter(doc => {
        const docDate = new Date(doc.date);
        const isDateInRange = docDate >= start && docDate <= end;
        const isNotSent = doc.lexoffice?.status !== LexofficeStatus.SUCCESS;
        return isDateInRange && isNotSent;
      })
      .sort((a, b) => b.date.getTime() - a.date.getTime());
  }, [documents, selectedRange]);

  const sentDocuments = useMemo(() => {
    return documents
        .filter(doc => doc.lexoffice)
        .sort((a, b) => (b.lexoffice?.sentAt.getTime() || 0) - (a.lexoffice?.sentAt.getTime() || 0));
  }, [documents]);

  const handleSendToLexoffice = async () => {
    setFeedback(null);
    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    if (!effectiveApiKey && isLiveModeEnabled) {
      setFeedback({ type: 'error', message: 'Bitte hinterlegen Sie zuerst Ihren Lexoffice API-Schlüssel in den Einstellungen.' });
      return;
    }
    if (!selectedRange) {
      setFeedback({ type: 'error', message: 'Bitte wählen Sie einen gültigen Zeitraum aus.' });
      return;
    }
    if (documentsToSend.length === 0) {
      setFeedback({ type: 'error', message: 'Im ausgewählten Zeitraum gibt es keine Belege zum Senden.' });
      return;
    }

    setIsSending(true);
    setProgress({ current: 0, total: documentsToSend.length });

    const targetIds = new Set(documentsToSend.map(doc => doc.id));

    try {
      const result = await sendDocumentsToLexoffice({
        documents: documentsToSend,
        apiKey: effectiveApiKey || undefined,
        onProgress: (current, total) => {
          setProgress({ current: Math.min(current, total), total });
        },
      });

      const successSet = new Set(result.successIds);
      const failureMap = new Map(result.failed.map(entry => [entry.documentId, entry.reason]));

      setDocuments(prevDocs =>
        prevDocs.map(doc => {
          if (!targetIds.has(doc.id)) return doc;

          if (successSet.has(doc.id)) {
            return {
              ...doc,
              lexoffice: {
                status: LexofficeStatus.SUCCESS,
                sentAt: new Date(),
              },
              errorMessage: undefined,
            };
          }

          const failureReason = failureMap.get(doc.id);
          if (failureReason) {
            return {
              ...doc,
              lexoffice: {
                status: LexofficeStatus.FAILED,
                sentAt: new Date(),
              },
              errorMessage: failureReason,
            };
          }

          return doc;
        }),
      );

      const successCount = result.successIds.length;
      const failureCount = result.failed.length;
      const modeLabel = result.mode === 'live' ? 'Live-Upload' : 'Simulation';

      if (failureCount === 0) {
        setFeedback({ type: 'success', message: `${modeLabel}: ${successCount} von ${documentsToSend.length} Beleg(en) erfolgreich an Lexoffice übertragen.` });
      } else if (successCount === 0) {
        const sampleReason = result.failed[0]?.reason ?? 'Unbekannter Fehler.';
        setFeedback({ type: 'error', message: `${modeLabel}: Übertragung fehlgeschlagen. ${sampleReason}` });
      } else {
        setFeedback({ type: 'error', message: `${modeLabel}: ${successCount} Beleg(e) übertragen, ${failureCount} fehlgeschlagen.` });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Übertragung fehlgeschlagen.';
      setFeedback({ type: 'error', message });
    } finally {
      setIsSending(false);
      setProgress({ current: 0, total: 0 });
    }
  };

  const runLexofficeImport = async (range: { start: Date; end: Date }, includeDocs: boolean) => {
    setImportFeedback(null);
    setImportSummary(null);
    setImportNotifications([]);
    setFetchedDocumentsCount(null);
    setAddedDocumentsCount(null);

    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    if (!effectiveApiKey && isLiveModeEnabled) {
      setImportFeedback({ type: 'error', message: 'Bitte hinterlegen Sie Ihren Lexoffice API-Schlüssel, um den Import zu starten.' });
      return;
    }

    setIsImporting(true);

    try {
      const importResult = await importFromLexoffice({
        apiKey: effectiveApiKey || undefined,
        dateRange: range,
        includeDocuments: includeDocs,
      });

      const candidateDocuments = (importResult.documents || []).map(payload => buildDocumentFromLexoffice(payload, lexofficeStorageId));
      setFetchedDocumentsCount(importResult.documents ? importResult.documents.length : 0);

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

      const { updatedTransactions, notifications } = upsertTransactionsFromLexoffice({
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

      const addedCount = additions.length;
      setAddedDocumentsCount(addedCount);

      const notificationList = [...notifications];
      if (addedCount > 0) {
        notificationList.push(`${addedCount} Beleg${addedCount > 1 ? 'e' : ''} aus Lexoffice übernommen.`);
      }
      if (importResult.summary.missingReceipts > 0) {
        notificationList.push(`${importResult.summary.missingReceipts} Transaktion${importResult.summary.missingReceipts > 1 ? 'en' : ''} ohne Beleg erkannt – Aufgaben wurden angelegt.`);
      }

      setImportNotifications(notificationList);
      setImportSummary(importResult.summary);

      const formatter = new Intl.DateTimeFormat('de-DE');
      const modeLabel = importResult.mode === 'live' ? 'Live-Import' : 'Simulation';
      setImportFeedback({
        type: 'success',
        message: `${modeLabel} abgeschlossen für ${formatter.format(range.start)} – ${formatter.format(range.end)}.`,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Import fehlgeschlagen.';
      setImportFeedback({ type: 'error', message });
    } finally {
      setIsImporting(false);
    }
  };

  const handleImportFromLexoffice = async () => {
    if (!selectedRange) {
      setImportFeedback({ type: 'error', message: 'Bitte wählen Sie einen gültigen Zeitraum aus.' });
      return;
    }

    await runLexofficeImport(selectedRange, includeDocuments);
  };

  const handleQuickImportYear = async (year: number) => {
    const preset = `year-${year}` as RangePreset;
    const range = computeRange(preset);
    setRangePreset(preset);
    setStartDate(formatInputDate(range.start));
    setEndDate(formatInputDate(range.end));
    setIncludeDocuments(true);

    await runLexofficeImport(range, true);
  };

  const loadVouchers = async () => {
    setIsLoadingVouchers(true);
    setCrudFeedback(null);

    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    if (!effectiveApiKey && isLiveModeEnabled) {
      setCrudFeedback({ type: 'error', message: 'Bitte hinterlegen Sie Ihren Lexoffice API-Schlüssel.' });
      setIsLoadingVouchers(false);
      return;
    }

    try {
      const voucherList = await fetchVouchersFromLexoffice(effectiveApiKey || undefined);
      setVouchers(voucherList);
      setCrudFeedback({ type: 'success', message: `${voucherList.length} Voucher(s) geladen.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden der Vouchers.';
      setCrudFeedback({ type: 'error', message });
    } finally {
      setIsLoadingVouchers(false);
    }
  };

  const loadContacts = async () => {
    setIsLoadingContacts(true);
    setCrudFeedback(null);

    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    if (!effectiveApiKey && isLiveModeEnabled) {
      setCrudFeedback({ type: 'error', message: 'Bitte hinterlegen Sie Ihren Lexoffice API-Schlüssel.' });
      setIsLoadingContacts(false);
      return;
    }

    try {
      const contactList = await fetchContactsFromLexoffice(effectiveApiKey || undefined);
      setContacts(contactList);
      setCrudFeedback({ type: 'success', message: `${contactList.length} Kontakt(e) geladen.` });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Laden der Kontakte.';
      setCrudFeedback({ type: 'error', message });
    } finally {
      setIsLoadingContacts(false);
    }
  };

  const handleCreateVoucher = async (voucher: LexofficeVoucher) => {
    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await createVoucherInLexoffice(voucher, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Voucher erfolgreich erstellt.' });
        setIsCreatingVoucher(false);
        // Reload vouchers to show the new one
        await loadVouchers();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Erstellen des Vouchers.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Erstellen des Vouchers.';
      setCrudFeedback({ type: 'error', message });
    }
  };

  const handleUpdateVoucher = async (voucherId: string, voucher: Partial<LexofficeVoucher>) => {
    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await updateVoucherInLexoffice(voucherId, voucher, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Voucher erfolgreich aktualisiert.' });
        setEditingVoucher(null);
        // Reload vouchers to show the updated one
        await loadVouchers();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Aktualisieren des Vouchers.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Vouchers.';
      setCrudFeedback({ type: 'error', message });
    }
  };

  const handleDeleteVoucher = async (voucherId: string) => {
    if (!confirm('Sind Sie sicher, dass Sie diesen Voucher löschen möchten?')) return;

    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await deleteVoucherInLexoffice(voucherId, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Voucher erfolgreich gelöscht.' });
        // Reload vouchers to remove the deleted one
        await loadVouchers();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Löschen des Vouchers.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Löschen des Vouchers.';
      setCrudFeedback({ type: 'error', message });
    }
  };

  const handleCreateContact = async (contact: LexofficeContact) => {
    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await createContactInLexoffice(contact, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Kontakt erfolgreich erstellt.' });
        setIsCreatingContact(false);
        // Reload contacts to show the new one
        await loadContacts();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Erstellen des Kontakts.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Erstellen des Kontakts.';
      setCrudFeedback({ type: 'error', message });
    }
  };

  const handleUpdateContact = async (contactId: string, contact: Partial<LexofficeContact>) => {
    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await updateContactInLexoffice(contactId, contact, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Kontakt erfolgreich aktualisiert.' });
        setEditingContact(null);
        // Reload contacts to show the updated one
        await loadContacts();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Aktualisieren des Kontakts.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Aktualisieren des Kontakts.';
      setCrudFeedback({ type: 'error', message });
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Sind Sie sicher, dass Sie diesen Kontakt löschen möchten?')) return;

    const effectiveApiKey = (lexofficeApiKey || envLexofficeApiKey).trim();
    try {
      const result = await deleteContactInLexoffice(contactId, effectiveApiKey || undefined);
      if (result.success) {
        setCrudFeedback({ type: 'success', message: 'Kontakt erfolgreich gelöscht.' });
        // Reload contacts to remove the deleted one
        await loadContacts();
      } else {
        setCrudFeedback({ type: 'error', message: result.error || 'Fehler beim Löschen des Kontakts.' });
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Fehler beim Löschen des Kontakts.';
      setCrudFeedback({ type: 'error', message });
    }
  };
  
  const formatDate = (date: Date) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(date);

  return (
    <div className="space-y-8">
      <div>
        <h2 className="text-3xl font-bold text-slate-800">An LexOffice senden</h2>
        <p className="text-slate-500 mt-1">Übertragen Sie Belege aus einem ausgewählten Zeitraum gesammelt an Ihr LexOffice-Konto.</p>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">1. Zeitraum auswählen</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="md:col-span-3">
            <label htmlFor="range-preset" className="block text-sm font-medium text-slate-700">Voreinstellung</label>
            <select
              id="range-preset"
              value={rangePreset}
              onChange={event => setRangePreset(event.target.value as RangePreset)}
              className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            >
              {PRESET_OPTIONS.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="start-date" className="block text-sm font-medium text-slate-700">Startdatum</label>
            <input
              type="date"
              id="start-date"
              value={startDate}
              onChange={event => {
                setStartDate(event.target.value);
                setRangePreset('custom');
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
          <div>
            <label htmlFor="end-date" className="block text-sm font-medium text-slate-700">Enddatum</label>
            <input
              type="date"
              id="end-date"
              value={endDate}
              onChange={event => {
                setEndDate(event.target.value);
                setRangePreset('custom');
              }}
              className="mt-1 block w-full rounded-lg border border-slate-300 p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
            />
          </div>
        </div>
      </div>
      
      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">2. Übertragung starten</h3>
        <div className="p-4 bg-slate-50 rounded-lg text-center">
            <p className="text-slate-600">
                <span className="font-bold text-2xl text-blue-600">{documentsToSend.length}</span> Beleg(e) im ausgewählten Zeitraum zum Senden bereit.
            </p>
        </div>
        {isSending && (
            <div className="mt-4">
                <p className="text-sm text-slate-600 text-center mb-2">
          Übertrage Beleg {progress.total > 0 ? Math.min(progress.current + 1, progress.total) : 0} von {progress.total}...
                </p>
                <div className="w-full bg-slate-200 rounded-full h-2.5">
          <div
            className="bg-blue-600 h-2.5 rounded-full"
            style={{ width: `${progress.total > 0 ? (progress.current / progress.total) * 100 : 0}%` }}
          ></div>
                </div>
            </div>
        )}
        {feedback && (
          <div className={`p-3 mt-4 rounded-md text-sm ${feedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {feedback.message}
          </div>
        )}
        <button
          onClick={handleSendToLexoffice}
          disabled={isSending || documentsToSend.length === 0}
          className="w-full mt-4 flex items-center justify-center bg-blue-600 text-white font-bold py-3 px-4 rounded-lg hover:bg-blue-700 transition duration-300 shadow-sm disabled:bg-blue-300"
        >
          {isSending ? (
            'Übertragung läuft...'
          ) : (
            `Sende ${documentsToSend.length} Beleg(e) an LexOffice`
          )}
        </button>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-1">3. Belege &amp; Zahlungen aus Lexoffice importieren (Beta)</h3>
        <p className="text-sm text-slate-500 mb-4">
          Wir spielen einen Import aus Lexoffice durch, um Transaktionen und – falls gewünscht – zugehörige Belege aus dem ausgewählten Zeitraum zu synchronisieren.
        </p>
        {importFeedback && (
          <div className={`mb-4 rounded-md p-3 text-sm ${importFeedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {importFeedback.message}
          </div>
        )}
        <div className="mb-4 rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
          Zeitraum: {selectedRange ? `${new Intl.DateTimeFormat('de-DE').format(selectedRange.start)} – ${new Intl.DateTimeFormat('de-DE').format(selectedRange.end)}` : 'Bitte gültige Daten wählen'}
        </div>
        <label className="mb-4 flex items-center gap-2 text-sm text-slate-600">
          <input
            type="checkbox"
            checked={includeDocuments}
            onChange={event => setIncludeDocuments(event.target.checked)}
            className="h-4 w-4 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
          />
          Belege gemeinsam mit den Transaktionen übernehmen
        </label>
        <div className="mb-4 rounded-lg border border-dashed border-emerald-300 bg-emerald-50 p-4">
          <p className="text-sm font-semibold text-emerald-800">Schnellstart: Komplettimport Jahr 2023</p>
          <p className="mt-1 text-xs text-emerald-700">
            Für die Demodaten stehen vollständige Transaktionen inklusive Belegen aus 2023 bereit. Ein Klick setzt Zeitraum und Optionen.
          </p>
          <button
            onClick={() => handleQuickImportYear(2023)}
            disabled={isImporting}
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            <SparklesIcon className="h-4 w-4" />
            Import für 2023 starten
          </button>
        </div>
        <button
          onClick={handleImportFromLexoffice}
          disabled={isImporting}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 px-4 font-semibold text-white shadow-sm transition hover:bg-emerald-700 disabled:bg-emerald-300"
        >
          {isImporting ? (
            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-b-transparent"></div>
          ) : (
            <SparklesIcon className="h-5 w-5" />
          )}
          {isImporting ? 'Import läuft…' : 'Import jetzt simulieren'}
        </button>

        {importSummary && (
          <div className="mt-6 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Neue Transaktionen</p>
              <p className="text-2xl font-bold text-slate-900">{importSummary.imported}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Aktualisiert</p>
              <p className="text-2xl font-bold text-slate-900">{importSummary.updated}</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Übersprungen</p>
              <p className="text-2xl font-bold text-slate-900">{importSummary.skipped}</p>
            </div>
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-amber-600">Fehlende Belege</p>
              <p className="text-2xl font-bold text-amber-700">{importSummary.missingReceipts}</p>
              <p className="text-[11px] text-amber-700">Aufgaben wurden automatisch erzeugt.</p>
            </div>
          </div>
        )}

        {(fetchedDocumentsCount !== null || addedDocumentsCount !== null) && (
          <div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
            {fetchedDocumentsCount !== null && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Belege aus Lexoffice</p>
                <p className="text-2xl font-bold text-slate-900">{fetchedDocumentsCount}</p>
                <p className="text-[11px] text-slate-500">Vom Import bereitgestellt</p>
              </div>
            )}
            {addedDocumentsCount !== null && (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Neue Dokumente</p>
                <p className="text-2xl font-bold text-slate-900">{addedDocumentsCount}</p>
                <p className="text-[11px] text-slate-500">Im System abgelegt</p>
              </div>
            )}
          </div>
        )}

        {importNotifications.length > 0 && (
          <div className="mt-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
            <p className="mb-3 flex items-center gap-2 text-sm font-semibold text-slate-700">
              <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
              Import-Notizen
            </p>
            <ul className="space-y-2 text-sm text-slate-600">
              {importNotifications.map((note, index) => (
                <li key={index} className="flex items-start gap-2">
                  <AlertTriangleIcon className="mt-0.5 h-4 w-4 text-slate-400" />
                  <span>{note}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Übertragungsverlauf</h3>
         <div className="overflow-x-auto">
          <table className="w-full text-sm text-left text-slate-500">
            <thead className="text-xs text-slate-700 uppercase bg-slate-50">
              <tr>
                <th scope="col" className="px-4 py-3">Beleg</th>
                <th scope="col" className="px-4 py-3">Gesendet am</th>
                <th scope="col" className="px-4 py-3 text-right">Status</th>
              </tr>
            </thead>
            <tbody>
              {sentDocuments.map(doc => (
                <tr key={doc.id} className="bg-white border-b border-slate-200 hover:bg-slate-50">
                  <td className="px-4 py-3 font-medium text-slate-900 whitespace-nowrap">{doc.name}</td>
                  <td className="px-4 py-3">{doc.lexoffice ? formatDate(doc.lexoffice.sentAt) : '-'}</td>
                  <td className="px-4 py-3 text-right">
                    {doc.lexoffice && <StatusBadge status={doc.lexoffice.status} />}
                  </td>
                </tr>
              ))}
              {sentDocuments.length === 0 && (
                <tr>
                    <td colSpan={3} className="text-center py-6 text-slate-500">
                        Bisher wurden keine Belege an Lexoffice gesendet.
                    </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="bg-white p-4 sm:p-6 rounded-xl shadow-sm border border-slate-200">
        <h3 className="text-lg font-semibold text-slate-800 mb-4">Datenverwaltung in Lexoffice</h3>
        <p className="text-sm text-slate-500 mb-4">
          Verwalten Sie Vouchers (Belege) und Kontakte direkt in Ihrem Lexoffice-Konto.
        </p>

        {crudFeedback && (
          <div className={`mb-4 rounded-md p-3 text-sm ${crudFeedback.type === 'success' ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
            {crudFeedback.message}
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Vouchers (Belege)</h4>
              <button
                onClick={() => setIsCreatingVoucher(true)}
                className="inline-flex items-center gap-1 rounded bg-purple-600 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-purple-700"
              >
                <PlusIcon className="h-4 w-4" />
                Neu
              </button>
            </div>
            <button
              onClick={loadVouchers}
              disabled={isLoadingVouchers}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-purple-600 py-2 px-4 font-semibold text-white shadow-sm transition hover:bg-purple-700 disabled:bg-purple-300"
            >
              {isLoadingVouchers ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-b-transparent"></div>
              ) : (
                <LexofficeIcon className="h-4 w-4" />
              )}
              {isLoadingVouchers ? 'Lade Vouchers...' : 'Vouchers laden'}
            </button>

            {isCreatingVoucher && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <h5 className="font-semibold text-purple-800 mb-3">Neuen Voucher erstellen</h5>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  const voucher: LexofficeVoucher = {
                    voucherType: formData.get('voucherType') as 'sales' | 'purchase',
                    voucherDate: formData.get('voucherDate') as string,
                    reference: formData.get('reference') as string,
                    totalAmount: {
                      totalGrossAmount: parseFloat(formData.get('amount') as string),
                      currency: 'EUR'
                    },
                    lineItems: [{
                      amount: {
                        netAmount: parseFloat(formData.get('amount') as string) / 1.19,
                        taxRatePercent: 19
                      },
                      description: formData.get('description') as string
                    }]
                  };
                  handleCreateVoucher(voucher);
                }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Typ</label>
                      <select name="voucherType" required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm">
                        <option value="purchase">Einkauf</option>
                        <option value="sales">Verkauf</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Datum</label>
                      <input type="date" name="voucherDate" required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-purple-700">Referenz</label>
                    <input type="text" name="reference" required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Betrag (€)</label>
                      <input type="number" step="0.01" name="amount" required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Beschreibung</label>
                      <input type="text" name="description" required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
                      Erstellen
                    </button>
                    <button type="button" onClick={() => setIsCreatingVoucher(false)} className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                      Abbrechen
                    </button>
                  </div>
                </form>
              </div>
            )}

            {editingVoucher && (
              <div className="rounded-lg border border-purple-200 bg-purple-50 p-4">
                <h5 className="font-semibold text-purple-800 mb-3">Voucher bearbeiten</h5>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  const updates: Partial<LexofficeVoucher> = {
                    reference: formData.get('reference') as string,
                    voucherDate: formData.get('voucherDate') as string,
                  };
                  handleUpdateVoucher(editingVoucher.id!, updates);
                }} className="space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Referenz</label>
                      <input type="text" name="reference" defaultValue={editingVoucher.reference} required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-purple-700">Datum</label>
                      <input type="date" name="voucherDate" defaultValue={editingVoucher.voucherDate} required className="mt-1 block w-full rounded border border-purple-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-purple-600 px-4 py-2 text-sm font-semibold text-white hover:bg-purple-700">
                      Aktualisieren
                    </button>
                    <button type="button" onClick={() => setEditingVoucher(null)} className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                      Abbrechen
                    </button>
                  </div>
                </form>
              </div>
            )}

            {vouchers.length > 0 && (
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Referenz</th>
                      <th className="px-3 py-2 text-left">Datum</th>
                      <th className="px-3 py-2 text-right">Betrag</th>
                      <th className="px-3 py-2 text-center">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {vouchers.map(voucher => (
                      <tr key={voucher.id} className="border-t border-slate-200">
                        <td className="px-3 py-2">{voucher.reference || '-'}</td>
                        <td className="px-3 py-2">{voucher.voucherDate}</td>
                        <td className="px-3 py-2 text-right">
                          {voucher.totalAmount?.totalGrossAmount?.toFixed(2)} {voucher.totalAmount?.currency}
                        </td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setEditingVoucher(voucher)}
                            className="mr-2 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <PencilIcon className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteVoucher(voucher.id!)}
                            className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-semibold text-slate-700">Kontakte</h4>
              <button
                onClick={() => setIsCreatingContact(true)}
                className="inline-flex items-center gap-1 rounded bg-indigo-600 px-3 py-1 text-sm font-semibold text-white shadow-sm transition hover:bg-indigo-700"
              >
                <PlusIcon className="h-4 w-4" />
                Neu
              </button>
            </div>
            <button
              onClick={loadContacts}
              disabled={isLoadingContacts}
              className="w-full flex items-center justify-center gap-2 rounded-lg bg-indigo-600 py-2 px-4 font-semibold text-white shadow-sm transition hover:bg-indigo-700 disabled:bg-indigo-300"
            >
              {isLoadingContacts ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white/70 border-b-transparent"></div>
              ) : (
                <UserIcon className="h-4 w-4" />
              )}
              {isLoadingContacts ? 'Lade Kontakte...' : 'Kontakte laden'}
            </button>

            {isCreatingContact && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <h5 className="font-semibold text-indigo-800 mb-3">Neuen Kontakt erstellen</h5>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  const contact: LexofficeContact = {
                    name: formData.get('name') as string,
                    email: formData.get('email') as string,
                    phone: formData.get('phone') as string,
                    role: formData.get('role') as 'customer' | 'supplier' | 'both',
                    number: formData.get('number') as string,
                  };
                  handleCreateContact(contact);
                }} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-indigo-700">Name</label>
                    <input type="text" name="name" required className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">E-Mail</label>
                      <input type="email" name="email" className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Telefon</label>
                      <input type="tel" name="phone" className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Rolle</label>
                      <select name="role" required className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm">
                        <option value="both">Beide</option>
                        <option value="customer">Kunde</option>
                        <option value="supplier">Lieferant</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Nummer</label>
                      <input type="text" name="number" className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                      Erstellen
                    </button>
                    <button type="button" onClick={() => setIsCreatingContact(false)} className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                      Abbrechen
                    </button>
                  </div>
                </form>
              </div>
            )}

            {editingContact && (
              <div className="rounded-lg border border-indigo-200 bg-indigo-50 p-4">
                <h5 className="font-semibold text-indigo-800 mb-3">Kontakt bearbeiten</h5>
                <form onSubmit={(e) => {
                  e.preventDefault();
                  const formData = new FormData(e.target as HTMLFormElement);
                  const updates: Partial<LexofficeContact> = {
                    name: formData.get('name') as string,
                    email: formData.get('email') as string,
                    phone: formData.get('phone') as string,
                    role: formData.get('role') as 'customer' | 'supplier' | 'both',
                    number: formData.get('number') as string,
                  };
                  handleUpdateContact(editingContact.id!, updates);
                }} className="space-y-3">
                  <div>
                    <label className="block text-sm font-medium text-indigo-700">Name</label>
                    <input type="text" name="name" defaultValue={editingContact.name} required className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">E-Mail</label>
                      <input type="email" name="email" defaultValue={editingContact.email} className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Telefon</label>
                      <input type="tel" name="phone" defaultValue={editingContact.phone} className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Rolle</label>
                      <select name="role" defaultValue={editingContact.role} required className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm">
                        <option value="both">Beide</option>
                        <option value="customer">Kunde</option>
                        <option value="supplier">Lieferant</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-indigo-700">Nummer</label>
                      <input type="text" name="number" defaultValue={editingContact.number} className="mt-1 block w-full rounded border border-indigo-300 p-2 text-sm" />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button type="submit" className="rounded bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700">
                      Aktualisieren
                    </button>
                    <button type="button" onClick={() => setEditingContact(null)} className="rounded bg-slate-600 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700">
                      Abbrechen
                    </button>
                  </div>
                </form>
              </div>
            )}

            {contacts.length > 0 && (
              <div className="max-h-64 overflow-y-auto border border-slate-200 rounded-lg">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-3 py-2 text-left">Name</th>
                      <th className="px-3 py-2 text-left">E-Mail</th>
                      <th className="px-3 py-2 text-left">Rolle</th>
                      <th className="px-3 py-2 text-center">Aktionen</th>
                    </tr>
                  </thead>
                  <tbody>
                    {contacts.map(contact => (
                      <tr key={contact.id} className="border-t border-slate-200">
                        <td className="px-3 py-2">{contact.name}</td>
                        <td className="px-3 py-2">{contact.email || '-'}</td>
                        <td className="px-3 py-2">{contact.role || 'both'}</td>
                        <td className="px-3 py-2 text-center">
                          <button
                            onClick={() => setEditingContact(contact)}
                            className="mr-2 rounded bg-blue-600 px-2 py-1 text-xs font-semibold text-white hover:bg-blue-700"
                          >
                            <PencilIcon className="h-3 w-3" />
                          </button>
                          <button
                            onClick={() => handleDeleteContact(contact.id!)}
                            className="rounded bg-red-600 px-2 py-1 text-xs font-semibold text-white hover:bg-red-700"
                          >
                            <TrashIcon className="h-3 w-3" />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default LexofficeView;