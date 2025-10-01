import React, { useState, useCallback, useRef } from 'react';
import {
  Document,
  DocumentSource,
  DocumentStatus,
  InvoiceType,
  Rule,
  RuleSuggestion,
} from '../types';
import {
  analyzeDocument,
  getDocumentStatusFromAnalysis,
  createSuggestedFileName,
  buildOcrMetadataFromAnalysis,
} from '../services/geminiService';
import { UploadCloudIcon } from './icons/UploadCloudIcon';
import { ComputerIcon } from './icons/ComputerIcon';
import { XIcon } from './icons/XIcon';

interface UploadModalProps {
  onClose: () => void;
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  rules: Rule[];
  onRuleSuggestion: (suggestion: RuleSuggestion) => void;
  apiKey: string;
  onUploadSuccess: (message: string) => void;
  onUploadError: (message: string) => void;
  onDuplicateDetected: (doc: Document) => void;
}

type UploadMode = 'manual' | 'local';

const ACCEPTED_FILE_TYPES = 'application/pdf,image/png,image/jpeg,image/jpg,image/webp,image/tiff,image/tif';

const UploadModal: React.FC<UploadModalProps> = ({
  onClose,
  setDocuments,
  rules,
  onRuleSuggestion,
  apiKey,
  onUploadSuccess,
  onUploadError,
  onDuplicateDetected,
}) => {
  const [mode, setMode] = useState<UploadMode>('manual');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isDragActive, setIsDragActive] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const handleFilesAdded = useCallback((incoming: FileList | File[] | null) => {
    if (!incoming) return;
    const candidates = Array.from(incoming).filter(Boolean);
    if (candidates.length === 0) return;

    setFiles(prev => {
      const existingKeys = new Set(prev.map(file => `${file.name}-${file.size}-${file.lastModified}`));
      const deduped = candidates.filter(file => !existingKeys.has(`${file.name}-${file.size}-${file.lastModified}`));
      if (deduped.length === 0) {
        return prev;
      }
      return [...prev, ...deduped];
    });
  }, []);

  const handleFileChange = useCallback(
    (event: React.ChangeEvent<HTMLInputElement>) => {
      handleFilesAdded(event.target.files);
      event.target.value = '';
    },
    [handleFilesAdded],
  );

  const openFileDialog = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  const handleDragOver = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'copy';
    setIsDragActive(true);
  }, []);

  const handleDragLeave = useCallback((event: React.DragEvent<HTMLDivElement>) => {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node)) return;
    setIsDragActive(false);
  }, []);

  const handleDrop = useCallback(
    (event: React.DragEvent<HTMLDivElement>) => {
      event.preventDefault();
      setIsDragActive(false);
      handleFilesAdded(event.dataTransfer.files);
    },
    [handleFilesAdded],
  );

  const handleRemoveFile = useCallback((index: number) => {
    setFiles(prev => prev.filter((_, i) => i !== index));
  }, []);

  const processAndUploadFiles = useCallback(() => {
    if (files.length === 0) return;
    setIsProcessing(true);
    onClose();

    (async () => {
      const source = mode === 'manual' ? DocumentSource.MANUAL : DocumentSource.LOCAL;
      let suggestionMade = false;

      for (const file of files) {
  let createdDocumentId: string | null = null;
  let baseDoc: Document | null = null;
        try {
          const fd = new FormData();
          fd.append('file', file, file.name);
          fd.append('source', source);

          const createRes = await fetch('/api/documents', { method: 'POST', body: fd });
          if (!createRes.ok) {
            throw new Error(await createRes.text());
          }
          const created = await createRes.json();
          createdDocumentId = created?.id ? String(created.id) : null;

          const baseDocValue: Document = {
            id: created.id,
            name: created.name,
            date: new Date(created.date),
            year: created.year,
            quarter: created.quarter,
            source: created.source,
            status: created.status,
            fileUrl: created.fileUrl,
            file,
            invoiceType: created.invoiceType || InvoiceType.INCOMING,
            documentType: created.documentType || 'Unbekannt',
            tags: created.tags || [],
            linkedTransactionIds: created.linkedTransactionIds || [],
            fileHash: created.fileHash,
            duplicateOfId: created.duplicateOfId,
            duplicateIgnored: created.duplicateIgnored,
            textContent: created.textContent,
            vendor: created.vendor,
            totalAmount: created.totalAmount,
            vatAmount: created.vatAmount,
            invoiceNumber: created.invoiceNumber,
            taxCategory: created.taxCategory,
            ocrMetadata: created.ocrMetadata,
          };
          baseDoc = baseDocValue;

          setDocuments(prev => [baseDocValue, ...prev]);

          const analysis = await analyzeDocument(file, rules, apiKey);
          const metadata = buildOcrMetadataFromAnalysis(analysis);
          const date = analysis.documentDate ? new Date(analysis.documentDate) : new Date();
          const status = getDocumentStatusFromAnalysis(analysis, []);

          const updatedPayload = {
            name: createSuggestedFileName(analysis, file.name.split('.').pop() || 'pdf'),
            vendor: analysis.vendor,
            totalAmount: analysis.totalAmount,
            vatAmount: analysis.vatAmount,
            invoiceNumber: analysis.invoiceNumber,
            taxCategory: analysis.taxCategory,
            textContent: analysis.textContent,
            status,
            date: date.toISOString(),
            year: date.getFullYear(),
            quarter: Math.floor((date.getMonth() + 3) / 3),
            ocrMetadata: metadata,
            documentType: analysis.documentType,
          } as const;

          const updateRes = await fetch(`/api/documents/${created.id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(updatedPayload),
          });

          if (!updateRes.ok) {
            throw new Error(await updateRes.text());
          }

          const updated = await updateRes.json();
          const normalizedDoc: Document = {
            ...baseDocValue,
            ...updated,
            date: new Date(updated.date),
            documentType: updated.documentType || analysis.documentType || baseDocValue.documentType,
            tags: (updated.tags ?? baseDocValue.tags) || [],
            linkedTransactionIds: (updated.linkedTransactionIds ?? baseDocValue.linkedTransactionIds) || [],
            ocrMetadata: updated.ocrMetadata
              ? {
                  ...updated.ocrMetadata,
                  analysedAt: updated.ocrMetadata.analysedAt
                    ? new Date(updated.ocrMetadata.analysedAt)
                    : new Date(),
                }
              : baseDocValue.ocrMetadata,
          };

          setDocuments(prev =>
            prev
              .map(doc => (doc.id === normalizedDoc.id ? normalizedDoc : doc))
              .sort((a, b) => b.date.getTime() - a.date.getTime()),
          );

          if (!suggestionMade && analysis.vendor && analysis.taxCategory && analysis.taxCategory !== 'Sonstiges') {
            onRuleSuggestion({
              vendor: analysis.vendor,
              taxCategory: analysis.taxCategory,
              invoiceType: analysis.invoiceType,
            });
            suggestionMade = true;
          }

          onUploadSuccess('Dokument erfolgreich hochgeladen und analysiert.');

          if (normalizedDoc.status === DocumentStatus.POTENTIAL_DUPLICATE) {
            onDuplicateDetected(normalizedDoc);
          }
        } catch (error) {
          const message = error instanceof Error ? error.message : 'Unbekannter Fehler';
          console.error('Upload/Analyse Fehler', error);
          onUploadError(`Fehler beim Hochladen oder Analysieren: ${message}`);

          if (createdDocumentId) {
            setDocuments(prev =>
              prev.map(doc =>
                doc.id === createdDocumentId
                  ? { ...doc, status: DocumentStatus.ERROR, errorMessage: message }
                  : doc,
              ),
            );

            try {
              await fetch(`/api/documents/${createdDocumentId}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status: DocumentStatus.ERROR, errorMessage: message }),
              });
            } catch (updateError) {
              console.error('Fehler beim Aktualisieren des Dokumentstatus nach Fehler:', updateError);
            }
          } else if (baseDoc) {
            setDocuments(prev =>
              prev.map(doc =>
                doc.id === baseDoc!.id
                  ? { ...doc, status: DocumentStatus.ERROR, errorMessage: message }
                  : doc,
              ),
            );
          }
        }
      }

      setIsProcessing(false);
    })();
  }, [apiKey, files, mode, onClose, onDuplicateDetected, onRuleSuggestion, onUploadError, onUploadSuccess, rules, setDocuments]);

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-xl shadow-xl w-full max-w-2xl transform transition-all">
        <div className="p-5 border-b border-slate-200">
          <div className="flex justify-between items-center">
            <h2 className="text-lg font-bold text-slate-800">Belege hinzufügen</h2>
            <button onClick={onClose} className="p-2 rounded-full text-slate-400 hover:bg-slate-100 hover:text-slate-600"><XIcon className="w-5 h-5"/></button>
          </div>
        </div>

        <div className="p-6">
          <div className="flex border border-slate-200 rounded-lg p-1 bg-slate-100 mb-6">
            <button onClick={() => setMode('manual')} className={`w-1/2 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'manual' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}>
              Manueller Upload
            </button>
            <button onClick={() => setMode('local')} className={`w-1/2 py-2 rounded-md text-sm font-semibold transition-all ${mode === 'local' ? 'bg-white shadow-sm text-blue-600' : 'text-slate-600'}`}>
              Lokaler Ordner
            </button>
          </div>
          
          {mode === 'manual' ? (
            <div
              onClick={openFileDialog}
              onDragEnter={handleDragOver}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              className={`relative flex flex-col items-center justify-center w-full h-48 border-2 border-dashed rounded-lg transition-colors cursor-pointer ${
                isDragActive ? 'border-blue-400 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:bg-slate-100'
              } focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2`}
              role="button"
              aria-label="Dateien auswählen oder hier ablegen"
            >
              <UploadCloudIcon
                className={`w-10 h-10 mb-3 ${isDragActive ? 'text-blue-400' : 'text-slate-400'}`}
              />
              <p className="mb-2 text-sm text-slate-500 text-center">
                <span className="font-semibold">Klicken zum Hochladen</span> oder Dateien hierher ziehen
              </p>
              <p className="text-xs text-slate-500">PDF, PNG, JPG, WebP, TIFF</p>
              {isDragActive && (
                <p className="mt-2 text-xs font-medium text-blue-600">Loslassen, um Dateien hinzuzufügen</p>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                <p className="text-sm text-blue-800">
                  <strong>Hinweis:</strong> Aus Sicherheitsgründen können Webanwendungen nicht automatisch auf Ihre lokalen Ordner zugreifen. Bitte wählen Sie die Dateien manuell aus.
                </p>
              </div>
              <button
                type="button"
                onClick={openFileDialog}
                className="w-full flex items-center justify-center py-2.5 px-5 text-sm font-medium text-slate-900 focus:outline-none bg-white rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-slate-100"
              >
                <ComputerIcon className="w-5 h-5 mr-2" />
                Dateien aus Ordner auswählen
              </button>
            </div>
          )}

          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            multiple
            accept={ACCEPTED_FILE_TYPES}
            onChange={handleFileChange}
          />

          {files.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-600">Ausgewählte Dateien:</h4>
              <ul className="mt-2 text-sm text-slate-500 space-y-1 max-h-32 overflow-y-auto">
                {files.map((file, index) => (
                  <li
                    key={`${file.name}-${file.size}-${file.lastModified}`}
                    className="flex items-center justify-between gap-3 rounded-md bg-slate-100 px-3 py-2"
                  >
                    <span className="truncate" title={file.name}>
                      {file.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => handleRemoveFile(index)}
                      className="text-xs font-medium text-slate-500 hover:text-red-600"
                    >
                      Entfernen
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>

        <div className="p-5 bg-slate-50 rounded-b-xl flex justify-end">
          <button onClick={onClose} className="mr-3 py-2 px-4 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-100">Abbrechen</button>
          <button
            onClick={processAndUploadFiles}
            disabled={files.length === 0 || isProcessing}
            className="py-2 px-4 text-sm font-medium text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:bg-blue-300"
          >
            {isProcessing ? 'Verarbeite...' : `${files.length} Beleg(e) hochladen`}
          </button>
        </div>
      </div>
    </div>
  );
};

export default UploadModal;