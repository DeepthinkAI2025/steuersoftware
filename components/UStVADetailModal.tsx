import React, { useState } from 'react';
import { UStVA, UStVAStatus } from '../types';
import { updateUStVAStatus, validateUStVA, prepareLexofficeData, sendUStVAToLexoffice } from '../services/ustvaService';

interface UStVADetailModalProps {
  ustva: UStVA;
  onClose: () => void;
  onStatusUpdate: (ustvaId: string, status: UStVAStatus) => void;
}

const UStVADetailModal: React.FC<UStVADetailModalProps> = ({ ustva, onClose, onStatusUpdate }) => {
  const [isUpdating, setIsUpdating] = useState(false);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  const handleStatusUpdate = async (newStatus: UStVAStatus) => {
    setIsUpdating(true);
    setValidationErrors([]);

    try {
      if (newStatus === UStVAStatus.READY || newStatus === UStVAStatus.SUBMITTED) {
        const errors = validateUStVA(ustva.data);
        if (errors.length > 0) {
          setValidationErrors(errors);
          return;
        }
      }

      onStatusUpdate(ustva.id, newStatus);
      if (newStatus === UStVAStatus.SUBMITTED) {
        onClose();
      }
    } catch (error) {
      console.error('Fehler beim Aktualisieren des Status:', error);
      setValidationErrors(['Fehler beim Aktualisieren des Status']);
    } finally {
      setIsUpdating(false);
    }
  };

  const handleDownloadLexofficeData = () => {
    try {
      const lexofficeData = prepareLexofficeData(ustva);
      const dataStr = JSON.stringify(lexofficeData, null, 2);
      const dataBlob = new Blob([dataStr], { type: 'application/json' });
      const url = URL.createObjectURL(dataBlob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `ustva-lexoffice-q${ustva.quarter}-${ustva.year}.json`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Fehler beim Erstellen der Lexoffice-Daten:', error);
    }
  };

  const handleSendToLexoffice = async () => {
    setIsUpdating(true);
    setValidationErrors([]);

    try {
      const errors = validateUStVA(ustva.data);
      if (errors.length > 0) {
        setValidationErrors(errors);
        return;
      }

      const result = await sendUStVAToLexoffice(ustva);

      if (result.success) {
        onStatusUpdate(ustva.id, UStVAStatus.SUBMITTED);
        alert(`UStVA erfolgreich übermittelt!\nReferenz: ${result.reference || 'N/A'}`);
        onClose();
      } else {
        setValidationErrors([result.message]);
      }
    } catch (error) {
      console.error('Fehler beim Senden an Lexoffice:', error);
      setValidationErrors(['Fehler beim Senden an Lexoffice']);
    } finally {
      setIsUpdating(false);
    }
  };

  const formatCurrency = (amount: number) => {
    return new Intl.NumberFormat('de-DE', {
      style: 'currency',
      currency: 'EUR',
    }).format(amount);
  };

  const getStatusBadgeStyle = (status: UStVAStatus) => {
    switch (status) {
      case UStVAStatus.DRAFT:
        return 'bg-gray-100 text-gray-700';
      case UStVAStatus.READY:
        return 'bg-blue-100 text-blue-700';
      case UStVAStatus.SUBMITTED:
        return 'bg-emerald-100 text-emerald-700';
      case UStVAStatus.ACCEPTED:
        return 'bg-green-100 text-green-700';
      case UStVAStatus.REJECTED:
        return 'bg-rose-100 text-rose-700';
      default:
        return 'bg-gray-100 text-gray-700';
    }
  };

  const getStatusText = (status: UStVAStatus) => {
    switch (status) {
      case UStVAStatus.DRAFT:
        return 'Entwurf';
      case UStVAStatus.READY:
        return 'Bereit zur Übermittlung';
      case UStVAStatus.SUBMITTED:
        return 'Übermittelt';
      case UStVAStatus.ACCEPTED:
        return 'Akzeptiert';
      case UStVAStatus.REJECTED:
        return 'Abgelehnt';
      default:
        return status;
    }
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-2xl font-bold text-slate-900">
                Umsatzsteuervoranmeldung Q{ustva.quarter} {ustva.year}
              </h2>
              <p className="text-sm text-slate-500 mt-1">
                Zeitraum: {ustva.data.period.startDate.toLocaleDateString('de-DE')} - {ustva.data.period.endDate.toLocaleDateString('de-DE')}
              </p>
            </div>
            <div className="flex items-center space-x-3">
              <span className={`rounded-full px-3 py-1 text-sm font-semibold ${getStatusBadgeStyle(ustva.status)}`}>
                {getStatusText(ustva.status)}
              </span>
              <button
                onClick={onClose}
                className="text-slate-400 hover:text-slate-600"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>

          {validationErrors.length > 0 && (
            <div className="rounded-md bg-rose-50 p-4 mb-6">
              <h3 className="text-sm font-medium text-rose-800 mb-2">Validierungsfehler:</h3>
              <ul className="list-disc list-inside text-sm text-rose-700 space-y-1">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
            {/* Umsätze */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Umsätze</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Umsatzsteuerpflichtige Umsätze (81)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.umsatzsteuerpflichtigeUmsaetze)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Innergemeinschaftliche Lieferungen (41)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.umsaetzeInnergemeinschaftlicheLieferungen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Steuerfreie Umsätze (43)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.steuerfreieUmsaetze)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Steuerfreie Umsätze §13b (53)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.steuerfreieUmsaetze13b)}</span>
                </div>
              </div>
            </div>

            {/* Vorsteuer */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Vorsteuer</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Vorsteuerbetrag (66)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.vorsteuerbetrag)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Vorsteuer aus Investitionen (67)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.vorsteuerAusInvestitionen)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Abziehbare Vorsteuer</span>
                  <span className="font-medium">{formatCurrency(ustva.data.abziehbareVorsteuer)}</span>
                </div>
              </div>
            </div>

            {/* Berechnung */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Steuerberechnung</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Umsatzsteuer (19%)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.umsatzsteuer)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Steuerermaessigung (62)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.steuerermaessigung)}</span>
                </div>
                <div className="border-t border-slate-300 pt-2">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-900">Zahllast</span>
                    <span className={`font-bold ${ustva.data.zahllast >= 0 ? 'text-red-600' : 'text-green-600'}`}>
                      {formatCurrency(ustva.data.zahllast)}
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Sonstiges */}
            <div className="bg-slate-50 rounded-lg p-4">
              <h3 className="text-lg font-semibold text-slate-900 mb-4">Sonstiges</h3>
              <div className="space-y-3">
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Sonstige Betriebsausgaben (68)</span>
                  <span className="font-medium">{formatCurrency(ustva.data.sonstigeBetriebsausgaben)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-sm text-slate-600">Transaktionen im Quartal</span>
                  <span className="font-medium">{ustva.data.transactions.length}</span>
                </div>
              </div>
            </div>
          </div>

          {/* Transaktionen Übersicht */}
          <div className="bg-slate-50 rounded-lg p-4 mb-6">
            <h3 className="text-lg font-semibold text-slate-900 mb-4">Transaktionen im Zeitraum</h3>
            <div className="max-h-48 overflow-y-auto">
              <div className="space-y-2">
                {ustva.data.transactions.slice(0, 10).map((transaction, index) => (
                  <div key={transaction.id} className="flex justify-between text-sm">
                    <span className="text-slate-600 truncate">
                      {transaction.date.toLocaleDateString('de-DE')} - {transaction.description}
                    </span>
                    <span className={`font-medium ${transaction.amount >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(transaction.amount)}
                    </span>
                  </div>
                ))}
                {ustva.data.transactions.length > 10 && (
                  <p className="text-sm text-slate-500 text-center py-2">
                    ... und {ustva.data.transactions.length - 10} weitere Transaktionen
                  </p>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-between pt-4 border-t border-slate-200">
            <div className="flex space-x-3">
              {ustva.status === UStVAStatus.DRAFT && (
                <button
                  onClick={() => handleStatusUpdate(UStVAStatus.READY)}
                  disabled={isUpdating}
                  className="rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {isUpdating ? 'Aktualisiere...' : 'Als bereit markieren'}
                </button>
              )}
              {ustva.status === UStVAStatus.READY && (
                <button
                  onClick={handleSendToLexoffice}
                  disabled={isUpdating}
                  className="rounded-md bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:ring-offset-2 disabled:opacity-50"
                >
                  {isUpdating ? 'Übermittle...' : 'An Lexoffice senden'}
                </button>
              )}
              <button
                onClick={handleDownloadLexofficeData}
                className="rounded-md bg-slate-600 px-4 py-2 text-sm font-medium text-white hover:bg-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
              >
                Lexoffice-Daten herunterladen
              </button>
            </div>
            <button
              onClick={onClose}
              className="rounded-md bg-white px-4 py-2 text-sm font-medium text-slate-700 border border-slate-300 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-500 focus:ring-offset-2"
            >
              Schließen
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UStVADetailModal;