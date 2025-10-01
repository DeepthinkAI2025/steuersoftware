import { AccountingTransaction, Document, DocumentSource, DocumentStatus, InvoiceType, LexofficeImportResult, LexofficeStatus, TransactionSource, TransactionStatus } from '../types';

type DateRange = { start: Date; end: Date };

const META_ENV = ((import.meta as ImportMeta & { env?: Record<string, string | undefined> }).env) ?? {};

// Live-Modus wird aktiviert, wenn explizit per Flag aktiviert ODER automatisch, sobald ein API-Key vorhanden ist.
const ENABLE_LIVE_LEXOFFICE = ((META_ENV.VITE_LEXOFFICE_ENABLE_REAL_API ?? 'false') === 'true') || Boolean((META_ENV.VITE_LEXOFFICE_API_KEY ?? '').trim());
const LEXOFFICE_API_BASE = (META_ENV.VITE_LEXOFFICE_API_BASE ?? 'https://api.lexoffice.io').replace(/\/$/, '');
const LEXOFFICE_PROXY_BASE = (META_ENV.VITE_LEXOFFICE_PROXY_BASE ?? '').replace(/\/$/, '');
const LEXOFFICE_PROXY_PORT = META_ENV.VITE_LEXOFFICE_PROXY_PORT ?? '5174';
const FORCE_RELATIVE_PROXY = (META_ENV.VITE_LEXOFFICE_FORCE_RELATIVE ?? 'false') === 'true';
const DEBUG_LEXOFFICE = (META_ENV.VITE_LEXOFFICE_DEBUG ?? 'false') === 'true';

const resolveProxyBase = () => {
  if (FORCE_RELATIVE_PROXY) {
    return '';
  }
  if (LEXOFFICE_PROXY_BASE) {
    return LEXOFFICE_PROXY_BASE;
  }

  if (typeof window === 'undefined') {
    return '';
  }

  const { protocol, hostname, port } = window.location;

  if (hostname.endsWith('.app.github.dev')) {
    const derivedHost = hostname.replace(/-(\d+)\.app\.github\.dev$/i, (_match, currentPort) => {
      if (!currentPort) return `-${LEXOFFICE_PROXY_PORT}.app.github.dev`;
      if (currentPort === LEXOFFICE_PROXY_PORT) return `-${currentPort}.app.github.dev`;
      return `-${LEXOFFICE_PROXY_PORT}.app.github.dev`;
    });
    return `${protocol}//${derivedHost}`;
  }

  if (hostname === 'localhost' || hostname === '127.0.0.1') {
    return `${protocol}//${hostname}:${LEXOFFICE_PROXY_PORT}`;
  }

  return `${protocol}//${hostname}:${LEXOFFICE_PROXY_PORT}`;
};

let liveModeOverride: boolean | null = null;

export const setLexofficeLiveMode = (enabled: boolean | null) => {
  liveModeOverride = typeof enabled === 'boolean' ? enabled : null;
};

export const getLexofficeLiveMode = () => {
  if (liveModeOverride !== null) {
    return liveModeOverride;
  }
  return ENABLE_LIVE_LEXOFFICE;
};

const toIsoDate = (date: Date) => date.toISOString().split('T')[0];

const mapProxyTransaction = (entry: any): LexofficeTransactionPayload => {
  const invoiceType = entry?.invoiceType === 'outgoing' ? InvoiceType.OUTGOING : InvoiceType.INCOMING;
  return {
    id: entry?.id ?? `lex-${Math.random().toString(36).slice(2, 12)}`,
    description: entry?.description ?? 'Lexoffice Buchung',
    amount: typeof entry?.amount === 'number' ? entry.amount : Number(entry?.amount) || 0,
    date: entry?.date ?? new Date().toISOString(),
    invoiceType,
    taxCategory: entry?.taxCategory ?? 'Unkategorisiert',
    invoiceNumber: entry?.invoiceNumber ?? undefined,
    hasDocument: Boolean(entry?.hasDocument),
    voucherId: entry?.voucherId ?? undefined,
    fileIds: Array.isArray(entry?.fileIds) ? entry.fileIds : undefined,
    vendor: entry?.vendor ?? undefined,
  };
};

