import React, { useState, useCallback } from 'react';
import { Document, DocumentSource, DocumentStatus, InvoiceType, Rule, RuleSuggestion, DEFAULT_DIGITAL_STORAGE_ID } from '../types';
import { analyzeDocument, getDocumentStatusFromAnalysis, createSuggestedFileName, buildOcrMetadataFromAnalysis } from '../services/geminiService';
import { UploadCloudIcon } from './icons/UploadCloudIcon';
import { ComputerIcon } from './icons/ComputerIcon';
import { XIcon } from './icons/XIcon';

interface UploadModalProps {
  onClose: () => void;
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  rules: Rule[];
  onRuleSuggestion: (suggestion: RuleSuggestion) => void;
  apiKey: string;
}

type UploadMode = 'manual' | 'local';

const UploadModal: React.FC<UploadModalProps> = ({ onClose, setDocuments, rules, onRuleSuggestion, apiKey }) => {
  const [mode, setMode] = useState<UploadMode>('manual');
  const [files, setFiles] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  const handleFileChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (event.target.files) {
      setFiles(Array.from(event.target.files));
    }
  };

  const processAndUploadFiles = useCallback(() => {
    if (files.length === 0) return;
    setIsProcessing(true);
    onClose();

    setDocuments(prevDocs => {
        const source = mode === 'manual' ? DocumentSource.MANUAL : DocumentSource.LOCAL;

    const placeholderDocs: Document[] = files.map(file => ({
      id: `temp-${Math.random().toString(36).substr(2, 9)}`,
      name: file.name,
      date: new Date(),
      year: new Date().getFullYear(),
      quarter: Math.floor((new Date().getMonth() + 3) / 3),
      source: source,
      status: DocumentStatus.ANALYZING,
      fileUrl: URL.createObjectURL(file),
      file: file,
      invoiceType: InvoiceType.INCOMING,
      storageLocationId: DEFAULT_DIGITAL_STORAGE_ID,
      tags: [],
      linkedTransactionIds: [],
    }));

        let suggestionMade = false;
        const analysisPromises = files.map(async (file, index) => {
            try {
                const result = await analyzeDocument(file, rules, apiKey);
                const date = new Date(result.documentDate || Date.now());
                const originalExtension = file.name.split('.').pop() || 'pdf';
        const status = getDocumentStatusFromAnalysis(result, prevDocs);
        const metadata = buildOcrMetadataFromAnalysis(result);
        const storageLocationId = result.suggestedStorageLocationId || placeholderDocs[index].storageLocationId || DEFAULT_DIGITAL_STORAGE_ID;
        const tagSet = new Set<string>([
          ...(placeholderDocs[index].tags || []),
          result.taxCategory || '',
          result.vendor || '',
        ].filter(Boolean));

        const finalDoc: Document = {
          ...placeholderDocs[index],
          name: createSuggestedFileName(result, originalExtension),
          date,
          year: date.getFullYear(),
          quarter: Math.floor((date.getMonth() + 3) / 3),
          status,
          source,
          textContent: result.textContent,
          vendor: result.vendor,
          totalAmount: result.totalAmount,
          vatAmount: result.vatAmount,
          invoiceNumber: result.invoiceNumber,
          invoiceType: result.invoiceType,
          taxCategory: result.taxCategory,
          ocrMetadata: metadata,
          storageLocationId,
          tags: Array.from(tagSet),
        };

                if (!suggestionMade && finalDoc.vendor && finalDoc.taxCategory && finalDoc.taxCategory !== 'Sonstiges') {
                    onRuleSuggestion({
                        vendor: finalDoc.vendor,
                        taxCategory: finalDoc.taxCategory,
                        invoiceType: finalDoc.invoiceType,
                    });
                    suggestionMade = true;
                }

                return finalDoc;
            } catch (error) {
                const errorMessage = error instanceof Error ? error.message : "Unbekannter Analysefehler.";
                const errorDoc: Document = {
          ...placeholderDocs[index],
          name: file.name,
          date: new Date(),
          year: new Date().getFullYear(),
          quarter: Math.floor((new Date().getMonth() + 3) / 3),
          source,
          status: DocumentStatus.ERROR,
          errorMessage,
          invoiceType: InvoiceType.INCOMING,
          ocrMetadata: undefined,
                };
                return errorDoc;
            }
        });

        Promise.all(analysisPromises).then(finalDocuments => {
            setDocuments(currentDocs => {
                const finalDocsMap = new Map(finalDocuments.map(doc => [doc.id, doc]));
                const updatedDocs = currentDocs.map(doc => finalDocsMap.get(doc.id) || doc);
                return updatedDocs.sort((a, b) => b.date.getTime() - a.date.getTime());
            });
        });

        return [...placeholderDocs, ...prevDocs].sort((a,b) => b.date.getTime() - a.date.getTime());
    });
  }, [files, mode, setDocuments, onClose, rules, onRuleSuggestion, apiKey]);

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
          
          {mode === 'manual' && (
            <div>
              <label htmlFor="file-upload" className="flex flex-col items-center justify-center w-full h-48 border-2 border-dashed border-slate-300 rounded-lg cursor-pointer bg-slate-50 hover:bg-slate-100">
                <div className="flex flex-col items-center justify-center pt-5 pb-6">
                  <UploadCloudIcon className="w-10 h-10 mb-3 text-slate-400" />
                  <p className="mb-2 text-sm text-slate-500"><span className="font-semibold">Klicken zum Hochladen</span> oder Dateien hierher ziehen</p>
                  <p className="text-xs text-slate-500">PDF, PNG, JPG</p>
                </div>
                <input id="file-upload" type="file" className="hidden" multiple onChange={handleFileChange} />
              </label>
            </div>
          )}

          {mode === 'local' && (
            <div className="space-y-4">
               <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
                    <p className="text-sm text-blue-800">
                        <strong>Hinweis:</strong> Aus Sicherheitsgründen können Webanwendungen nicht automatisch auf Ihre lokalen Ordner zugreifen. Bitte wählen Sie die Dateien manuell aus.
                    </p>
                </div>
               <label htmlFor="local-file-upload" className="w-full flex items-center justify-center py-2.5 px-5 text-sm font-medium text-slate-900 focus:outline-none bg-white rounded-lg border border-slate-200 hover:bg-slate-100 hover:text-blue-700 focus:z-10 focus:ring-4 focus:ring-slate-100 cursor-pointer">
                <ComputerIcon className="w-5 h-5 mr-2" />
                Dateien aus Ordner auswählen
               </label>
               <input id="local-file-upload" type="file" className="hidden" multiple onChange={handleFileChange} />
            </div>
          )}

          {files.length > 0 && (
            <div className="mt-4">
              <h4 className="text-sm font-semibold text-slate-600">Ausgewählte Dateien:</h4>
              <ul className="mt-2 text-sm text-slate-500 list-disc list-inside max-h-24 overflow-y-auto">
                {files.map((file, index) => <li key={index} className="truncate">{file.name}</li>)}
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