import React, { useState, useEffect } from 'react';
import { AccountingTransaction, UStVA, UStVAStatus } from '../types';
import { createUStVA, getUStVAs, updateUStVAStatus, validateUStVA } from '../services/ustvaService';
import UStVADetailModal from './UStVADetailModal';

interface TaxFilingsViewProps {
  upcomingSubmissions: { title: string; dueDate: Date; status: 'open' | 'submitted' | 'overdue' }[];
  transactions: AccountingTransaction[];
}

const TaxFilingsView: React.FC<TaxFilingsViewProps> = ({ upcomingSubmissions, transactions }) => {
  const [ustvas, setUstvas] = useState<UStVA[]>([]);
  const [selectedYear, setSelectedYear] = useState<number>(new Date().getFullYear());
  const [selectedQuarter, setSelectedQuarter] = useState<number>(Math.floor(new Date().getMonth() / 3) + 1);
  const [isCreating, setIsCreating] = useState(false);
  const [selectedUStVA, setSelectedUStVA] = useState<UStVA | null>(null);
  const [validationErrors, setValidationErrors] = useState<string[]>([]);

  useEffect(() => {
    loadUStVAs();
  }, []);

  const loadUStVAs = () => {
    const loadedUstvas = getUStVAs();
    setUstvas(loadedUstvas);
  };

  const handleCreateUStVA = async () => {
    setIsCreating(true);
    setValidationErrors([]);

    try {
      const newUStVA = createUStVA(selectedYear, selectedQuarter, transactions);
      const errors = validateUStVA(newUStVA.data);

      if (errors.length > 0) {
        setValidationErrors(errors);
      } else {
        loadUStVAs();
      }
    } catch (error) {
      console.error('Fehler beim Erstellen der UStVA:', error);
      setValidationErrors(['Fehler beim Erstellen der UStVA']);
    } finally {
      setIsCreating(false);
    }
  };

  const handleViewUStVA = (ustva: UStVA) => {
    setSelectedUStVA(ustva);
  };

  const handleCloseModal = () => {
    setSelectedUStVA(null);
  };

  const handleStatusUpdate = (ustvaId: string, status: UStVAStatus) => {
    updateUStVAStatus(ustvaId, status);
    loadUStVAs();
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
        return 'Bereit';
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

  const existingUStVA = ustvas.find(u => u.year === selectedYear && u.quarter === selectedQuarter);

  return (
    <div className="space-y-6">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Steuerliche Meldungen</h1>
        <p className="text-sm text-slate-500 max-w-3xl">
          Behalten Sie Umsatzsteuervoranmeldungen, Zusammenfassende Meldungen und weitere Fristen im Blick.
          Erstellen Sie UStVA-Voranmeldungen für einzelne Quartale und verfolgen Sie deren Status.
        </p>
      </header>

      {/* UStVA Creation Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-lg font-semibold text-slate-900 mb-4">Umsatzsteuervoranmeldung erstellen</h2>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Jahr</label>
            <select
              value={selectedYear}
              onChange={(e) => setSelectedYear(parseInt(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              {Array.from({ length: 5 }, (_, i) => new Date().getFullYear() - 2 + i).map(year => (
                <option key={year} value={year}>{year}</option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Quartal</label>
            <select
              value={selectedQuarter}
              onChange={(e) => setSelectedQuarter(parseInt(e.target.value))}
              className="w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-blue-500 focus:outline-none focus:ring-1 focus:ring-blue-500"
            >
              <option value={1}>Q1 (Jan-Mar)</option>
              <option value={2}>Q2 (Apr-Jun)</option>
              <option value={3}>Q3 (Jul-Sep)</option>
              <option value={4}>Q4 (Okt-Dez)</option>
            </select>
          </div>

          <div className="flex items-end">
            <button
              onClick={handleCreateUStVA}
              disabled={isCreating || !!existingUStVA}
              className="w-full rounded-md bg-blue-600 px-4 py-2 text-sm font-medium text-white hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isCreating ? 'Erstelle...' : existingUStVA ? 'Bereits vorhanden' : 'UStVA erstellen'}
            </button>
          </div>
        </div>

        {validationErrors.length > 0 && (
          <div className="rounded-md bg-rose-50 p-4 mb-4">
            <h3 className="text-sm font-medium text-rose-800 mb-2">Validierungsfehler:</h3>
            <ul className="list-disc list-inside text-sm text-rose-700 space-y-1">
              {validationErrors.map((error, index) => (
                <li key={index}>{error}</li>
              ))}
            </ul>
          </div>
        )}

        {existingUStVA && (
          <div className="rounded-md bg-blue-50 p-4">
            <div className="flex items-center justify-between">
              <div>
                <h3 className="text-sm font-medium text-blue-800">
                  UStVA Q{existingUStVA.quarter} {existingUStVA.year}
                </h3>
                <p className="text-sm text-blue-700 mt-1">
                  Zahllast: €{existingUStVA.data.zahllast.toFixed(2)}
                </p>
              </div>
              <div className="flex items-center space-x-2">
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeStyle(existingUStVA.status)}`}>
                  {getStatusText(existingUStVA.status)}
                </span>
                <button
                  onClick={() => handleViewUStVA(existingUStVA)}
                  className="rounded-md bg-slate-600 px-3 py-1 text-xs font-medium text-white hover:bg-slate-700"
                >
                  Details anzeigen
                </button>
                {existingUStVA.status === UStVAStatus.DRAFT && (
                  <button
                    onClick={() => handleStatusUpdate(existingUStVA.id, UStVAStatus.READY)}
                    className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700"
                  >
                    Als bereit markieren
                  </button>
                )}
                {existingUStVA.status === UStVAStatus.READY && (
                  <button
                    onClick={() => handleStatusUpdate(existingUStVA.id, UStVAStatus.SUBMITTED)}
                    className="rounded-md bg-emerald-600 px-3 py-1 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    An Lexoffice senden
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </section>

      {/* Existing UStVAs Section */}
      {ustvas.length > 0 && (
        <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500 mb-3">Erstellte UStVA-Voranmeldungen</h2>
          <div className="space-y-3">
            {ustvas
              .sort((a, b) => {
                if (a.year !== b.year) return b.year - a.year;
                return b.quarter - a.quarter;
              })
              .map(ustva => (
                <div key={ustva.id} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                  <div>
                    <p className="font-medium text-slate-800">
                      UStVA Q{ustva.quarter} {ustva.year}
                    </p>
                    <p className="text-sm text-slate-500">
                      Zahllast: €{ustva.data.zahllast.toFixed(2)} •
                      Erstellt: {ustva.createdAt.toLocaleDateString('de-DE')}
                      {ustva.submittedAt && ` • Übermittelt: ${ustva.submittedAt.toLocaleDateString('de-DE')}`}
                    </p>
                  </div>
                  <div className="flex items-center space-x-3">
                    <span className={`rounded-full px-3 py-1 text-xs font-semibold ${getStatusBadgeStyle(ustva.status)}`}>
                      {getStatusText(ustva.status)}
                    </span>
                    <button
                      onClick={() => handleViewUStVA(ustva)}
                      className="rounded px-2 py-1 text-xs bg-slate-100 text-slate-700 hover:bg-slate-200"
                    >
                      Details
                    </button>
                    <div className="flex space-x-1">
                      {ustva.status === UStVAStatus.DRAFT && (
                        <button
                          onClick={() => handleStatusUpdate(ustva.id, UStVAStatus.READY)}
                          className="rounded px-2 py-1 text-xs bg-green-100 text-green-700 hover:bg-green-200"
                        >
                          Bereit
                        </button>
                      )}
                      {ustva.status === UStVAStatus.READY && (
                        <button
                          onClick={() => handleStatusUpdate(ustva.id, UStVAStatus.SUBMITTED)}
                          className="rounded px-2 py-1 text-xs bg-emerald-100 text-emerald-700 hover:bg-emerald-200"
                        >
                          An Lexoffice senden
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
          </div>
        </section>
      )}

      {/* Upcoming Submissions Section */}
      <section className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-slate-500">Anstehende Meldungen</h2>
        <div className="mt-3 divide-y divide-slate-200">
          {upcomingSubmissions.length === 0 && (
            <p className="py-4 text-sm text-slate-500">Keine Meldungen geplant. Daten werden bald aus den Buchungen generiert.</p>
          )}
          {upcomingSubmissions.map(submission => {
            const badgeStyle =
              submission.status === 'submitted'
                ? 'bg-emerald-100 text-emerald-700'
                : submission.status === 'overdue'
                ? 'bg-rose-100 text-rose-700'
                : 'bg-amber-100 text-amber-700';

            return (
              <div key={submission.title} className="flex items-center justify-between py-3 text-sm">
                <div>
                  <p className="font-medium text-slate-800">{submission.title}</p>
                  <p className="text-xs text-slate-500">Fällig am {submission.dueDate.toLocaleDateString('de-DE')}</p>
                </div>
                <span className={`rounded-full px-3 py-1 text-xs font-semibold ${badgeStyle}`}>
                  {submission.status === 'submitted'
                    ? 'Übermittelt'
                    : submission.status === 'overdue'
                    ? 'Überfällig'
                    : 'Ausstehend'}
                </span>
              </div>
            );
          })}
        </div>
      </section>

      <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
        <h2 className="text-lg font-semibold text-slate-700">Geplante Features</h2>
        <ul className="mt-3 list-disc space-y-2 pl-5 text-sm">
          <li>Automatische Fristerkennung anhand von Transaktionsdaten und Profilinformationen.</li>
          <li>Direkte Übermittlungsvorbereitung für Lexoffice &amp; weitere Meldesysteme.</li>
          <li>Upload-Funktion für Nachweise, inklusive KI-Validierung der Inhalte.</li>
          <li>Detaillierte UStVA-Ansicht mit allen berechneten Feldern.</li>
          <li>Automatische Erinnerungen vor Fälligkeitsterminen.</li>
        </ul>
      </section>

      {/* UStVA Detail Modal */}
      {selectedUStVA && (
        <UStVADetailModal
          ustva={selectedUStVA}
          onClose={handleCloseModal}
          onStatusUpdate={handleStatusUpdate}
        />
      )}
    </div>
  );
};

export default TaxFilingsView;
