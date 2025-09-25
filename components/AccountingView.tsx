import React, { useMemo, useState } from 'react';
import {
  AccountingTransaction,
  Document,
  InvoiceType,
  TransactionStatus,
  TransactionSource,
  StorageLocation,
  TaskItem,
  TaskStatus,
  DEFAULT_DIGITAL_STORAGE_ID,
} from '../types';
import { PlusIcon } from './icons/PlusIcon';
import PencilIcon from './icons/PencilIcon';
import TrashIcon from './icons/TrashIcon';
import AlertTriangleIcon from './icons/AlertTriangleIcon';
import CheckCircleIcon from './icons/CheckCircleIcon';
import FolderIcon from './icons/FolderIcon';
import ChevronDownIcon from './icons/ChevronDownIcon';
import SearchIcon from './icons/SearchIcon';

interface AccountingViewProps {
  transactions: AccountingTransaction[];
  setTransactions: React.Dispatch<React.SetStateAction<AccountingTransaction[]>>;
  documents: Document[];
  setDocuments: React.Dispatch<React.SetStateAction<Document[]>>;
  storageLocations: StorageLocation[];
  onSelectDocument: (document: Document) => void;
  tasks: TaskItem[];
}

interface TransactionFormState {
  id: string;
  date: string;
  description: string;
  amount: number;
  invoiceType: InvoiceType;
  taxCategory: string;
  documentId?: string;
  notes?: string;
  status: TransactionStatus;
  source: TransactionSource;
  createdAt: Date;
  updatedAt: Date;
}

type StatusFilter = TransactionStatus | 'all';
type TypeFilter = InvoiceType | 'all';

type SortKey = 'date' | 'amount' | 'taxCategory';

type SortDirection = 'asc' | 'desc';

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value);

const formatDate = (date: Date | string) => {
  const d = typeof date === 'string' ? new Date(date) : date;
  return new Intl.DateTimeFormat('de-DE').format(d);
};

