import { AccountingTransaction, InvoiceType, UStVA, UStVAQuarterData, UStVAStatus } from '../types';

// Mock storage for UStVA data (in a real app, this would be a database)
let ustvaStorage: UStVA[] = [];

// Helper function to get quarter date range
const getQuarterDateRange = (year: number, quarter: number): { startDate: Date; endDate: Date } => {
  const startMonth = (quarter - 1) * 3;
  const endMonth = startMonth + 2;

  const startDate = new Date(year, startMonth, 1);
  const endDate = new Date(year, endMonth + 1, 0); // Last day of the end month

  return { startDate, endDate };
};

// Helper function to filter transactions for a specific quarter
const filterTransactionsForQuarter = (
  transactions: AccountingTransaction[],
  year: number,
  quarter: number
): AccountingTransaction[] => {
  const { startDate, endDate } = getQuarterDateRange(year, quarter);

  return transactions.filter(transaction => {
    const transactionDate = new Date(transaction.date);
    return transactionDate >= startDate && transactionDate <= endDate;
  });
};

// Calculate UStVA data for a quarter
export const calculateUStVAForQuarter = (
  year: number,
  quarter: number,
  transactions: AccountingTransaction[]
): UStVAQuarterData => {
  const quarterTransactions = filterTransactionsForQuarter(transactions, year, quarter);
  const { startDate, endDate } = getQuarterDateRange(year, quarter);

  // Initialize calculation variables
  let umsatzsteuerpflichtigeUmsaetze = 0; // Feld 81 - Taxable turnover
  let umsaetzeInnergemeinschaftlicheLieferungen = 0; // Feld 41 - Intra-community supplies
  let steuerfreieUmsaetze = 0; // Feld 43 - Tax-free turnover
  let steuerfreieUmsaetze13b = 0; // Feld 53 - Tax-free turnover §13b
  let vorsteuerbetrag = 0; // Feld 66 - Input tax
  let vorsteuerAusInvestitionen = 0; // Feld 67 - Input tax from investments
  let steuerermaessigung = 0; // Feld 62 - Tax reduction
  let sonstigeBetriebsausgaben = 0; // Feld 68 - Other operating expenses

  // Process each transaction
  quarterTransactions.forEach(transaction => {
    const amount = Math.abs(transaction.amount); // Use absolute value for calculations

    if (transaction.invoiceType === InvoiceType.OUTGOING) {
      // Outgoing transactions (sales/revenue)
      if (transaction.taxCategory.includes('USt') || transaction.taxCategory.includes('19%')) {
        // Taxable sales at 19%
        umsatzsteuerpflichtigeUmsaetze += amount;
      } else if (transaction.taxCategory.includes('innergemeinschaftlich') ||
                 transaction.taxCategory.includes('EU') ||
                 transaction.taxCategory.includes('Intra')) {
        // Intra-community supplies
        umsaetzeInnergemeinschaftlicheLieferungen += amount;
      } else if (transaction.taxCategory.includes('steuerfrei') ||
                 transaction.taxCategory.includes('export') ||
                 transaction.taxCategory.includes('Ausfuhr')) {
        // Tax-free turnover
        steuerfreieUmsaetze += amount;
      } else {
        // Default to taxable if category is unclear
        umsatzsteuerpflichtigeUmsaetze += amount;
      }
    } else {
      // Incoming transactions (purchases/expenses)
      if (transaction.taxCategory.includes('Vorsteuer') ||
          transaction.taxCategory.includes('USt') ||
          transaction.taxCategory.includes('19%')) {
        // Input tax
        vorsteuerbetrag += amount * 0.19; // Assume 19% VAT rate
      } else if (transaction.taxCategory.includes('Investition') ||
                 transaction.taxCategory.includes('Anlage')) {
        // Input tax from investments
        vorsteuerAusInvestitionen += amount * 0.19;
      }
    }
  });

  // Calculate VAT amounts
  const umsatzsteuer = umsatzsteuerpflichtigeUmsaetze * 0.19; // 19% VAT on taxable turnover
  const abziehbareVorsteuer = vorsteuerbetrag + vorsteuerAusInvestitionen;
  const zahllast = umsatzsteuer - abziehbareVorsteuer;

  return {
    umsatzsteuerpflichtigeUmsaetze: Math.round(umsatzsteuerpflichtigeUmsaetze * 100) / 100,
    umsaetzeInnergemeinschaftlicheLieferungen: Math.round(umsaetzeInnergemeinschaftlicheLieferungen * 100) / 100,
    steuerfreieUmsaetze: Math.round(steuerfreieUmsaetze * 100) / 100,
    steuerfreieUmsaetze13b: Math.round(steuerfreieUmsaetze13b * 100) / 100,
    vorsteuerbetrag: Math.round(vorsteuerbetrag * 100) / 100,
    vorsteuerAusInvestitionen: Math.round(vorsteuerAusInvestitionen * 100) / 100,
    umsatzsteuer: Math.round(umsatzsteuer * 100) / 100,
    abziehbareVorsteuer: Math.round(abziehbareVorsteuer * 100) / 100,
    zahllast: Math.round(zahllast * 100) / 100,
    steuerermaessigung: Math.round(steuerermaessigung * 100) / 100,
    sonstigeBetriebsausgaben: Math.round(sonstigeBetriebsausgaben * 100) / 100,
    transactions: quarterTransactions,
    period: {
      year,
      quarter,
      startDate,
      endDate,
    },
  };
};

