import { useState, useCallback } from 'react';

export interface ApiError {
  message: string;
  code?: string;
  details?: any;
}

export interface UseApiErrorReturn {
  error: ApiError | null;
  setError: (error: ApiError | null) => void;
  clearError: () => void;
  handleApiError: (error: any, fallbackMessage?: string) => void;
  isError: boolean;
}

export const useApiError = (): UseApiErrorReturn => {
  const [error, setError] = useState<ApiError | null>(null);

  const clearError = useCallback(() => {
    setError(null);
  }, []);

  const handleApiError = useCallback((error: any, fallbackMessage = 'Ein unerwarteter Fehler ist aufgetreten') => {
    console.error('API Error:', error);

    let errorMessage = fallbackMessage;
    let errorCode: string | undefined;
    let errorDetails: any;

    if (error instanceof Error) {
      errorMessage = error.message;
    } else if (typeof error === 'string') {
      errorMessage = error;
    } else if (error?.message) {
      errorMessage = error.message;
      errorCode = error.code || error.status;
      errorDetails = error.details || error.response?.data;
    } else if (error?.response?.data?.message) {
      errorMessage = error.response.data.message;
      errorCode = error.response.status;
      errorDetails = error.response.data;
    } else if (error?.response?.status) {
      errorCode = error.response.status.toString();
      errorMessage = `HTTP ${errorCode}: ${error.response.statusText || fallbackMessage}`;
    }

    setError({
      message: errorMessage,
      code: errorCode,
      details: errorDetails
    });
  }, []);

  return {
    error,
    setError,
    clearError,
    handleApiError,
    isError: error !== null
  };
};