const mapProxyDocument = (entry: any): LexofficeDocumentPayload => {
  const invoiceType = entry?.invoiceType === 'outgoing' ? InvoiceType.OUTGOING : InvoiceType.INCOMING;
  return {
    id: entry?.id ?? `lex-doc-${Math.random().toString(36).slice(2, 12)}`,
    transactionExternalId: entry?.transactionExternalId ?? undefined,
    filename: entry?.filename ?? 'Beleg.pdf',
    url: entry?.url ?? entry?.downloadUrl ?? '',
    issuedDate: entry?.issuedDate ?? new Date().toISOString(),
    vendor: entry?.vendor ?? 'Unbekannt',
    totalAmount: typeof entry?.totalAmount === 'number' ? entry.totalAmount : Number(entry?.totalAmount) || 0,
    vatAmount: typeof entry?.vatAmount === 'number' ? entry.vatAmount : undefined,
    taxCategory: entry?.taxCategory ?? undefined,
    invoiceType,
    invoiceNumber: entry?.invoiceNumber ?? undefined,
    file: entry?.file ?? undefined,
  };
};

export interface LexofficeTransactionPayload {
  id: string;
  description: string;
  amount: number;
  date: string;
  invoiceType: InvoiceType;
  taxCategory: string;
  invoiceNumber?: string;
  hasDocument: boolean;
  voucherId?: string;
  fileIds?: string[];
  vendor?: string;
}

export interface LexofficeDocumentPayload {
  id: string;
  transactionExternalId?: string;
  filename: string;
  url: string;
  issuedDate: string;
  vendor: string;
  totalAmount: number;
  vatAmount?: number;
  taxCategory?: string;
  invoiceType: InvoiceType;
  invoiceNumber?: string;
  file?: File;
}

export interface SimulateLexofficeImportOptions {
  dateRange?: DateRange;
  includeDocuments?: boolean;
}

export interface LexofficeImportResponse {
  transactions: LexofficeTransactionPayload[];
  documents?: LexofficeDocumentPayload[];
  summary: LexofficeImportResult['summary'];
  mode: 'live' | 'simulation';
}

export interface SendDocumentsToLexofficeResult {
  successIds: string[];
  failed: Array<{ documentId: string; reason: string }>;
  mode: 'live' | 'simulation';
}

export interface ImportFromLexofficeOptions extends SimulateLexofficeImportOptions {
  apiKey?: string;
}

export interface SendDocumentsToLexofficeOptions {
  documents: Document[];
  apiKey?: string;
  onProgress?: (current: number, total: number, documentId: string) => void;
}

export interface LexofficeContact {
  id?: string;
  name: string;
  email?: string;
  phone?: string;
  role?: 'customer' | 'supplier' | 'both';
  number?: string;
  note?: string;
}

export interface LexofficeVoucher {
  id?: string;
  voucherType: 'purchase' | 'sales';
  voucherDate: string;
  voucherNumber?: string;
  reference?: string;
  totalAmount: {
    totalGrossAmount: number;
    currency: string;
  };
  taxAmounts?: Array<{
    taxType: string;
    taxRatePercent: number;
    amount: number;
  }>;
  lineItems: Array<{
    amount: {
      netAmount: number;
      taxRatePercent: number;
    };
    description: string;
    account?: {
      name: string;
      number?: string;
    };
  }>;
  files?: Array<{ id: string }>;
  customer?: { id?: string; name: string };
  supplier?: { id?: string; name: string };
}

export interface CrudOperationResult {
  success: boolean;
  id?: string;
  error?: string;
  mode: 'live' | 'simulation';
}

const isoDate = (year: number, monthIndex: number, day: number) => new Date(Date.UTC(year, monthIndex, day, 12, 0, 0, 0)).toISOString();

const isWithinRange = (iso: string, range?: DateRange) => {
  if (!range) return true;
  const value = new Date(iso);
  return value >= range.start && value <= range.end;
};


const wait = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

const generateFallbackId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `lex-${Math.random().toString(36).slice(2, 12)}`;
};

const createObjectUrl = (blob: Blob) => {
  if (typeof URL !== 'undefined' && typeof URL.createObjectURL === 'function') {
    return URL.createObjectURL(blob);
  }
  return '';
};

const createFileSafe = (blob: Blob, filename: string, mimeType: string): File => {
  try {
    return new File([blob], filename, { type: mimeType });
  } catch (error) {
    return Object.assign(blob, { name: filename, type: mimeType }) as File;
  }
};

const getEffectiveApiKey = (explicitKey?: string) => {
  const candidate = explicitKey?.trim() || (META_ENV.VITE_LEXOFFICE_API_KEY ?? '').trim();
  return candidate || '';
};

const shouldUseLiveApi = (explicitKey?: string) => {
  const override = liveModeOverride;
  const enabledFlag = override !== null ? override : ENABLE_LIVE_LEXOFFICE;
  return enabledFlag && !!getEffectiveApiKey(explicitKey);
};