// Create a new UStVA
export const createUStVA = (
  year: number,
  quarter: number,
  transactions: AccountingTransaction[]
): UStVA => {
  const data = calculateUStVAForQuarter(year, quarter, transactions);
  const now = new Date();

  const ustva: UStVA = {
    id: `ustva-${year}-q${quarter}-${Date.now()}`,
    year,
    quarter,
    status: UStVAStatus.DRAFT,
    data,
    createdAt: now,
    updatedAt: now,
  };

  ustvaStorage.push(ustva);
  return ustva;
};

// Get a UStVA by ID
export const getUStVA = (id: string): UStVA | null => {
  return ustvaStorage.find(ustva => ustva.id === id) || null;
};

// Get all UStVAs
export const getUStVAs = (): UStVA[] => {
  return [...ustvaStorage];
};

// Get UStVA for a specific quarter
export const getUStVAForQuarter = (year: number, quarter: number): UStVA | null => {
  return ustvaStorage.find(ustva => ustva.year === year && ustva.quarter === quarter) || null;
};

// Update UStVA status
export const updateUStVAStatus = (id: string, status: UStVAStatus): boolean => {
  const ustva = ustvaStorage.find(u => u.id === id);
  if (!ustva) return false;

  ustva.status = status;
  ustva.updatedAt = new Date();

  if (status === UStVAStatus.SUBMITTED) {
    ustva.submittedAt = new Date();
  }

  return true;
};

// Validate UStVA data
export const validateUStVA = (data: UStVAQuarterData): string[] => {
  const errors: string[] = [];

  // Check for negative amounts where they shouldn't be
  if (data.umsatzsteuerpflichtigeUmsaetze < 0) {
    errors.push('Umsatzsteuerpflichtige Umsätze können nicht negativ sein');
  }

  if (data.vorsteuerbetrag < 0) {
    errors.push('Vorsteuerbetrag kann nicht negativ sein');
  }

  // Check if calculated VAT matches expected calculation
  const expectedUmsatzsteuer = data.umsatzsteuerpflichtigeUmsaetze * 0.19;
  if (Math.abs(data.umsatzsteuer - expectedUmsatzsteuer) > 0.01) {
    errors.push('Berechnete Umsatzsteuer stimmt nicht mit den Umsätzen überein');
  }

  // Check if deductible input tax matches sum
  const expectedAbziehbareVorsteuer = data.vorsteuerbetrag + data.vorsteuerAusInvestitionen;
  if (Math.abs(data.abziehbareVorsteuer - expectedAbziehbareVorsteuer) > 0.01) {
    errors.push('Abziehbare Vorsteuer stimmt nicht mit der Summe überein');
  }

  // Check if tax liability calculation is correct
  const expectedZahllast = data.umsatzsteuer - data.abziehbareVorsteuer;
  if (Math.abs(data.zahllast - expectedZahllast) > 0.01) {
    errors.push('Zahllast-Berechnung ist fehlerhaft');
  }

  return errors;
};

