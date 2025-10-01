import React from 'react';
import { Document, DocumentStatus } from '../types';
import { XIcon } from './icons/XIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CopyIcon from './icons/CopyIcon';

interface DuplicateComparisonModalProps {
  documents: [Document, Document];
  onClose: () => void;
  onIgnore: (id: string) => void;
  onDelete: (id: string) => void;
  onKeepBoth: (id: string) => void;
}

const DuplicateComparisonModal: React.FC<DuplicateComparisonModalProps> = ({ documents, onClose, onIgnore, onDelete, onKeepBoth }) => {
  const [doc1, doc2] = documents;

  const formatDate = (date: Date) => new Intl.DateTimeFormat('de-DE', { dateStyle: 'medium' }).format(date);

  const getStatusInfo = (status: DocumentStatus) => {
    switch(status) {
      case DocumentStatus.OK: return { text: 'OK', color: 'text-green-700' };
      case DocumentStatus.POTENTIAL_DUPLICATE: return { text: 'Mögliches Duplikat', color: 'text-orange-700' };
      case DocumentStatus.ERROR: return { text: 'Fehler', color: 'text-red-700' };
      default: return { text: status, color: 'text-slate-700' };
    }
  };

  const renderDoc = (doc: Document, index: number) => (
    <div className="flex-1 space-y-4">
      <h3 className="text-lg font-semibold text-slate-900">Dokument {index + 1}</h3>
      <div className="rounded-lg border border-slate-200 bg-white p-4 space-y-3">
        <div className="flex items-center gap-2">
          <span className="font-medium text-slate-800">{doc.name}</span>
          <span className={`text-sm ${getStatusInfo(doc.status).color}`}>{getStatusInfo(doc.status).text}</span>
        </div>
        <div className="text-sm text-slate-600 space-y-1">
          <p>Datum: {formatDate(doc.date)}</p>
          <p>Quelle: {doc.source}</p>
          {doc.vendor && <p>Vendor: {doc.vendor}</p>}
          {doc.invoiceNumber && <p>Rechnung: {doc.invoiceNumber}</p>}
          {doc.totalAmount !== undefined && <p>Betrag: {doc.totalAmount.toLocaleString('de-DE', { style: 'currency', currency: 'EUR' })}</p>}
          {doc.taxCategory && <p>Kategorie: {doc.taxCategory}</p>}
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => onIgnore(doc.id)}
            className="px-3 py-1 text-xs bg-slate-100 text-slate-700 rounded hover:bg-slate-200"
          >
            Ignorieren
          </button>
          <button
            onClick={() => onDelete(doc.id)}
            className="px-3 py-1 text-xs bg-red-100 text-red-700 rounded hover:bg-red-200"
          >
            Löschen
          </button>
        </div>
      </div>
    </div>
  );

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black bg-opacity-50">
      <div className="max-w-4xl w-full mx-4 bg-white rounded-xl shadow-lg">
        <div className="flex items-center justify-between p-6 border-b border-slate-200">
          <h2 className="text-xl font-semibold text-slate-900 flex items-center gap-2">
            <CopyIcon className="w-5 h-5 text-orange-500" />
            Duplikat-Vergleich
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <XIcon className="w-6 h-6" />
          </button>
        </div>
        <div className="p-6">
          <div className="flex gap-6">
            {renderDoc(doc1, 0)}
            {renderDoc(doc2, 1)}
          </div>
          <div className="mt-6 flex justify-center gap-4">
            <button
              onClick={() => onKeepBoth(doc1.id)}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700"
            >
              Beide behalten
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 bg-slate-300 text-slate-700 rounded hover:bg-slate-400"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DuplicateComparisonModal;