const buildHeaders = (apiKey: string, base?: HeadersInit) => {
  const headers = new Headers(base ?? {});
  if (!headers.has('Authorization')) {
    headers.set('Authorization', `Bearer ${apiKey}`);
  }
  if (!headers.has('Accept')) {
    headers.set('Accept', 'application/json');
  }
  return headers;
};

const extractErrorMessage = async (response: Response) => {
  try {
    const data = await response.clone().json();
    if (data?.message) return data.message as string;
    if (Array.isArray(data?.messages) && data.messages.length > 0) {
      return data.messages.join(', ');
    }
    if (typeof data?.error === 'string') return data.error;
  } catch (error) {
    // ignore - fall back to text
  }

  try {
    const text = await response.clone().text();
    if (text) return text;
  } catch (error) {
    // ignore
  }

  return `Lexoffice API Fehler (${response.status})`;
};

const lexofficeFetch = async (path: string, options: RequestInit = {}, apiKey: string) => {
  const url = path.startsWith('http') ? path : `${LEXOFFICE_API_BASE}${path}`;
  const headers = buildHeaders(apiKey, options.headers);
  const finalOptions: RequestInit = { ...options, headers };

  const response = await fetch(url, finalOptions);
  if (!response.ok) {
    throw new Error(await extractErrorMessage(response));
  }
  return response;
};

const normalizeNextPath = (link?: string | null) => {
  if (!link) return null;
  if (link.startsWith('http')) {
    if (link.startsWith(LEXOFFICE_API_BASE)) {
      return link.slice(LEXOFFICE_API_BASE.length);
    }
    return null;
  }
  return link.startsWith('/') ? link : `/${link}`;
};

const resolveDocumentFile = async (document: Document): Promise<File> => {
  if (document.file instanceof File) {
    return document.file;
  }

  if (document.fileUrl) {
    const response = await fetch(document.fileUrl);
    if (!response.ok) {
      throw new Error(`Dateidownload fehlgeschlagen (${response.status})`);
    }
    const blob = await response.blob();
    const filename = document.name || `Beleg-${document.id || Date.now()}`;
    return createFileSafe(blob, filename, blob.type || 'application/octet-stream');
  }

  throw new Error('Für diesen Beleg liegt keine Datei vor.');
};

const uploadFileToLexoffice = async (file: File, apiKey: string) => {
  const formData = new FormData();
  formData.append('file', file, file.name);

  const response = await lexofficeFetch('/v1/files', { method: 'POST', body: formData }, apiKey);
  const payload = await response.json();
  const fileId = payload?.id as string | undefined;
  if (!fileId) {
    throw new Error('Lexoffice hat keine Datei-ID zurückgegeben.');
  }
  return fileId;
};

const calculateTaxRatePercent = (document: Document) => {
  if (typeof document.totalAmount !== 'number' || typeof document.vatAmount !== 'number') {
    return undefined;
  }
  const net = document.totalAmount - document.vatAmount;
  if (net <= 0) return undefined;
  return Math.round((document.vatAmount / net) * 100);
};

const buildVoucherPayload = (document: Document, fileId: string) => {
  const gross = typeof document.totalAmount === 'number' ? document.totalAmount : 0;
  const vat = typeof document.vatAmount === 'number' ? document.vatAmount : 0;
  const net = gross > 0 ? Math.max(gross - vat, 0) : 0;
  const taxRate = calculateTaxRatePercent(document) ?? (vat > 0 ? 19 : 0);

  const invoiceType = document.invoiceType ?? InvoiceType.INCOMING;
  const baseLine: any = {
    amount: {
      netAmount: Number(net.toFixed(2)),
      taxRatePercent: taxRate,
    },
    description: document.name || 'Beleg',
  };

  if (document.taxCategory) {
    baseLine.account = { name: document.taxCategory };
  }

  const payload: any = {
    voucherType: invoiceType === InvoiceType.OUTGOING ? 'sales' : 'purchase',
    voucherDate: toIsoDate(new Date(document.date)),
    reference: document.invoiceNumber || document.name,
    lineItems: [baseLine],
    totalAmount: {
      totalGrossAmount: Number(gross.toFixed(2)),
      currency: 'EUR',
    },
    files: [{ id: fileId }],
  };

  if (vat > 0) {
    payload.taxAmounts = [
      {
        taxType: 'vat',
        taxRatePercent: taxRate,
        amount: Number(vat.toFixed(2)),
      },
    ];
  }

  const counterpartyName = document.vendor || (invoiceType === InvoiceType.OUTGOING ? 'Kunde unbekannt' : 'Lieferant unbekannt');
  if (invoiceType === InvoiceType.OUTGOING) {
    payload.customer = { name: counterpartyName };
  } else {
    payload.supplier = { name: counterpartyName };
  }

  return payload;
};

