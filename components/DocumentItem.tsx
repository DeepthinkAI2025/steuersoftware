import React from 'react';
import { Document, DocumentStatus, LexofficeStatus, StorageLocation } from '../types';
import FileIcon from './icons/FileIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CameraIcon from './icons/CameraIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import CopyIcon from './icons/CopyIcon';
import SparklesIcon from './icons/SparklesIcon';
import FolderIcon from './icons/FolderIcon';
import LexofficeIcon from './icons/LexofficeIcon';

interface DocumentItemProps {
  document: Document;
  onSelect: (document: Document) => void;
  isSelected: boolean;
  onToggleSelection: (id: string) => void;
  onSendToLexoffice: (id: string) => void;
  isSendingToLexoffice: boolean;
  storageLocations: StorageLocation[];
  onUpdateStorage: (id: string, storageId?: string) => void;
  onReanalyze: (document: Document) => void;
  isReanalyzing: boolean;
}

const DocumentItem: React.FC<DocumentItemProps> = ({ document, onSelect, isSelected, onToggleSelection, onSendToLexoffice, isSendingToLexoffice, storageLocations, onUpdateStorage, onReanalyze, isReanalyzing }) => {
  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('de-DE', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(date);
  };
  
  const getStatusInfo = () => {
    switch(document.status) {
      case DocumentStatus.OK:
        return { icon: <CheckCircleIcon className="w-4 h-4 text-green-500" />, text: 'OK', color: 'text-green-700', tooltip: '' };
      case DocumentStatus.MISSING_INVOICE:
        return { icon: <AlertTriangleIcon className="w-4 h-4 text-yellow-500" />, text: 'Rechnung fehlt', color: 'text-yellow-700', tooltip: 'Dies ist nur eine Bestellbestätigung. Die Originalrechnung fehlt.' };
      case DocumentStatus.SCREENSHOT:
        return { icon: <CameraIcon className="w-4 h-4 text-blue-500" />, text: 'Screenshot', color: 'text-blue-700', tooltip: 'Dieser Beleg ist ein Screenshot und keine PDF-Rechnung.' };
      case DocumentStatus.ANALYZING:
        return { icon: <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-slate-500"></div>, text: 'Analysiere...', color: 'text-slate-500', tooltip: '' };
      case DocumentStatus.POTENTIAL_DUPLICATE:
        return { icon: <CopyIcon className="w-4 h-4 text-orange-500" />, text: 'Mögliches Duplikat', color: 'text-orange-700', tooltip: 'Ein Beleg mit gleicher Rechnungsnummer oder gleichem Betrag und Datum existiert bereits.' };
      case DocumentStatus.ERROR:
        return { icon: <AlertTriangleIcon className="w-4 h-4 text-red-500" />, text: 'Fehler', color: 'text-red-700', tooltip: document.errorMessage || 'Bei der Analyse ist ein Fehler aufgetreten.' };
      case DocumentStatus.ARCHIVED:
        return { icon: null, text: 'Archiviert', color: 'text-slate-500', tooltip: 'Dieses Dokument ist archiviert.' };
      default:
        return { icon: null, text: '', color: '', tooltip: '' };
    }
  };
  
  const statusInfo = getStatusInfo();
  const lexofficeStatus = document.lexoffice?.status;

  const storageLabel = document.storageLocationId
    ? storageLocations.find(location => location.id === document.storageLocationId)?.label
    : undefined;

  const ocrMetadata = document.ocrMetadata;
  const averageConfidence = typeof ocrMetadata?.averageConfidence === 'number' ? ocrMetadata.averageConfidence : undefined;
  const warnings = ocrMetadata?.warnings ?? [];

  const hasStatusWarning = [DocumentStatus.MISSING_INVOICE, DocumentStatus.ERROR, DocumentStatus.POTENTIAL_DUPLICATE].includes(document.status);
  const hasWarnings = hasStatusWarning || warnings.length > 0;

  const confidenceLabel = averageConfidence !== undefined
    ? `${averageConfidence.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%`
    : null;

  const confidenceTone = (() => {
    if (averageConfidence === undefined) return 'bg-slate-100 text-slate-600';
    if (averageConfidence >= 90) return 'bg-emerald-100 text-emerald-700';
    if (averageConfidence >= 70) return 'bg-amber-100 text-amber-700';
    return 'bg-rose-100 text-rose-700';
  })();

  const storageTone = storageLabel
    ? 'bg-violet-100 text-violet-700'
    : 'bg-slate-100 text-slate-600 border border-dashed border-violet-200';

  const analysisTimestamp = ocrMetadata?.analysedAt
    ? new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium', timeStyle: 'short' }).format(ocrMetadata.analysedAt)
    : null;

  const isAnalysisActive = document.status === DocumentStatus.ANALYZING || isReanalyzing;

  const handleCheckboxClick = (e: React.MouseEvent<HTMLInputElement>) => {
    e.stopPropagation();
    onToggleSelection(document.id);
  };

  const handleItemClick = () => {
    if (!isAnalysisActive) {
      onSelect(document);
    }
  };

  const handleReanalyzeClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (!isAnalysisActive) {
      onReanalyze(document);
    }
  };

  const handleStorageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    e.stopPropagation();
    const value = e.target.value;
    onUpdateStorage(document.id, value === '' ? undefined : value);
  };

  return (
    <div
      className={`relative overflow-hidden rounded-xl border ${isSelected ? 'border-blue-400 bg-blue-50/60' : 'border-slate-200 bg-white hover:border-slate-300 hover:shadow'} ${isAnalysisActive ? 'cursor-wait opacity-80' : 'cursor-pointer'} transition`}
      onClick={handleItemClick}
    >
      {hasWarnings && <span className="absolute inset-y-0 left-0 w-1 bg-amber-400" aria-hidden="true"></span>}

      <div className="flex flex-col gap-3 p-4">
        <div className="flex items-start gap-3">
          <input
            type="checkbox"
            className="h-4 w-4 flex-shrink-0 cursor-pointer rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            checked={isSelected}
            onChange={() => onToggleSelection(document.id)}
            onClick={handleCheckboxClick}
            aria-label={`Dokument ${document.name} auswählen`}
          />
          <FileIcon className="mt-0.5 h-5 w-5 flex-shrink-0 text-blue-500" />
          <div className="min-w-0 flex-1 space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <span className="truncate text-sm font-semibold text-slate-800">{document.name}</span>
              {(statusInfo.text || statusInfo.icon) && (
                <span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold ${statusInfo.color}`} title={statusInfo.tooltip}>
                  {statusInfo.icon}
                  <span>{statusInfo.text}</span>
                </span>
              )}
              {hasWarnings && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800" title="Warnungen oder fehlende Angaben erkannt">
                  <AlertTriangleIcon className="h-3.5 w-3.5" />
                  Warnung
                </span>
              )}
            </div>

            <div className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
              <span>{formatDate(document.date)}</span>
              <span>• {document.source}</span>
              {document.vendor && <span>• {document.vendor}</span>}
              {document.invoiceNumber && <span>• Rechnung {document.invoiceNumber}</span>}
            </div>

            <div className="flex flex-wrap items-center gap-2 pt-1 text-xs font-medium">
              <div className="relative" onClick={e => e.stopPropagation()}>
                <FolderIcon className={`pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 ${storageLabel ? 'text-violet-500' : 'text-slate-400'}`} />
                <select
                  value={document.storageLocationId || ''}
                  onChange={handleStorageChange}
                  className={`appearance-none rounded-full pl-7 pr-8 py-1 shadow-sm focus:outline-none focus:ring-2 focus:ring-violet-300 ${storageTone}`}
                >
                  <option value="">Keine Ablage</option>
                  {storageLocations.map(location => (
                    <option key={location.id} value={location.id}>{location.label}</option>
                  ))}
                </select>
                <span className="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400">▼</span>
              </div>

              {confidenceLabel && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 ${confidenceTone}`}>
                  <SparklesIcon className="h-3.5 w-3.5" />
                  {confidenceLabel}
                </span>
              )}

              {ocrMetadata?.pageCount && (
                <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-slate-600">
                  {ocrMetadata.pageCount} Seite{ocrMetadata.pageCount > 1 ? 'n' : ''}
                </span>
              )}

              {warnings.length > 0 && (
                <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-amber-700">
                  <AlertTriangleIcon className="h-3.5 w-3.5" />
                  {warnings.length} Hinweis{warnings.length > 1 ? 'e' : ''}
                </span>
              )}
            </div>

            {analysisTimestamp && (
              <p className="text-[11px] font-medium uppercase tracking-wide text-slate-400">
                Analyse: {analysisTimestamp}
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-3 pl-8 md:pl-11">
          <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500">
            {document.totalAmount !== undefined && (
              <span>Betrag: {document.totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</span>
            )}
            {document.taxCategory && <span>Kategorie: {document.taxCategory}</span>}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReanalyzeClick}
              disabled={isAnalysisActive}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1 text-xs font-semibold transition ${isAnalysisActive ? 'border-slate-200 bg-slate-100 text-slate-400' : 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100'}`}
            >
              {isAnalysisActive ? (
                <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-blue-300 border-b-transparent"></div>
              ) : (
                <SparklesIcon className="h-3.5 w-3.5" />
              )}
              {isAnalysisActive ? 'Analyse läuft…' : 'Neu analysieren'}
            </button>

            <div className="min-w-[6.5rem] text-right">
              {isSendingToLexoffice ? (
                <div className="flex items-center justify-end gap-2 text-xs text-slate-500">
                  <div className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-slate-400 border-b-transparent"></div>
                  Sende…
                </div>
              ) : lexofficeStatus === LexofficeStatus.SUCCESS ? (
                <div className="flex items-center justify-end gap-1 text-xs font-semibold text-green-700" title={`Gesendet am ${document.lexoffice?.sentAt.toLocaleString('de-DE')}`}>
                  <CheckCircleIcon className="h-4 w-4" />
                  Gesendet
                </div>
              ) : lexofficeStatus === LexofficeStatus.FAILED ? (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToLexoffice(document.id);
                  }}
                  className="inline-flex items-center gap-1 rounded-full border border-red-200 bg-red-50 px-3 py-1 text-xs font-semibold text-red-700 hover:bg-red-100"
                  title={`Fehler am ${document.lexoffice?.sentAt.toLocaleString('de-DE')}. Erneut senden`}
                >
                  <AlertTriangleIcon className="h-4 w-4" />
                  Erneut senden
                </button>
              ) : (
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    onSendToLexoffice(document.id);
                  }}
                  className="inline-flex items-center gap-2 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-200"
                  title="Diesen Beleg an Lexoffice senden"
                >
                  <LexofficeIcon className="h-4 w-4" />
                  Senden
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DocumentItem;