// Prepare data for Lexoffice submission
export const prepareLexofficeData = (ustva: UStVA): any => {
  // This is a simplified Lexoffice UStVA data structure
  // In a real implementation, this would follow the official Lexoffice Tax Reporting API
  return {
    taxDeclaration: {
      type: 'UStVA',
      period: {
        year: ustva.year,
        quarter: ustva.quarter,
        startDate: ustva.data.period.startDate.toISOString().split('T')[0],
        endDate: ustva.data.period.endDate.toISOString().split('T')[0],
      },
      fields: {
        // Umsätze
        '81': ustva.data.umsatzsteuerpflichtigeUmsaetze, // Umsatzsteuerpflichtige Umsätze
        '41': ustva.data.umsaetzeInnergemeinschaftlicheLieferungen, // Innergemeinschaftliche Lieferungen
        '43': ustva.data.steuerfreieUmsaetze, // Steuerfreie Umsätze
        '53': ustva.data.steuerfreieUmsaetze13b, // Steuerfreie Umsätze §13b

        // Vorsteuer
        '66': ustva.data.vorsteuerbetrag, // Vorsteuerbetrag
        '67': ustva.data.vorsteuerAusInvestitionen, // Vorsteuer aus Investitionen

        // Sonstiges
        '62': ustva.data.steuerermaessigung, // Steuerermaessigung
        '68': ustva.data.sonstigeBetriebsausgaben, // Sonstige Betriebsausgaben
      },
      calculations: {
        umsatzsteuer: ustva.data.umsatzsteuer,
        abziehbareVorsteuer: ustva.data.abziehbareVorsteuer,
        zahllast: ustva.data.zahllast,
      },
    },
    metadata: {
      createdAt: ustva.createdAt.toISOString(),
      source: 'Steuersoftware',
      transactionCount: ustva.data.transactions.length,
    },
  };
};

// Send UStVA to Lexoffice (simulation)
export const sendUStVAToLexoffice = async (ustva: UStVA, apiKey?: string): Promise<{ success: boolean; message: string; reference?: string }> => {
  // Simulate API call delay
  await new Promise(resolve => setTimeout(resolve, 1000));

  // In a real implementation, this would make an actual API call to Lexoffice
  // For now, we'll simulate success/failure
  const isSuccess = Math.random() > 0.1; // 90% success rate for simulation

  if (isSuccess) {
    const reference = `LEX-UStVA-${ustva.year}-Q${ustva.quarter}-${Date.now()}`;
    return {
      success: true,
      message: 'UStVA erfolgreich an Lexoffice übermittelt',
      reference,
    };
  } else {
    return {
      success: false,
      message: 'Übermittlung an Lexoffice fehlgeschlagen. Bitte versuchen Sie es später erneut.',
    };
  }
};

// Delete a UStVA (for testing/admin purposes)
export const deleteUStVA = (id: string): boolean => {
  const index = ustvaStorage.findIndex(ustva => ustva.id === id);
  if (index === -1) return false;

  ustvaStorage.splice(index, 1);
  return true;
};

// Clear all UStVAs (for testing)
export const clearAllUStVAs = (): void => {
  ustvaStorage = [];
};