const createVoucherForDocument = async (document: Document, fileId: string, apiKey: string) => {
  const payload = buildVoucherPayload(document, fileId);
  const response = await lexofficeFetch(
    '/v1/vouchers',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    },
    apiKey,
  );

  const data = await response.json();
  if (!data?.id) {
    throw new Error('Lexoffice hat keine Voucher-ID zurückgegeben.');
  }
  return data;
};

const buildTransactionsPath = (dateRange?: DateRange) => {
  const params = new URLSearchParams();
  if (dateRange) {
    params.set('from', toIsoDate(dateRange.start));
    params.set('to', toIsoDate(dateRange.end));
  }
  params.set('size', '100');
  params.set('sort', 'date,asc');
  return `/v1/transactions?${params.toString()}`;
};

const mapTransactionFromLexoffice = (entry: any): LexofficeTransactionPayload => {
  const rawAmount = typeof entry.amount === 'number'
    ? entry.amount
    : entry.amount?.value ?? entry.amount?.grossTotal ?? entry.amount?.gross ?? entry.amount?.amount ?? 0;

  const direction = (entry.type || entry.direction || '').toString().toLowerCase();
  const invoiceType = direction.includes('income') || direction.includes('credit') || direction.includes('sales')
    ? InvoiceType.OUTGOING
    : direction.includes('expense') || direction.includes('debit') || direction.includes('purchase')
      ? InvoiceType.INCOMING
      : rawAmount >= 0
        ? InvoiceType.OUTGOING
        : InvoiceType.INCOMING;

  const amountValue = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount) || 0;
  const signedAmount = invoiceType === InvoiceType.OUTGOING ? Math.abs(amountValue) : -Math.abs(amountValue);

  const taxCategory = entry.taxCategory?.name
    || entry.account?.name
    || entry.account?.number
    || entry.accountingType
    || entry.vatRate?.description
    || 'Unkategorisiert';

  const vendor = entry.partner?.name
    || entry.supplier?.name
    || entry.customer?.name
    || entry.contact?.name
    || entry.counterpartyName
    || entry.vendorName;

  const hasDocument = Boolean(
    entry.voucherId
    || entry.document?.id
    || (Array.isArray(entry.fileIds) && entry.fileIds.length > 0)
    || (Array.isArray(entry.voucher?.fileIds) && entry.voucher.fileIds.length > 0),
  );

  const fileIds = Array.isArray(entry.fileIds)
    ? entry.fileIds
    : Array.isArray(entry.voucher?.fileIds)
      ? entry.voucher.fileIds
      : undefined;

  return {
    id: entry.id || entry.transactionId || entry.uuid || generateFallbackId(),
    description: entry.description || entry.reference || entry.title || 'Lexoffice Buchung',
    amount: Number.isFinite(signedAmount) ? signedAmount : 0,
    date: entry.date || entry.transactionDate || entry.bookingDate || new Date().toISOString(),
    invoiceType,
    taxCategory,
    invoiceNumber: entry.voucherNumber || entry.documentNumber || entry.referenceNumber,
    hasDocument,
    voucherId: entry.voucherId || entry.voucher?.id,
    fileIds,
    vendor,
  };
};

const fetchTransactionsFromLexofficeLive = async (apiKey: string, dateRange?: DateRange) => {
  const transactions: LexofficeTransactionPayload[] = [];
  let nextPath: string | null = buildTransactionsPath(dateRange);

  while (nextPath) {
    const response = await lexofficeFetch(nextPath, { method: 'GET' }, apiKey);
    const data = await response.json();
    const entries = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.transactions)
        ? data.transactions
        : [];

    entries.forEach(entry => transactions.push(mapTransactionFromLexoffice(entry)));

    const nextLink = normalizeNextPath(data?.links?.next || data?._links?.next?.href || data?.nextLink);
    nextPath = nextLink;
  }

  return transactions;
};

