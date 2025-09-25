import React, { useMemo } from 'react';
import { AccountingTransaction, Document, InvoiceType, TransactionStatus } from '../types';

type Section = 'income' | 'expense';

interface ReportItemConfig {
  id: string;
  label: string;
  eurPos?: string;
  keywords?: string[];
  exact?: string[];
  fallback?: boolean;
}

interface ReportBlockConfig {
  id: string;
  section: Section;
  title: string;
  order: number;
  description?: string;
  items: ReportItemConfig[];
}

interface CategoryAggregate {
  label: string;
  amount: number;
}

interface ReportItemResult {
  id: string;
  label: string;
  eurPos?: string;
  amount: number;
  categories: CategoryAggregate[];
}

interface ReportBlockResult {
  id: string;
  title: string;
  section: Section;
  order: number;
  description?: string;
  total: number;
  items: ReportItemResult[];
}

const REPORT_BLOCKS: ReportBlockConfig[] = [
  {
    id: 'income-total',
    section: 'income',
    title: 'Betriebseinnahmen gesamt',
    order: 10,
    items: [
      {
        id: 'income-other',
        label: 'Sonstige Einnahmen',
        eurPos: '113',
        keywords: ['sonstige', 'vermiet', 'verpacht'],
      },
      {
        id: 'income-licence',
        label: 'Patent- und Lizenzrechte',
        eurPos: '118',
        keywords: ['lizenz', 'patent'],
      },
      {
        id: 'income-invest',
        label: 'Investitionszulagen (steuerfrei)',
        eurPos: '150',
        keywords: ['zulage', 'förderung', 'investitions'],
      },
      {
        id: 'income-vat-prepay',
        label: 'Umsatzsteuer-Vorauszahlungen',
        eurPos: '141',
        keywords: ['vorauszahl'],
      },
      {
        id: 'income-vat',
        label: 'Vereinnahmte Umsatzsteuer',
        eurPos: '140',
        keywords: ['umsatzsteuer', 'ust', 'mwst'],
      },
      {
        id: 'income-core',
        label: 'Einnahmen (Kernumsätze)',
        eurPos: '112',
        keywords: ['einnahmen', 'honorar', 'gage', 'photovoltaik', 'einspeise', 'stromverkauf', 'verkauf', 'dienstleistung'],
      },
      {
        id: 'income-fallback',
        label: 'Weitere Betriebseinnahmen',
        fallback: true,
      },
    ],
  },
  {
    id: 'expense-material',
    section: 'expense',
    title: 'Material/Waren',
    order: 20,
    items: [
      {
        id: 'expense-material-core',
        label: 'Material & Waren',
        eurPos: '310',
        keywords: ['material/waren', 'materialeinsatz', 'wareneinsatz', 'warenaufwand', 'warenkosten'],
      },
    ],
  },
  {
    id: 'expense-services',
    section: 'expense',
    title: 'Dienstleistungen',
    order: 30,
    items: [
      {
        id: 'expense-services-core',
        label: 'Externe Dienstleistungen',
        eurPos: '320',
        keywords: ['dienstleister', 'dienstleistung', 'freelancer', 'subunternehmer', 'fremdleistungen'],
      },
    ],
  },
  {
    id: 'expense-personnel',
    section: 'expense',
    title: 'Personal',
    order: 40,
    items: [
      {
        id: 'expense-personnel-wages',
        label: 'Löhne & Gehälter',
        eurPos: '330',
        keywords: ['löhne', 'gehälter'],
      },
      {
        id: 'expense-personnel-social',
        label: 'Sozialabgaben & Abgaben',
        eurPos: '331',
        keywords: ['sozialabgaben', 'berufsgenossenschaft', 'steuer auf sonstige bezüge', 'pauschale steuer'],
      },
      {
        id: 'expense-personnel-fallback',
        label: 'Weitere Personalkosten',
        fallback: true,
      },
    ],
  },
  {
    id: 'expense-premises',
    section: 'expense',
    title: 'Raumkosten',
    order: 50,
    items: [
      {
        id: 'expense-premises-rent',
        label: 'Miete & Raumkosten',
        eurPos: '340',
        keywords: ['raumkosten', 'miete/pacht', 'miete ', 'pacht', 'räume'],
      },
      {
        id: 'expense-premises-utilities',
        label: 'Nebenkosten (Strom/Wasser/Gas)',
        eurPos: '341',
        keywords: ['strom, wasser, gas', 'stromkosten', 'energiekosten'],
      },
      {
        id: 'expense-premises-maintenance',
        label: 'Renovierung & Instandhaltung',
        eurPos: '342',
        keywords: ['renovierung', 'instandhaltung'],
      },
      {
        id: 'expense-premises-fallback',
        label: 'Weitere Raumkosten',
        fallback: true,
      },
    ],
  },
  {
    id: 'expense-telecom',
    section: 'expense',
    title: 'Telekommunikation',
    order: 60,
    items: [
      {
        id: 'expense-telecom-core',
        label: 'Telefon & Internet',
        eurPos: '350',
        keywords: ['telekommunikation', 'festnetz', 'mobil', 'internet'],
      },
    ],
  },
  {
    id: 'expense-travel',
    section: 'expense',
    title: 'Reisen',
    order: 70,
    items: [
      {
        id: 'expense-travel-core',
        label: 'Reise- & Fahrtkosten',
        eurPos: '360',
        keywords: ['reise', 'fahrtkosten', 'fahrkosten', 'übernachtung', 'verpflegungsmehraufwand', 'reisekosten'],
      },
    ],
  },
  {
    id: 'expense-consulting',
    section: 'expense',
    title: 'Beratung & Recht',
    order: 80,
    items: [
      {
        id: 'expense-consulting-core',
        label: 'Rechts- & Beratungsleistungen',
        eurPos: '370',
        keywords: ['rechtsanwalt', 'beratung', 'buchführungskosten', 'steuerberatung'],
      },
    ],
  },
  {
    id: 'expense-insurance',
    section: 'expense',
    title: 'Versicherungen (betrieblich)',
    order: 90,
    items: [
      {
        id: 'expense-insurance-core',
        label: 'Versicherungsbeiträge',
        eurPos: '380',
        keywords: ['versicherung', 'haftpflicht'],
      },
    ],
  },
  {
    id: 'expense-marketing',
    section: 'expense',
    title: 'Werbung & Marketing',
    order: 100,
    items: [
      {
        id: 'expense-marketing-core',
        label: 'Werbung & Sponsoring',
        eurPos: '390',
        keywords: ['werbung', 'marketing', 'sponsoring', 'dekoration', 'messe'],
      },
    ],
  },
  {
    id: 'expense-interest',
    section: 'expense',
    title: 'Zinsen & Gebühren',
    order: 110,
    items: [
      {
        id: 'expense-interest-core',
        label: 'Finanzierungskosten',
        eurPos: '400',
        keywords: ['zinsen', 'gebühr', 'kontoführung', 'kartengebühr', 'bank'],
      },
    ],
  },
  {
    id: 'expense-vat',
    section: 'expense',
    title: 'Geleistete Vorsteuer',
    order: 120,
    items: [
      {
        id: 'expense-vat-core',
        label: 'Vorsteuer',
        eurPos: '410',
        keywords: ['vorsteuer'],
      },
    ],
  },
  {
    id: 'expense-vat-prepay',
    section: 'expense',
    title: 'Umsatzsteuer-Vorauszahlungen',
    order: 130,
    items: [
      {
        id: 'expense-vat-prepay-core',
        label: 'Umsatzsteuer-Vorauszahlungen',
        eurPos: '420',
        keywords: ['umsatzsteuer-vorauszahlung', 'ust-vorauszahlung'],
      },
    ],
  },
  {
    id: 'expense-limited',
    section: 'expense',
    title: 'Beschränkt abziehbare Betriebsausgaben',
    order: 140,
    items: [
      {
        id: 'expense-limited-core',
        label: 'Bewirtung & Geschenke',
        eurPos: '430',
        keywords: ['bewirtung', 'geschenke', 'mahlzeit', 'verpflegung'],
      },
    ],
  },
  {
    id: 'expense-vehicle',
    section: 'expense',
    title: 'Fahrzeugkosten',
    order: 150,
    items: [
      {
        id: 'expense-vehicle-core',
        label: 'Fahrzeug & Mobilität',
        eurPos: '440',
        keywords: ['fahrzeug', 'kraftstoff', 'tank', 'ladestrom', 'fahrzeugpflege', 'werkstatt', 'leasing'],
      },
    ],
  },
  {
    id: 'expense-repairs',
    section: 'expense',
    title: 'Reparaturen & Wartung',
    order: 160,
    items: [
      {
        id: 'expense-repairs-core',
        label: 'Reparaturen & Instandhaltung',
        eurPos: '450',
        keywords: ['reparatur', 'wartung', 'anlagen und maschinen', 'instandhaltung'],
      },
    ],
  },
  {
    id: 'expense-other',
    section: 'expense',
    title: 'Sonstige Ausgaben',
    order: 170,
    items: [
      {
        id: 'expense-other-general',
        label: 'Sonstige betriebliche Aufwendungen',
        eurPos: '460',
        keywords: ['sonstige ausgaben', 'diverse'],
      },
      {
        id: 'expense-other-office',
        label: 'Büro & Porto',
        eurPos: '461',
        keywords: ['bürobedarf', 'porto', 'papier'],
      },
      {
        id: 'expense-other-licenses',
        label: 'Lizenzen & Konzessionen',
        eurPos: '462',
        keywords: ['lizenz', 'konzession'],
      },
      {
        id: 'expense-other-software',
        label: 'Wartung & Software',
        eurPos: '463',
        keywords: ['software', 'it-dienstleistung'],
      },
      {
        id: 'expense-other-packaging',
        label: 'Verpackungsmaterial',
        eurPos: '464',
        keywords: ['verpackung'],
      },
      {
        id: 'expense-other-reminder',
        label: 'Mahngebühren & Bankkosten',
        eurPos: '465',
        keywords: ['mahn', 'kontoauszug', 'bankgebühr'],
      },
      {
        id: 'expense-other-meetings',
        label: 'Betriebliche Besprechungen',
        eurPos: '466',
        keywords: ['besprechungen'],
      },
      {
        id: 'expense-other-equipment',
        label: 'Anschaffungen & Equipment',
        eurPos: '467',
        keywords: ['anschaffung', 'werkzeug', 'geräte', 'kleingeräte', 'equipment'],
      },
      {
        id: 'expense-other-fallback',
        label: 'Weitere sonstige Ausgaben',
        fallback: true,
      },
    ],
  },
];

