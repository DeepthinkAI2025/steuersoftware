import React, { useState, useEffect, useMemo } from 'react';
import { Document, InvoiceType, StorageLocation, DocumentStatus } from '../types';
import useDebounce from '../hooks/useDebounce';
import { XIcon } from './icons/XIcon';
import SparklesIcon from './icons/SparklesIcon';
import FolderIcon from './icons/FolderIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';

interface DocumentDetailModalProps {
  document: Document;
  onClose: () => void;
  onUpdate: (document: Document) => void;
  storageLocations: StorageLocation[];
  onReanalyze: (document: Document) => Promise<void>;
  isReanalyzing: boolean;
}

const DocumentDetailModal: React.FC<DocumentDetailModalProps> = ({ document, onClose, onUpdate, storageLocations, onReanalyze, isReanalyzing }) => {
  const [formData, setFormData] = useState(document);
  const debouncedFormData = useDebounce(formData, 500);
  
  const [previewUrl, setPreviewUrl] = useState<string>('');
  const [isLoadingPreview, setIsLoadingPreview] = useState<boolean>(true);
  const [reanalyzeError, setReanalyzeError] = useState<string | null>(null);

  useEffect(() => {
    setFormData(document);
    setReanalyzeError(null);
    setIsLoadingPreview(true);
    setPreviewUrl(''); // Start with a clean slate

    let objectUrl: string | null = null;
    if (document.file) {
      // Create a temporary URL for the file blob. This is more performant and reliable than base64 encoding.
      objectUrl = URL.createObjectURL(document.file);
      setPreviewUrl(objectUrl);
      setIsLoadingPreview(false);
    } else {
      // If there's no file object, we cannot generate a preview.
      setIsLoadingPreview(false);
    }

    // This is a cleanup function. It runs when the component unmounts or before the effect runs again.
    // It's crucial for revoking the temporary URL to avoid memory leaks.
    return () => {
      if (objectUrl) {
        URL.revokeObjectURL(objectUrl);
      }
    };
  }, [document]); // This effect re-runs whenever the document prop changes.


  useEffect(() => {
    if (JSON.stringify(debouncedFormData) !== JSON.stringify(document)) {
      onUpdate(debouncedFormData);
    }
  }, [debouncedFormData, document, onUpdate]);

  const formatDate = (date: Date) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    const { name, value, type } = e.target;
    
    setFormData(prev => {
        let finalValue: string | number | Date = value;

        if (type === 'number') {
            finalValue = value === '' ? 0 : parseFloat(value);
        } else if (name === 'date') {
            finalValue = new Date(value);
        }
        
        const updatedDoc = { ...prev, [name]: finalValue };

        if (name === 'date') {
            const date = new Date(value);
            updatedDoc.year = date.getFullYear();
            updatedDoc.quarter = Math.floor((date.getMonth() + 3) / 3);
        }

        return updatedDoc;
    });
  };

  const handleStorageChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const { value } = e.target;
    setFormData(prev => ({ ...prev, storageLocationId: value === '' ? undefined : value }));
  };

  const handleReanalyzeClick = async () => {
    if (!formData.file) {
      setReanalyzeError('Für dieses Dokument liegt keine Originaldatei vor. Bitte laden Sie die Datei erneut hoch.');
      return;
    }
    setReanalyzeError(null);
    try {
      await onReanalyze(formData);
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Analyse fehlgeschlagen.';
      setReanalyzeError(message);
    }
  };

  const ocrMetadata = useMemo(() => formData.ocrMetadata, [formData.ocrMetadata]);
  const warnings = ocrMetadata?.warnings ?? [];
  const averageConfidence = typeof ocrMetadata?.averageConfidence === 'number' ? ocrMetadata.averageConfidence : undefined;
  const confidenceTone = (() => {
    if (averageConfidence === undefined) return 'bg-slate-100 text-slate-600';
    if (averageConfidence >= 90) return 'bg-emerald-100 text-emerald-700';
    if (averageConfidence >= 70) return 'bg-amber-100 text-amber-700';
    return 'bg-rose-100 text-rose-700';
  })();

  const analysedAt = ocrMetadata?.analysedAt ? new Date(ocrMetadata.analysedAt) : null;
  const hasWarnings = warnings.length > 0 || [DocumentStatus.MISSING_INVOICE, DocumentStatus.ERROR, DocumentStatus.POTENTIAL_DUPLICATE].includes(formData.status);
  const isAnalysisRunning = isReanalyzing || formData.status === DocumentStatus.ANALYZING;
  const canReanalyze = Boolean(formData.file) && !isAnalysisRunning;
  
  const fileType = document.file?.type || '';
  const name = document.name || '';

  const isPdf = fileType === 'application/pdf' || name.toLowerCase().endsWith('.pdf');
  const isImage = fileType.startsWith('image/') || 
                name.toLowerCase().endsWith('.png') || 
                name.toLowerCase().endsWith('.jpg') || 
                name.toLowerCase().endsWith('.jpeg') ||
                name.toLowerCase().endsWith('.gif');

  return (
    <div className="fixed inset-0 bg-black bg-opacity-60 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-6xl h-[90vh] flex flex-col">
        {/* Header */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 p-4">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="truncate pr-4 text-lg font-bold text-slate-800">{formData.name}</h2>
              <span className={`inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-semibold ${hasWarnings ? 'text-amber-700' : 'text-slate-600'}`}>
                {hasWarnings ? (
                  <AlertTriangleIcon className="h-4 w-4" />
                ) : (
                  <CheckCircleIcon className="h-4 w-4 text-emerald-500" />
                )}
                {formData.status}
              </span>
              {averageConfidence !== undefined && (
                <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${confidenceTone}`}>
                  <SparklesIcon className="h-4 w-4" />
                  {averageConfidence.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                </span>
              )}
              {formData.storageLocationId && (
                <span className="inline-flex items-center gap-1 rounded-full bg-violet-100 px-2 py-0.5 text-[11px] font-semibold text-violet-700">
                  <FolderIcon className="h-4 w-4" />
                  {storageLocations.find(location => location.id === formData.storageLocationId)?.label || 'Ablage unbekannt'}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-3 text-xs text-slate-500">
              <span>Belegdatum: {formatDate(new Date(formData.date))}</span>
              {formData.vendor && <span>Vendor: {formData.vendor}</span>}
              {analysedAt && <span>Analyse: {formatDate(analysedAt)}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReanalyzeClick}
              disabled={!canReanalyze}
              className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-semibold transition ${canReanalyze ? 'border-blue-200 bg-blue-50 text-blue-700 hover:bg-blue-100' : 'border-slate-200 bg-slate-100 text-slate-400'}`}
            >
              {isAnalysisRunning ? (
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-blue-300 border-b-transparent"></div>
              ) : (
                <SparklesIcon className="h-4 w-4" />
              )}
              {isAnalysisRunning ? 'Analyse läuft…' : 'Neu analysieren'}
            </button>
            <button onClick={onClose} className="rounded-full p-2 hover:bg-slate-100" title="Schließen">
              <XIcon className="h-6 w-6 text-slate-500" />
            </button>
          </div>
        </div>
        
        {/* Content */}
        <div className="flex-grow flex flex-col md:flex-row overflow-hidden">
          {/* Preview */}
          <div className="w-full md:w-2/3 h-1/2 md:h-full bg-slate-100 overflow-auto border-b md:border-b-0 md:border-r border-slate-200">
            {isLoadingPreview ? (
                <div className="w-full h-full flex items-center justify-center">
                    <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
                </div>
            ) : isPdf && previewUrl ? (
              <iframe src={previewUrl} title={document.name} className="w-full h-full border-0" />
            ) : isImage && previewUrl ? (
              <img src={previewUrl} alt="Document Preview" className="w-full h-full object-contain p-2" />
            ) : (
                <div className="w-full h-full flex items-center justify-center bg-slate-200 text-slate-500 p-4 text-center">
                    <p>Vorschau für diesen Dateityp nicht verfügbar.</p>
                </div>
            )}
          </div>
          
          {/* Form */}
          <form className="w-full md:w-1/3 h-1/2 md:h-full overflow-y-auto p-6 space-y-4">
            {reanalyzeError && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                {reanalyzeError}
              </div>
            )}

            <section className="rounded-lg border border-slate-200 bg-slate-50 p-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="text-sm font-semibold text-slate-700">OCR-Auswertung</h3>
                {averageConfidence !== undefined && (
                  <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${confidenceTone}`}>
                    <SparklesIcon className="h-4 w-4" />
                    {averageConfidence.toLocaleString('de-DE', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%
                  </span>
                )}
              </div>
              <dl className="mt-3 grid grid-cols-1 gap-2 text-xs text-slate-600">
                <div className="flex justify-between">
                  <dt className="font-medium text-slate-700">Status</dt>
                  <dd className="text-right">{formData.status}</dd>
                </div>
                {analysedAt && (
                  <div className="flex justify-between">
                    <dt className="font-medium text-slate-700">Analysiert am</dt>
                    <dd className="text-right">{formatDate(analysedAt)}</dd>
                  </div>
                )}
                {ocrMetadata?.pageCount && (
                  <div className="flex justify-between">
                    <dt className="font-medium text-slate-700">Seitenzahl</dt>
                    <dd className="text-right">{ocrMetadata.pageCount}</dd>
                  </div>
                )}
              </dl>

              {warnings.length > 0 && (
                <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs text-amber-800">
                  <div className="mb-1 flex items-center gap-2 font-semibold">
                    <AlertTriangleIcon className="h-4 w-4" />
                    {warnings.length} Hinweis{warnings.length > 1 ? 'e' : ''}
                  </div>
                  <ul className="list-disc space-y-1 pl-5">
                    {warnings.map((warning, index) => (
                      <li key={index}>{warning}</li>
                    ))}
                  </ul>
                </div>
              )}

              {ocrMetadata?.fields && ocrMetadata.fields.length > 0 && (
                <div className="mt-4">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Feldkonfidenzen</p>
                  <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-slate-200 bg-white">
                    <table className="min-w-full divide-y divide-slate-200 text-xs">
                      <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
                        <tr>
                          <th className="px-3 py-2 text-left">Feld</th>
                          <th className="px-3 py-2 text-left">Wert</th>
                          <th className="px-3 py-2 text-right">Vertrauen</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {ocrMetadata.fields.map((field, index) => (
                          <tr key={`${field.field}-${index}`}>
                            <td className="px-3 py-2 font-medium text-slate-700">{field.field}</td>
                            <td className="px-3 py-2 text-slate-600">{field.value}</td>
                            <td className="px-3 py-2 text-right text-slate-700">{field.confidence.toLocaleString('de-DE', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}%</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </section>

            <div>
              <label htmlFor="storageLocation" className="block text-sm font-medium text-slate-600">Ablage</label>
              <select
                id="storageLocation"
                value={formData.storageLocationId || ''}
                onChange={handleStorageChange}
                className="mt-1 block w-full rounded-lg border border-slate-300 bg-white p-2 shadow-sm focus:border-blue-500 focus:ring-blue-500"
              >
                <option value="">Keine Ablage</option>
                {storageLocations.map(location => (
                  <option key={location.id} value={location.id}>{location.label}</option>
                ))}
              </select>
            </div>

            <h3 className="text-md font-semibold text-slate-700">Extrahierte Daten</h3>
            <div>
              <label htmlFor="name" className="block text-sm font-medium text-slate-600">Dateiname</label>
              <input type="text" name="name" id="name" value={formData.name || ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
              <label htmlFor="vendor" className="block text-sm font-medium text-slate-600">Verkäufer</label>
              <input type="text" name="vendor" id="vendor" value={formData.vendor || ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
             <div>
                <label htmlFor="taxCategory" className="block text-sm font-medium text-slate-600">Steuerkategorie</label>
                <input 
                    type="text" 
                    name="taxCategory" 
                    id="taxCategory" 
                    value={formData.taxCategory || ''} 
                    onChange={handleChange} 
                    className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500"
                    list="tax-categories"
                />
                <datalist id="tax-categories">
                    <option value="Photovoltaik" />
                    <option value="Einnahmen" />
                    <option value="Material/Waren" />
                    <option value="Kraftstoff" />
                    <option value="Bürobedarf" />
                    <option value="Bewirtungskosten" />
                    <option value="Reisekosten" />
                    <option value="Sonstiges" />
                </datalist>
            </div>
            <div>
              <label htmlFor="invoiceNumber" className="block text-sm font-medium text-slate-600">Rechnungsnummer</label>
              <input type="text" name="invoiceNumber" id="invoiceNumber" value={formData.invoiceNumber || ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div>
                <label htmlFor="date" className="block text-sm font-medium text-slate-600">Datum</label>
                <input type="date" name="date" id="date" value={new Date(formData.date).toISOString().split('T')[0]} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" />
            </div>
            <div className="flex space-x-4">
              <div className="w-1/2">
                <label htmlFor="totalAmount" className="block text-sm font-medium text-slate-600">Bruttobetrag</label>
                <input type="number" name="totalAmount" id="totalAmount" value={formData.totalAmount ?? ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" step="0.01"/>
              </div>
              <div className="w-1/2">
                <label htmlFor="vatAmount" className="block text-sm font-medium text-slate-600">MwSt.</label>
                <input type="number" name="vatAmount" id="vatAmount" value={formData.vatAmount ?? ''} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500" step="0.01"/>
              </div>
            </div>
            <div>
                <label htmlFor="invoiceType" className="block text-sm font-medium text-slate-600">Rechnungstyp</label>
                <select name="invoiceType" id="invoiceType" value={formData.invoiceType} onChange={handleChange} className="mt-1 block w-full p-2 border border-slate-300 rounded-lg shadow-sm focus:ring-blue-500 focus:border-blue-500">
                    <option value={InvoiceType.INCOMING}>Eingangsrechnung</option>
                    <option value={InvoiceType.OUTGOING}>Ausgangsrechnung</option>
                </select>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};

export default DocumentDetailModal;