const listVoucherIds = async (apiKey: string, dateRange?: DateRange) => {
  const voucherIds: string[] = [];
  const params = new URLSearchParams();
  if (dateRange) {
    params.set('voucherDateFrom', toIsoDate(dateRange.start));
    params.set('voucherDateTo', toIsoDate(dateRange.end));
  }
  params.set('size', '100');

  let nextPath: string | null = `/v1/vouchers?${params.toString()}`;
  while (nextPath) {
    const response = await lexofficeFetch(nextPath, { method: 'GET' }, apiKey);
    const data = await response.json();
    const entries = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.vouchers)
        ? data.vouchers
        : [];

    entries.forEach((entry: any) => {
      const id = entry?.id || entry?.voucherId;
      if (id) {
        voucherIds.push(id);
      }
    });

    const nextLink = normalizeNextPath(data?.links?.next || data?._links?.next?.href || data?.nextLink);
    nextPath = nextLink;
  }

  return voucherIds;
};

const fetchVoucherDetail = async (voucherId: string, apiKey: string) => {
  const response = await lexofficeFetch(`/v1/vouchers/${voucherId}`, { method: 'GET' }, apiKey);
  return response.json();
};

const downloadFileFromLexoffice = async (fileId: string, apiKey: string) => {
  const response = await lexofficeFetch(`/v1/files/${fileId}/download`, { method: 'GET' }, apiKey);
  const blob = await response.blob();
  const url = URL.createObjectURL(blob);
  return { blob, url };
};

const fetchDocumentsFromLexofficeLive = async (
  apiKey: string,
  transactions: LexofficeTransactionPayload[],
  dateRange?: DateRange,
) => {
  const voucherMap = new Map<string, LexofficeTransactionPayload>();
  transactions.forEach(tx => {
    if (tx.voucherId) {
      voucherMap.set(tx.voucherId, tx);
    }
  });

  if (voucherMap.size === 0 && dateRange) {
    const ids = await listVoucherIds(apiKey, dateRange);
    ids.forEach(id => {
      if (!voucherMap.has(id)) {
        voucherMap.set(id, undefined as unknown as LexofficeTransactionPayload);
      }
    });
  }

  const documents: LexofficeDocumentPayload[] = [];

  for (const [voucherId, transaction] of voucherMap.entries()) {
    try {
      const detail = await fetchVoucherDetail(voucherId, apiKey);
      if (!detail) continue;

      const issuedDate = detail.voucherDate || detail.documentDate || detail.date || new Date().toISOString();
      const vendor = detail.supplier?.name
        || detail.customer?.name
        || detail.contact?.name
        || detail.partner?.name
        || transaction?.vendor
        || '';

      const totalAmount = detail.totalAmount?.totalGrossAmount
        ?? detail.totalAmount?.grossAmount
        ?? detail.totalPrice?.grossAmount
        ?? detail.amount?.gross
        ?? 0;

      const vatAmount = Array.isArray(detail.taxAmounts)
        ? detail.taxAmounts.reduce((sum: number, tax: any) => sum + (Number(tax?.amount) || 0), 0)
        : detail.totalAmount?.taxAmount;

      const invoiceNumber = detail.invoiceNumber || detail.reference || detail.voucherNumber || transaction?.invoiceNumber;
      const taxCategory = detail.lineItems?.[0]?.account?.name
        || detail.lineItems?.[0]?.account?.number
        || detail.lineItems?.[0]?.accountingType
        || transaction?.taxCategory;

      const attachments = Array.isArray(detail.files) && detail.files.length > 0
        ? detail.files
        : Array.isArray(detail.fileMetaData)
          ? detail.fileMetaData
          : Array.isArray(detail.attachments)
            ? detail.attachments
            : Array.isArray(detail.fileIds)
              ? detail.fileIds.map((id: string) => ({ id }))
              : [];

      for (const attachment of attachments) {
        const fileId = attachment?.id || attachment?.fileId || (typeof attachment === 'string' ? attachment : null);
        if (!fileId) continue;

        const { blob, url } = await downloadFileFromLexoffice(fileId, apiKey);
        const mimeType = attachment?.contentType || blob.type || 'application/pdf';
        let filename = attachment?.filename || attachment?.name || attachment?.originalFilename || `${voucherId}.pdf`;
        if (!filename.includes('.')) {
          const extension = mimeType.split('/').pop() || 'pdf';
          filename = `${filename}.${extension}`;
        }
        const file = new File([blob], filename, { type: mimeType });

        documents.push({
          id: fileId,
          transactionExternalId: transaction?.id,
          filename,
          url,
          issuedDate,
          vendor: vendor || 'Unbekannt',
          totalAmount: Number(totalAmount) || 0,
          vatAmount: typeof vatAmount === 'number' ? vatAmount : undefined,
          taxCategory: taxCategory || undefined,
          invoiceType: transaction?.invoiceType
            ?? (detail.voucherType === 'sales' ? InvoiceType.OUTGOING : InvoiceType.INCOMING),
          invoiceNumber,
          file,
        });
      }
    } catch (error) {
      console.warn('Lexoffice Voucher konnte nicht verarbeitet werden:', error);
    }
  }

  return documents;
};