const normalize = (value: string) => value.trim().toLowerCase();

const matchesItem = (item: ReportItemConfig, normalizedCategory: string) => {
  if (item.exact?.some(entry => normalizedCategory === entry)) {
    return true;
  }
  if (item.keywords?.some(keyword => normalizedCategory.includes(keyword))) {
    return true;
  }
  return false;
};

const currencyFormatter = new Intl.NumberFormat('de-DE', {
  style: 'currency',
  currency: 'EUR',
  maximumFractionDigits: 2,
});

const percentageFormatter = new Intl.NumberFormat('de-DE', {
  style: 'percent',
  maximumFractionDigits: 0,
});

interface IncomeStatementViewProps {
  transactions: AccountingTransaction[];
  documents: Document[];
}

const IncomeStatementView: React.FC<IncomeStatementViewProps> = ({ transactions, documents }) => {
  const statement = useMemo(() => {
    const sectionMaps: Record<Section, Map<string, CategoryAggregate>> = {
      income: new Map(),
      expense: new Map(),
    };

    transactions.forEach(transaction => {
      const section: Section = transaction.invoiceType === InvoiceType.OUTGOING ? 'income' : 'expense';
      const rawLabel = transaction.taxCategory?.trim() || (section === 'income' ? 'Unkategorisierte Einnahmen' : 'Unkategorisierte Ausgaben');
      const key = normalize(rawLabel);
      const amount = Math.abs(transaction.amount);
      const existing = sectionMaps[section].get(key);
      if (existing) {
        existing.amount += amount;
      } else {
        sectionMaps[section].set(key, { label: rawLabel, amount });
      }
    });

    const consumed: Record<Section, Set<string>> = {
      income: new Set(),
      expense: new Set(),
    };

    const sortedBlocks = [...REPORT_BLOCKS].sort((a, b) => a.order - b.order);

    const blocks: ReportBlockResult[] = sortedBlocks.map(block => {
      const items: ReportItemResult[] = block.items.map(item => {
        if (item.fallback) {
          const entries = Array.from(sectionMaps[block.section].entries())
            .filter(([key]) => !consumed[block.section].has(key))
            .map(([key, aggregate]) => ({ key, ...aggregate }));
          entries.forEach(entry => consumed[block.section].add(entry.key));
          const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
          return {
            id: item.id,
            label: item.label,
            eurPos: item.eurPos,
            amount,
            categories: entries.map(entry => ({ label: entry.label, amount: entry.amount })),
          };
        }

        const entries = Array.from(sectionMaps[block.section].entries())
          .filter(([key, aggregate]) => !consumed[block.section].has(key) && matchesItem(item, key))
          .map(([key, aggregate]) => ({ key, ...aggregate }));

        entries.forEach(entry => consumed[block.section].add(entry.key));
        const amount = entries.reduce((sum, entry) => sum + entry.amount, 0);
        return {
          id: item.id,
          label: item.label,
          eurPos: item.eurPos,
          amount,
          categories: entries.map(entry => ({ label: entry.label, amount: entry.amount })),
        };
      });

      const total = items.reduce((sum, item) => sum + item.amount, 0);
      return {
        id: block.id,
        title: block.title,
        section: block.section,
        order: block.order,
        description: block.description,
        total,
        items,
      };
    });

    const totals = blocks.reduce(
      (acc, block) => {
        if (block.section === 'income') {
          acc.income += block.total;
        } else {
          acc.expense += block.total;
        }
        return acc;
      },
      { income: 0, expense: 0 }
    );

    const difference = totals.income - totals.expense;

    const remainingIncome = Array.from(sectionMaps.income.entries())
      .filter(([key]) => !consumed.income.has(key))
      .map(([, aggregate]) => aggregate);

    const remainingExpense = Array.from(sectionMaps.expense.entries())
      .filter(([key]) => !consumed.expense.has(key))
      .map(([, aggregate]) => aggregate);

    return {
      blocks,
      totals: { ...totals, difference },
      warnings: {
        income: remainingIncome,
        expense: remainingExpense,
      },
    };
  }, [transactions]);

  const totalTransactions = transactions.length;
  const transactionsWithReceipts = transactions.filter(tx => tx.documentId).length;
  const missingReceipts = transactions.filter(tx => tx.status === TransactionStatus.MISSING_RECEIPT).length;
  const coverageRatio = totalTransactions > 0 ? transactionsWithReceipts / totalTransactions : 0;
  const linkedDocuments = documents.filter(doc => doc.linkedTransactionIds?.length).length;

  const incomeBlocks = statement.blocks.filter(block => block.section === 'income');
  const expenseBlocks = statement.blocks
    .filter(block => block.section === 'expense' && block.total > 0)
    .sort((a, b) => a.order - b.order);

  return (
    <div className="space-y-8">
      <header className="space-y-2">
        <h1 className="text-3xl font-bold text-slate-900">Einnahmen-Überschuss-Rechnung</h1>
        <p className="text-sm text-slate-500 max-w-4xl">
          Die Werte werden automatisch aus allen verbuchten Transaktionen ermittelt. Jede Kategorie fasst die zugehörigen
          Buchungen zusammen und zeigt auf Wunsch die zugrunde liegenden Steuerkategorien an.
        </p>
      </header>

      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gesamteinnahmen</p>
          <p className="mt-2 text-2xl font-semibold text-emerald-600">{currencyFormatter.format(statement.totals.income)}</p>
          <p className="mt-1 text-xs text-slate-500">Summe aller Ausgangsrechnungen und sonstigen Einnahmen.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Gesamtausgaben</p>
          <p className="mt-2 text-2xl font-semibold text-rose-600">{currencyFormatter.format(statement.totals.expense)}</p>
          <p className="mt-1 text-xs text-slate-500">Operative Aufwendungen inklusive Vorsteuer.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Ergebnis</p>
          <p
            className={`mt-2 text-2xl font-semibold ${statement.totals.difference >= 0 ? 'text-emerald-600' : 'text-rose-600'}`}
          >
            {currencyFormatter.format(statement.totals.difference)}
          </p>
          <p className="mt-1 text-xs text-slate-500">Differenz zwischen Einnahmen und Ausgaben.</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">Belegabdeckung</p>
          <p className="mt-2 text-2xl font-semibold text-slate-900">{percentageFormatter.format(coverageRatio)}</p>
          <p className="mt-1 text-xs text-slate-500">
            {transactionsWithReceipts} von {totalTransactions} Buchungen mit Beleg · {missingReceipts} offen · {linkedDocuments} verknüpfte
            Dokumente
          </p>
        </div>
      </section>

      {transactions.length === 0 ? (
        <section className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 text-slate-500">
          <h2 className="text-lg font-semibold text-slate-700">Noch keine Buchungen vorhanden</h2>
          <p className="mt-2 text-sm">
            Sobald Transaktionen erfasst oder aus Lexoffice importiert wurden, sehen Sie hier automatisch die EÜR-Übersicht.
          </p>
        </section>
      ) : (
        <>
          {incomeBlocks.map(block => (
            <section key={block.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-slate-100 pb-4">
                <div>
                  <h2 className="text-lg font-semibold text-slate-900">{block.title}</h2>
                  {block.description && <p className="text-sm text-slate-500">{block.description}</p>}
                </div>
                <div className="text-right">
                  <p className="text-xs uppercase text-slate-400">Summe</p>
                  <p className="text-lg font-semibold text-slate-900">{currencyFormatter.format(block.total)}</p>
                </div>
              </div>
              <ul className="mt-4 space-y-3">
                {block.items.filter(item => item.amount > 0).map(item => (
                  <li key={item.id} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0">
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{item.label}</p>
                      {item.categories.length > 0 && (
                        <ul className="mt-1 space-y-1 text-xs text-slate-500">
                          {item.categories.map(category => (
                            <li key={category.label} className="flex justify-between gap-6">
                              <span>{category.label}</span>
                              <span>{currencyFormatter.format(category.amount)}</span>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                    <div className="text-right">
                      {item.eurPos && <p className="text-[10px] uppercase tracking-wide text-slate-400">EÜR-Pos. {item.eurPos}</p>}
                      <p className="text-sm font-semibold text-slate-900">{currencyFormatter.format(item.amount)}</p>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}

          <section className="space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">Betriebsausgaben nach Gruppen</h2>
            {expenseBlocks.length === 0 ? (
              <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
                Noch keine Ausgaben kategorisiert.
              </div>
            ) : (
              <div className="grid gap-4 lg:grid-cols-2">
                {expenseBlocks.map(block => (
                  <section key={block.id} className="rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
                    <div className="flex items-start justify-between gap-2 border-b border-slate-100 pb-3">
                      <div>
                        <h3 className="text-base font-semibold text-slate-900">{block.title}</h3>
                        {block.description && <p className="text-xs text-slate-500">{block.description}</p>}
                      </div>
                      <div className="text-right">
                        <p className="text-[10px] uppercase text-slate-400">Summe</p>
                        <p className="text-sm font-semibold text-slate-900">{currencyFormatter.format(block.total)}</p>
                      </div>
                    </div>
                    <ul className="mt-4 space-y-3">
                      {block.items.filter(item => item.amount > 0).map(item => (
                        <li key={item.id} className="flex items-start justify-between gap-4 border-b border-slate-100 pb-3 last:border-b-0">
                          <div>
                            <p className="text-sm font-medium text-slate-800">{item.label}</p>
                            {item.categories.length > 0 && (
                              <ul className="mt-1 space-y-1 text-xs text-slate-500">
                                {item.categories.map(category => (
                                  <li key={category.label} className="flex justify-between gap-6">
                                    <span>{category.label}</span>
                                    <span>{currencyFormatter.format(category.amount)}</span>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </div>
                          <div className="text-right">
                            {item.eurPos && (
                              <p className="text-[10px] uppercase tracking-wide text-slate-400">EÜR-Pos. {item.eurPos}</p>
                            )}
                            <p className="text-sm font-semibold text-slate-900">{currencyFormatter.format(item.amount)}</p>
                          </div>
                        </li>
                      ))}
                    </ul>
                  </section>
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {(statement.warnings.income.length > 0 || statement.warnings.expense.length > 0) && (
        <section className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-800">
          <h2 className="text-base font-semibold text-amber-900">Hinweis</h2>
          <p className="mt-2">
            Einige Kategorien konnten keiner bekannten EÜR-Gruppe zugeordnet werden. Bitte prüfen Sie die Bezeichnungen in den
            Transaktionen oder ergänzen Sie die Zuordnungsregeln.
          </p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {statement.warnings.income.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600">Einnahmen</p>
                <ul className="mt-1 space-y-1">
                  {statement.warnings.income.map(category => (
                    <li key={category.label} className="flex justify-between">
                      <span>{category.label}</span>
                      <span>{currencyFormatter.format(category.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {statement.warnings.expense.length > 0 && (
              <div>
                <p className="text-xs uppercase tracking-wide text-amber-600">Ausgaben</p>
                <ul className="mt-1 space-y-1">
                  {statement.warnings.expense.map(category => (
                    <li key={category.label} className="flex justify-between">
                      <span>{category.label}</span>
                      <span>{currencyFormatter.format(category.amount)}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        </section>
      )}
    </div>
  );
};

export default IncomeStatementView;
