import React from 'react';
import { Document } from '../types';
import CopyIcon from './icons/CopyIcon';
import { XIcon } from './icons/XIcon';

interface DuplicateToastProps {
  document: Document;
  onCompare: () => void;
  onDismiss: () => void;
}

const DuplicateToast: React.FC<DuplicateToastProps> = ({ document, onCompare, onDismiss }) => {
  return (
    <div
      className="fixed bottom-5 right-5 w-full max-w-md bg-white rounded-xl shadow-lg border border-slate-200 p-4 z-50"
      role="alert"
      aria-live="assertive"
    >
      <div className="flex items-start">
        <div className="flex-shrink-0 pt-0.5">
          <div className="p-2 bg-orange-100 rounded-full">
            <CopyIcon className="w-5 h-5 text-orange-600" />
          </div>
        </div>
        <div className="ml-3 flex-1">
          <p className="text-sm font-semibold text-slate-900">
            Mögliches Duplikat erkannt
          </p>
          <p className="mt-1 text-sm text-slate-600">
            Das Dokument <strong>"{document.name}"</strong> könnte ein Duplikat sein.
          </p>
          <div className="mt-3 flex space-x-2">
            <button
              onClick={onCompare}
              className="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md shadow-sm text-white bg-orange-600 hover:bg-orange-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Vergleichen
            </button>
            <button
              onClick={onDismiss}
              className="inline-flex items-center px-3 py-1.5 border border-slate-300 text-xs font-medium rounded-md text-slate-700 bg-white hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-orange-500"
            >
              Ignorieren
            </button>
          </div>
        </div>
        <div className="ml-4 flex-shrink-0 flex">
          <button onClick={onDismiss} className="inline-flex text-slate-400 hover:text-slate-500">
            <span className="sr-only">Close</span>
            <XIcon className="h-5 w-5" />
          </button>
        </div>
      </div>
    </div>
  );
};

export default DuplicateToast;