export const importFromLexoffice = async ({ apiKey, dateRange, includeDocuments = true }: ImportFromLexofficeOptions = {}) => {
  const useLive = shouldUseLiveApi(apiKey);
  if (!useLive) {
    throw new Error('Kein Lexoffice API-Schlüssel vorhanden oder ungültig.');
  }

  const effectiveKey = getEffectiveApiKey(apiKey);
    if (!effectiveKey) throw new Error('Kein Lexoffice API-Schlüssel vorhanden.');

  try {
    const proxyBase = resolveProxyBase();
    const query = new URLSearchParams();
    if (dateRange) {
      query.set('start', toIsoDate(dateRange.start));
      query.set('end', toIsoDate(dateRange.end));
    }
    query.set('includeDocuments', includeDocuments ? 'true' : 'false');
    const attemptBases = Array.from(new Set([
      proxyBase,
      // Fallback: relative URL (Vite Dev Proxy)
      '',
    ]));

    let payload: any = null;
    let lastError: Error | null = null;

    if (DEBUG_LEXOFFICE) {
      console.log('[LexofficeImport] Starte Fetch Versuche', { attemptBases, query: query.toString(), includeDocuments });
    }

    for (const base of attemptBases) {
      const url = `${base}/api/lexoffice/import?${query.toString()}`.replace(/([^:])\/+/g, '$1/');
      const headers: HeadersInit = { Accept: 'application/json' };
      if ((META_ENV.VITE_LEXOFFICE_PROXY_SKIP_KEY ?? 'false') !== 'true') {
        headers['x-lexoffice-api-key'] = effectiveKey;
      }
      try {
        const response = await fetch(url, { method: 'GET', headers, credentials: 'include' });
        if (!response.ok) {
          const text = await response.text();
          // 404 -> nächsten Versuch probieren, falls weiterer Base vorhanden
          if (response.status === 404 && base !== attemptBases[attemptBases.length - 1]) {
            lastError = new Error(text || `404 ${url}`);
            if (DEBUG_LEXOFFICE) {
              console.warn('[LexofficeImport] 404 Versuch – fallback', { url });
            }
            continue;
          }
          throw new Error(text || `Lexoffice Proxy Fehler (${response.status})`);
        }
        payload = await response.json();
        if (DEBUG_LEXOFFICE) {
          console.log('[LexofficeImport] Antwort erhalten', { url, transactions: payload?.transactions?.length, documents: payload?.documents?.length });
        }
        lastError = null;
        break;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        if (DEBUG_LEXOFFICE) {
          console.error('[LexofficeImport] Fetch Fehler', { base, error: lastError.message });
        }
        continue;
      }
    }

      if (!payload) {
        throw new Error('Lexoffice Proxy nicht erreichbar. Bitte starten Sie den Proxy-Server (npm run server) oder prüfen Sie die Proxy-URL.');
      }

    const transactions = Array.isArray(payload?.transactions) ? payload.transactions.map(mapProxyTransaction) : [];
    const documents = includeDocuments && Array.isArray(payload?.documents) ? payload.documents.map(mapProxyDocument) : undefined;
    const summary: LexofficeImportResult['summary'] = payload?.summary ?? {
      imported: transactions.length,
      updated: 0,
      skipped: 0,
      missingReceipts: transactions.filter(tx => !tx.hasDocument).length,
    };

  const result = { transactions, documents, summary, mode: 'live' as const } satisfies LexofficeImportResponse;
    if (DEBUG_LEXOFFICE) {
      console.log('[LexofficeImport] Ergebnis normalisiert', { mode: result.mode, tCount: result.transactions.length, dCount: result.documents?.length });
    }
    return result;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('Failed to fetch')) {
      throw new Error('Lexoffice Proxy nicht erreichbar. Bitte starten Sie den Proxy-Server (npm run server) oder prüfen Sie die Proxy-URL.');
    }
    throw error instanceof Error ? error : new Error(message);
  }

};

export const sendDocumentsToLexoffice = async ({ documents, apiKey, onProgress }: SendDocumentsToLexofficeOptions): Promise<SendDocumentsToLexofficeResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Kein Lexoffice Live Modus aktiviert.');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    throw new Error('Kein Lexoffice API-Schlüssel vorhanden.');
  }

  const successIds: string[] = [];
  const failed: Array<{ documentId: string; reason: string }> = [];
  const total = documents.length;

  for (let index = 0; index < total; index += 1) {
    const document = documents[index];
    onProgress?.(index, total, document.id);
    try {
      const file = await resolveDocumentFile(document);
      const fileId = await uploadFileToLexoffice(file, effectiveKey);
      await createVoucherForDocument(document, fileId, effectiveKey);
      successIds.push(document.id);
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unbekannter Fehler';
      failed.push({ documentId: document.id, reason });
    }
    onProgress?.(index + 1, total, document.id);
  }

  return {
    successIds,
    failed,
    mode: 'live',
  };
};

