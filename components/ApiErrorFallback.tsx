import React from 'react';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import { XIcon } from './icons/XIcon';

interface ApiErrorFallbackProps {
  error: {
    message: string;
    code?: string;
    details?: any;
  };
  onRetry?: () => void;
  onDismiss?: () => void;
  title?: string;
  showDetails?: boolean;
}

const ApiErrorFallback: React.FC<ApiErrorFallbackProps> = ({
  error,
  onRetry,
  onDismiss,
  title = 'Fehler aufgetreten',
  showDetails = false
}) => {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 p-4">
      <div className="flex items-start">
        <div className="flex-shrink-0">
          <AlertTriangleIcon className="h-5 w-5 text-red-400" />
        </div>
        <div className="ml-3 flex-1">
          <h3 className="text-sm font-medium text-red-800">
            {title}
          </h3>
          <div className="mt-2 text-sm text-red-700">
            <p>{error.message}</p>
            {error.code && (
              <p className="mt-1 text-xs text-red-600">
                Fehlercode: {error.code}
              </p>
            )}
          </div>
          {showDetails && error.details && (
            <details className="mt-2">
              <summary className="cursor-pointer text-xs text-red-600 hover:text-red-800">
                Technische Details
              </summary>
              <pre className="mt-1 text-xs bg-red-100 p-2 rounded overflow-auto max-h-20">
                {JSON.stringify(error.details, null, 2)}
              </pre>
            </details>
          )}
          <div className="mt-3 flex space-x-2">
            {onRetry && (
              <button
                onClick={onRetry}
                className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Erneut versuchen
              </button>
            )}
            {onDismiss && (
              <button
                onClick={onDismiss}
                className="inline-flex items-center px-3 py-1.5 border border-red-300 text-xs font-medium rounded text-red-700 bg-red-100 hover:bg-red-200 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500"
              >
                Schließen
              </button>
            )}
          </div>
        </div>
        {onDismiss && (
          <div className="ml-auto pl-3">
            <button
              onClick={onDismiss}
              className="inline-flex rounded-md bg-red-50 p-1.5 text-red-500 hover:bg-red-100 focus:outline-none focus:ring-2 focus:ring-red-600 focus:ring-offset-2"
            >
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
};

export default ApiErrorFallback;