const generateTransactionId = () => `txn-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

const sourceLabels: Record<TransactionSource, string> = {
  [TransactionSource.MANUAL]: 'Manuell',
  [TransactionSource.LEXOFFICE]: 'Lexoffice',
  [TransactionSource.AI]: 'KI-Assistent',
};

const statusBadgeStyle: Record<TransactionStatus, { label: string; className: string; icon: React.ReactNode }> = {
  [TransactionStatus.COMPLETE]: {
    label: 'Beleg verknüpft',
    className: 'bg-green-100 text-green-800',
    icon: <CheckCircleIcon className="w-4 h-4 mr-1" />,
  },
  [TransactionStatus.MISSING_RECEIPT]: {
    label: 'Beleg fehlt',
    className: 'bg-amber-100 text-amber-800',
    icon: <AlertTriangleIcon className="w-4 h-4 mr-1" />,
  },
  [TransactionStatus.DRAFT]: {
    label: 'Entwurf',
    className: 'bg-slate-100 text-slate-700',
    icon: <FolderIcon className="w-4 h-4 mr-1" />,
  },
};

const prepareFormState = (transaction?: AccountingTransaction): TransactionFormState => {
  const baseDate = transaction?.date ?? new Date();
  return {
    id: transaction?.id ?? generateTransactionId(),
    date: new Date(baseDate).toISOString().split('T')[0],
    description: transaction?.description ?? '',
    amount: transaction?.amount ?? 0,
    invoiceType: transaction?.invoiceType ?? InvoiceType.INCOMING,
    taxCategory: transaction?.taxCategory ?? 'Sonstiges',
    documentId: transaction?.documentId,
    notes: transaction?.notes,
    status:
      transaction?.status ?? (transaction?.documentId ? TransactionStatus.COMPLETE : TransactionStatus.MISSING_RECEIPT),
    source: transaction?.source ?? TransactionSource.MANUAL,
    createdAt: transaction?.createdAt ?? new Date(),
    updatedAt: transaction?.updatedAt ?? new Date(),
  };
};

const toTransaction = (state: TransactionFormState): AccountingTransaction => ({
  id: state.id,
  date: new Date(state.date),
  description: state.description.trim(),
  amount: Number(state.amount),
  invoiceType: state.invoiceType,
  taxCategory: state.taxCategory.trim() || 'Sonstiges',
  documentId: state.documentId || undefined,
  status: state.documentId ? TransactionStatus.COMPLETE : TransactionStatus.MISSING_RECEIPT,
  source: state.source,
  notes: state.notes?.trim() || undefined,
  createdAt: state.createdAt,
  updatedAt: new Date(),
});

const AccountingView: React.FC<AccountingViewProps> = ({
  transactions,
  setTransactions,
  documents,
  setDocuments,
  storageLocations,
  onSelectDocument,
  tasks,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<TypeFilter>('all');
  const [taxCategoryFilter, setTaxCategoryFilter] = useState<string>('all');
  const [sortKey, setSortKey] = useState<SortKey>('date');
  const [sortDirection, setSortDirection] = useState<SortDirection>('desc');
  const [formState, setFormState] = useState<TransactionFormState | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const isEditing = formState ? transactions.some(tx => tx.id === formState.id) : false;

  const taxCategories = useMemo(() => {
    const set = new Set<string>();
    transactions.forEach(tx => tx.taxCategory && set.add(tx.taxCategory));
    documents.forEach(doc => doc.taxCategory && set.add(doc.taxCategory));
    return Array.from(set).sort();
  }, [transactions, documents]);

  const summary = useMemo(() => {
    let income = 0;
    let expenses = 0;
    let missing = 0;

    transactions.forEach(tx => {
      if (tx.invoiceType === InvoiceType.OUTGOING) {
        income += tx.amount;
      } else {
        expenses += tx.amount;
      }
      if (tx.status === TransactionStatus.MISSING_RECEIPT) {
        missing += 1;
      }
    });

  const openTasks = tasks.filter(task => task.status !== TaskStatus.DONE).length;

    return {
      income,
      expenses,
      missing,
      openTasks,
    };
  }, [transactions, tasks]);

  const filteredTransactions = useMemo(() => {
    const searchLower = searchTerm.trim().toLowerCase();
    return [...transactions]
      .filter(tx => {
        if (statusFilter !== 'all' && tx.status !== statusFilter) return false;
        if (typeFilter !== 'all' && tx.invoiceType !== typeFilter) return false;
        if (taxCategoryFilter !== 'all' && tx.taxCategory !== taxCategoryFilter) return false;
        if (!searchLower) return true;
        const doc = tx.documentId ? documents.find(d => d.id === tx.documentId) : undefined;
        return [
          tx.description,
          tx.taxCategory,
          formatCurrency(tx.amount),
          doc?.name,
          doc?.vendor,
        ]
          .filter(Boolean)
          .some(value => value!.toString().toLowerCase().includes(searchLower));
      })
      .sort((a, b) => {
        const direction = sortDirection === 'asc' ? 1 : -1;
        switch (sortKey) {
          case 'amount':
            return (a.amount - b.amount) * direction;
          case 'taxCategory':
            return a.taxCategory.localeCompare(b.taxCategory) * direction;
          case 'date':
          default:
            return (a.date.getTime() - b.date.getTime()) * direction;
        }
      });
  }, [transactions, statusFilter, typeFilter, taxCategoryFilter, searchTerm, documents, sortKey, sortDirection]);

  const handleOpenNew = () => {
    setFormState(prepareFormState());
    setIsModalOpen(true);
    setFormError(null);
  };

  const handleEdit = (transaction: AccountingTransaction) => {
    setFormState(prepareFormState(transaction));
    setIsModalOpen(true);
    setFormError(null);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setFormState(null);
    setFormError(null);
  };

  const handleChange = <K extends keyof TransactionFormState>(key: K, value: TransactionFormState[K]) => {
    if (!formState) return;
    setFormState({ ...formState, [key]: value });
  };

  const handleSave = () => {
    if (!formState) return;

    if (!formState.description.trim()) {
      setFormError('Bitte geben Sie eine aussagekräftige Beschreibung an.');
      return;
    }

    if (!formState.date) {
      setFormError('Bitte wählen Sie ein Buchungsdatum.');
      return;
    }

    if (!Number.isFinite(formState.amount) || formState.amount === 0) {
      setFormError('Der Betrag darf nicht 0 sein.');
      return;
    }

    if (!formState.taxCategory.trim()) {
      setFormError('Bitte geben Sie eine Steuerkategorie an.');
      return;
    }

    const transaction = toTransaction(formState);

    setTransactions(prev => {
      const exists = prev.some(tx => tx.id === transaction.id);
      const next = exists
        ? prev.map(tx => (tx.id === transaction.id ? transaction : tx))
        : [transaction, ...prev];

      return [...next].sort((a, b) => b.date.getTime() - a.date.getTime());
    });

    if (transaction.documentId) {
      const defaultStorage = storageLocations.find(loc => loc.isDefault)?.id ?? DEFAULT_DIGITAL_STORAGE_ID;
      setDocuments(prevDocs =>
        prevDocs.map(doc => {
          if (doc.id !== transaction.documentId) return doc;
          if (doc.storageLocationId) return doc;
          return {
            ...doc,
            storageLocationId: defaultStorage,
          };
        })
      );
    }

    handleCloseModal();
  };

  const handleDelete = (transaction: AccountingTransaction) => {
    if (!window.confirm('Transaktion wirklich löschen?')) return;
    setTransactions(prev => prev.filter(tx => tx.id !== transaction.id));
    handleCloseModal();
  };

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDirection(prev => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDirection('desc');
    }
  };

  const renderSortIcon = (key: SortKey) => {
    if (sortKey !== key) return <ChevronDownIcon className="w-4 h-4 text-slate-400" />;
    return (
      <ChevronDownIcon
        className={`w-4 h-4 text-slate-500 transition-transform ${sortDirection === 'asc' ? 'transform rotate-180' : ''}`}
      />
    );
  };

  return (
    <div className="space-y-8">
      <section className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Gesamteinnahmen</p>
          <p className="mt-1 text-2xl font-semibold text-green-600">{formatCurrency(summary.income)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Gesamtausgaben</p>
          <p className="mt-1 text-2xl font-semibold text-red-600">{formatCurrency(summary.expenses)}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Belege fehlen</p>
          <p className="mt-1 text-2xl font-semibold text-amber-600">{summary.missing}</p>
        </div>
        <div className="bg-white rounded-xl p-4 border border-slate-200 shadow-sm">
          <p className="text-sm text-slate-500">Offene Aufgaben</p>
          <p className="mt-1 text-2xl font-semibold text-blue-600">{summary.openTasks}</p>
        </div>
      </section>

      <section className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 sm:p-6 space-y-4">
        <div className="flex flex-col lg:flex-row gap-3 lg:items-center lg:justify-between">
          <div className="relative w-full lg:w-64">
            <div className="absolute inset-y-0 left-0 flex items-center pl-3 pointer-events-none">
              <SearchIcon className="w-4 h-4 text-slate-400" />
            </div>
            <input
              type="text"
              value={searchTerm}
              onChange={event => setSearchTerm(event.target.value)}
              placeholder="Transaktionen durchsuchen..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg bg-slate-50 focus:bg-white focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <select
              value={typeFilter}
              onChange={event => setTypeFilter(event.target.value as TypeFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Typen</option>
              <option value={InvoiceType.OUTGOING}>Einnahmen</option>
              <option value={InvoiceType.INCOMING}>Ausgaben</option>
            </select>
            <select
              value={statusFilter}
              onChange={event => setStatusFilter(event.target.value as StatusFilter)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Status</option>
              <option value={TransactionStatus.COMPLETE}>Beleg verknüpft</option>
              <option value={TransactionStatus.MISSING_RECEIPT}>Beleg fehlt</option>
              <option value={TransactionStatus.DRAFT}>Entwurf</option>
            </select>
            <select
              value={taxCategoryFilter}
              onChange={event => setTaxCategoryFilter(event.target.value)}
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm bg-slate-50 focus:bg-white"
            >
              <option value="all">Alle Kategorien</option>
              {taxCategories.map(category => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
            <button
              onClick={handleOpenNew}
              className="inline-flex items-center justify-center bg-blue-600 text-white font-semibold px-4 py-2 rounded-lg hover:bg-blue-700 transition"
            >
              <PlusIcon className="w-4 h-4 mr-2" />
              Transaktion hinzufügen
            </button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-slate-200">
            <thead className="bg-slate-50">
              <tr>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('date')}>
                  Datum
                  <span className="inline-flex ml-1 align-middle">{renderSortIcon('date')}</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Beschreibung</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('amount')}>
                  Betrag
                  <span className="inline-flex ml-1 align-middle">{renderSortIcon('amount')}</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider cursor-pointer" onClick={() => toggleSort('taxCategory')}>
                  Steuerkategorie
                  <span className="inline-flex ml-1 align-middle">{renderSortIcon('taxCategory')}</span>
                </th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Typ</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Beleg</th>
                <th className="px-4 py-3 text-left text-xs font-semibold text-slate-600 uppercase tracking-wider">Status</th>
                <th className="px-4 py-3 text-right text-xs font-semibold text-slate-600 uppercase tracking-wider">Aktionen</th>
              </tr>
            </thead>
            <tbody className="bg-white divide-y divide-slate-200">
              {filteredTransactions.map(transaction => {
                const relatedDocument = transaction.documentId
                  ? documents.find(doc => doc.id === transaction.documentId)
                  : undefined;
                const badge = statusBadgeStyle[transaction.status];

                return (
                  <tr key={transaction.id} className="hover:bg-slate-50">
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{formatDate(transaction.date)}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 max-w-xs">
                      <div className="font-medium text-slate-800 truncate">{transaction.description}</div>
                      <div className="text-xs text-slate-500">Quelle: {sourceLabels[transaction.source]}</div>
                    </td>
                    <td className={`px-4 py-3 text-sm font-semibold whitespace-nowrap ${transaction.invoiceType === InvoiceType.OUTGOING ? 'text-green-600' : 'text-red-600'}`}>
                      {formatCurrency(transaction.amount)}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">{transaction.taxCategory}</td>
                    <td className="px-4 py-3 text-sm text-slate-700 whitespace-nowrap">
                      {transaction.invoiceType === InvoiceType.OUTGOING ? 'Einnahme' : 'Ausgabe'}
                    </td>
                    <td className="px-4 py-3 text-sm text-slate-700">
                      {relatedDocument ? (
                        <button
                          onClick={() => onSelectDocument(relatedDocument)}
                          className="text-blue-600 hover:text-blue-700 font-medium"
                        >
                          {relatedDocument.name}
                        </button>
                      ) : (
                        <span className="inline-flex items-center text-amber-600 text-sm">
                          <AlertTriangleIcon className="w-4 h-4 mr-1" />
                          fehlt
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <span className={`inline-flex items-center px-2 py-1 rounded-full text-xs font-semibold ${badge.className}`}>
                        {badge.icon}
                        {badge.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm text-right space-x-2 whitespace-nowrap">
                      <button
                        onClick={() => handleEdit(transaction)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg bg-slate-100 text-slate-700 hover:bg-slate-200"
                      >
                        <PencilIcon className="w-4 h-4 mr-1" />
                        Bearbeiten
                      </button>
                      <button
                        onClick={() => handleDelete(transaction)}
                        className="inline-flex items-center px-3 py-1.5 text-sm font-semibold rounded-lg bg-red-50 text-red-600 hover:bg-red-100"
                      >
                        <TrashIcon className="w-4 h-4 mr-1" />
                        Löschen
                      </button>
                    </td>
                  </tr>
                );
              })}
              {filteredTransactions.length === 0 && (
                <tr>
                  <td colSpan={8} className="px-4 py-6 text-center text-sm text-slate-500">
                    Keine Transaktionen gefunden.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      {isModalOpen && formState && (
        <div className="fixed inset-0 z-40 flex items-center justify-center bg-black bg-opacity-50 p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-slate-800 flex items-center">
                {isEditing ? 'Transaktion bearbeiten' : 'Neue Transaktion'}
              </h2>
              <button onClick={handleCloseModal} className="text-slate-500 hover:text-slate-700">
                ✕
              </button>
            </div>
            <div className="px-6 py-6 space-y-4 max-h-[70vh] overflow-y-auto">
              {formError && (
                <div className="p-3 rounded-md bg-red-50 text-red-700 text-sm border border-red-200">
                  {formError}
                </div>
              )}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-slate-600">Datum</label>
                  <input
                    type="date"
                    value={formState.date}
                    onChange={event => handleChange('date', event.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Betrag</label>
                  <input
                    type="number"
                    step="0.01"
                    value={formState.amount}
                    onChange={event => handleChange('amount', Number(event.target.value))}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600">Beschreibung</label>
                  <input
                    type="text"
                    value={formState.description}
                    onChange={event => handleChange('description', event.target.value)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Typ</label>
                  <select
                    value={formState.invoiceType}
                    onChange={event => handleChange('invoiceType', event.target.value as InvoiceType)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value={InvoiceType.OUTGOING}>Einnahme</option>
                    <option value={InvoiceType.INCOMING}>Ausgabe</option>
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Steuerkategorie</label>
                  <input
                    type="text"
                    value={formState.taxCategory}
                    onChange={event => handleChange('taxCategory', event.target.value)}
                    list="transaction-tax-categories"
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                  <datalist id="transaction-tax-categories">
                    {taxCategories.map(category => (
                      <option key={category} value={category} />
                    ))}
                  </datalist>
                </div>
                <div>
                  <label className="block text-sm font-medium text-slate-600">Beleg verknüpfen</label>
                  <select
                    value={formState.documentId || ''}
                    onChange={event => handleChange('documentId', event.target.value || undefined)}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  >
                    <option value="">Kein Beleg verknüpft</option>
                    {documents.map(doc => (
                      <option key={doc.id} value={doc.id}>
                        {doc.name}
                      </option>
                    ))}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="block text-sm font-medium text-slate-600">Notiz</label>
                  <textarea
                    value={formState.notes || ''}
                    onChange={event => handleChange('notes', event.target.value)}
                    rows={3}
                    className="mt-1 w-full border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>
            </div>
            <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex justify-between items-center">
              <div className="text-xs text-slate-500">
                Erstellt am {formatDate(formState.createdAt)} · Zuletzt aktualisiert am {formatDate(formState.updatedAt)}
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={handleCloseModal}
                  className="px-4 py-2 text-sm font-medium text-slate-600 bg-white border border-slate-300 rounded-lg hover:bg-slate-100"
                >
                  Abbrechen
                </button>
                {isEditing && (
                  <button
                    onClick={() => handleDelete(toTransaction(formState))}
                    className="px-4 py-2 text-sm font-medium text-red-600 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100"
                  >
                    Löschen
                  </button>
                )}
                <button
                  onClick={handleSave}
                  className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700"
                >
                  Speichern
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default AccountingView;