export const buildDocumentFromLexoffice = (payload: LexofficeDocumentPayload, storageLocationId: string): Document => {
  const issuedDate = new Date(payload.issuedDate);
  const year = issuedDate.getFullYear();
  const quarter = Math.floor((issuedDate.getMonth() + 3) / 3);

  return {
    id: `lexoffice-doc-${payload.id}`,
    name: payload.filename,
    date: issuedDate,
    year,
    quarter,
    source: DocumentSource.LEXOFFICE,
    status: DocumentStatus.OK,
    fileUrl: payload.url,
  file: payload.file,
    invoiceNumber: payload.invoiceNumber,
    invoiceType: payload.invoiceType,
    totalAmount: payload.totalAmount,
    vatAmount: payload.vatAmount,
    vendor: payload.vendor,
    taxCategory: payload.taxCategory,
    storageLocationId,
    tags: [payload.vendor, payload.taxCategory].filter(Boolean) as string[],
    textContent: undefined,
    linkedTransactionIds: payload.transactionExternalId ? [payload.transactionExternalId] : [],
    lexoffice: {
      status: LexofficeStatus.SUCCESS,
      sentAt: new Date(),
    },
    ocrMetadata: undefined,
  } as Document;
};

// CRUD Operations for Vouchers
export const createVoucherInLexoffice = async (voucher: LexofficeVoucher, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    const response = await lexofficeFetch('/v1/vouchers', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voucher),
    }, effectiveKey);

    const data = await response.json();
    return {
      success: true,
      id: data.id,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

export const updateVoucherInLexoffice = async (voucherId: string, voucher: Partial<LexofficeVoucher>, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    await lexofficeFetch(`/v1/vouchers/${voucherId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(voucher),
    }, effectiveKey);

    return {
      success: true,
      id: voucherId,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

export const deleteVoucherInLexoffice = async (voucherId: string, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    await lexofficeFetch(`/v1/vouchers/${voucherId}`, {
      method: 'DELETE',
    }, effectiveKey);

    return {
      success: true,
      id: voucherId,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

// CRUD Operations for Contacts
export const createContactInLexoffice = async (contact: LexofficeContact, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    const payload = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role || 'both',
      number: contact.number,
      note: contact.note,
    };

    const response = await lexofficeFetch('/v1/contacts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, effectiveKey);

    const data = await response.json();
    return {
      success: true,
      id: data.id,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

export const updateContactInLexoffice = async (contactId: string, contact: Partial<LexofficeContact>, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    const payload = {
      name: contact.name,
      email: contact.email,
      phone: contact.phone,
      role: contact.role,
      number: contact.number,
      note: contact.note,
    };

    await lexofficeFetch(`/v1/contacts/${contactId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    }, effectiveKey);

    return {
      success: true,
      id: contactId,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

export const deleteContactInLexoffice = async (contactId: string, apiKey?: string): Promise<CrudOperationResult> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    return { success: false, error: 'Kein Lexoffice API-Schlüssel vorhanden.', mode: 'live' };
  }

  try {
    await lexofficeFetch(`/v1/contacts/${contactId}`, {
      method: 'DELETE',
    }, effectiveKey);

    return {
      success: true,
      id: contactId,
      mode: 'live',
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unbekannter Fehler',
      mode: 'live',
    };
  }
};

export const fetchVouchersFromLexoffice = async (apiKey?: string): Promise<LexofficeVoucher[]> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    throw new Error('Kein Lexoffice API-Schlüssel vorhanden.');
  }

  const response = await lexofficeFetch('/v1/vouchers', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  }, effectiveKey);

  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Vouchers: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content || [];
};

export const fetchContactsFromLexoffice = async (apiKey?: string): Promise<LexofficeContact[]> => {
  if (!shouldUseLiveApi(apiKey)) throw new Error('Live-Modus erforderlich');

  const effectiveKey = getEffectiveApiKey(apiKey);
  if (!effectiveKey) {
    throw new Error('Kein Lexoffice API-Schlüssel vorhanden.');
  }

  const response = await lexofficeFetch('/v1/contacts', {
    method: 'GET',
    headers: {
      'Accept': 'application/json',
    },
  }, effectiveKey);

  if (!response.ok) {
    throw new Error(`Fehler beim Laden der Kontakte: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();
  return data.content || [];
};

// Helper to convert Document to Voucher
export const documentToVoucher = (document: Document): LexofficeVoucher => {
  const gross = typeof document.totalAmount === 'number' ? document.totalAmount : 0;
  const vat = typeof document.vatAmount === 'number' ? document.vatAmount : 0;
  const net = gross > 0 ? Math.max(gross - vat, 0) : 0;
  const taxRate = calculateTaxRatePercent(document) ?? (vat > 0 ? 19 : 0);

  const invoiceType = document.invoiceType ?? InvoiceType.INCOMING;
  const baseLine = {
    amount: {
      netAmount: Number(net.toFixed(2)),
      taxRatePercent: taxRate,
    },
    description: document.name || 'Beleg',
  };

  if (document.taxCategory) {
    (baseLine as any).account = { name: document.taxCategory };
  }

  const voucher: LexofficeVoucher = {
    voucherType: invoiceType === InvoiceType.OUTGOING ? 'sales' : 'purchase',
    voucherDate: toIsoDate(new Date(document.date)),
    reference: document.invoiceNumber || document.name,
    lineItems: [baseLine],
    totalAmount: {
      totalGrossAmount: Number(gross.toFixed(2)),
      currency: 'EUR',
    },
  };

  if (vat > 0) {
    voucher.taxAmounts = [
      {
        taxType: 'vat',
        taxRatePercent: taxRate,
        amount: Number(vat.toFixed(2)),
      },
    ];
  }

  const counterpartyName = document.vendor || (invoiceType === InvoiceType.OUTGOING ? 'Kunde unbekannt' : 'Lieferant unbekannt');
  if (invoiceType === InvoiceType.OUTGOING) {
    voucher.customer = { name: counterpartyName };
  } else {
    voucher.supplier = { name: counterpartyName };
  }

  return voucher;
};

interface UpsertTransactionsParams {
  incoming: LexofficeTransactionPayload[];
  existingTransactions: AccountingTransaction[];
  linkedByInvoice?: Map<string, string>;
}

export const upsertTransactionsFromLexoffice = ({ incoming, existingTransactions, linkedByInvoice = new Map() }: UpsertTransactionsParams) => {
  const updatedTransactions = [...existingTransactions];
  const indexByExternalId = new Map<string, number>();

  updatedTransactions.forEach((tx, index) => {
    if (tx.externalId) {
      indexByExternalId.set(tx.externalId, index);
    }
  });

  const notifications: string[] = [];
  const now = new Date();

  let imported = 0;
  let updated = 0;
  let skipped = 0;
  let missingReceipts = 0;

  incoming.forEach(payload => {
    const documentId = payload.invoiceNumber ? linkedByInvoice.get(payload.invoiceNumber) : undefined;
    const status = documentId ? TransactionStatus.COMPLETE : TransactionStatus.MISSING_RECEIPT;

    if (status === TransactionStatus.MISSING_RECEIPT) {
      missingReceipts += 1;
    }

    if (indexByExternalId.has(payload.id)) {
      const index = indexByExternalId.get(payload.id)!;
      const existing = updatedTransactions[index];

      updatedTransactions[index] = {
        ...existing,
        description: payload.description,
        amount: payload.amount,
  invoiceType: payload.invoiceType,
  taxCategory: payload.taxCategory,
        documentId: documentId ?? existing.documentId,
        status,
        date: new Date(payload.date),
        updatedAt: now,
        source: TransactionSource.LEXOFFICE,
      };

      updated += 1;
      notifications.push(`Transaktion "${payload.description}" aktualisiert.`);
    } else {
      const transaction: AccountingTransaction = {
        id: `tx-${payload.id}`,
        externalId: payload.id,
        date: new Date(payload.date),
        description: payload.description,
        amount: payload.amount,
        invoiceType: payload.invoiceType,
        taxCategory: payload.taxCategory,
        documentId,
        status,
        source: TransactionSource.LEXOFFICE,
        notes: payload.invoiceNumber ? `Lexoffice Nr. ${payload.invoiceNumber}` : undefined,
        createdAt: now,
        updatedAt: now,
      };

      updatedTransactions.push(transaction);
      imported += 1;
      notifications.push(`Neue Transaktion "${payload.description}" importiert.`);
    }
  });

  return {
    updatedTransactions,
    notifications,
    imported,
    updated,
    skipped,
    missingReceipts,
  };
};
