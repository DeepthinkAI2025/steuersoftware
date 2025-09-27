import express from 'express';
import type { Request, Response } from 'express';

const router = express.Router();

const LEXOFFICE_API_BASE = (process.env.LEXOFFICE_API_BASE ?? 'https://api.lexoffice.io').replace(/\/$/, '');

interface DateRange {
  start?: string;
  end?: string;
}

interface LexofficeTransactionPayload {
  id: string;
  description: string;
  amount: number;
  date: string;
  invoiceType: 'incoming' | 'outgoing';
  taxCategory: string;
  invoiceNumber?: string;
  hasDocument: boolean;
  voucherId?: string;
  fileIds?: string[];
  vendor?: string;
}

interface LexofficeDocumentPayload {
  id: string;
  transactionExternalId?: string;
  filename: string;
  issuedDate: string;
  vendor: string;
  totalAmount: number;
  vatAmount?: number;
  taxCategory?: string;
  invoiceType: 'incoming' | 'outgoing';
  invoiceNumber?: string;
  downloadUrl?: string;
}

const toIsoDate = (date: Date) => date.toISOString().split('T')[0];

const buildTransactionsPath = (dateRange?: DateRange) => {
  const params = new URLSearchParams();
  if (dateRange?.start) params.set('from', dateRange.start);
  if (dateRange?.end) params.set('to', dateRange.end);
  params.set('size', '100');
  params.set('sort', 'date,asc');
  return `/v1/transactions?${params.toString()}`;
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

const mapTransactionFromLexoffice = (entry: any): LexofficeTransactionPayload => {
  const rawAmount = typeof entry.amount === 'number'
    ? entry.amount
    : entry.amount?.value ?? entry.amount?.grossTotal ?? entry.amount?.gross ?? entry.amount?.amount ?? 0;

  const direction = (entry.type || entry.direction || '').toString().toLowerCase();
  const invoiceType = direction.includes('income') || direction.includes('credit') || direction.includes('sales')
    ? 'outgoing'
    : direction.includes('expense') || direction.includes('debit') || direction.includes('purchase')
      ? 'incoming'
      : rawAmount >= 0
        ? 'outgoing'
        : 'incoming';

  const amountValue = typeof rawAmount === 'number' ? rawAmount : Number(rawAmount) || 0;
  const signedAmount = invoiceType === 'outgoing' ? Math.abs(amountValue) : -Math.abs(amountValue);

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
    id: entry.id || entry.transactionId || entry.uuid || `lex-${Math.random().toString(36).slice(2, 12)}`,
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

const lexofficeFetch = async (path: string, apiKey: string, options: RequestInit = {}) => {
  const url = path.startsWith('http') ? path : `${LEXOFFICE_API_BASE}${path}`;
  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: 'application/json',
      ...(options.headers || {}),
    },
  });

  if (!response.ok) {
    const text = await response.text();
    const message = text || `Lexoffice API Fehler (${response.status})`;
    throw new Error(message);
  }

  return response;
};

const fetchTransactionsFromLexofficeLive = async (apiKey: string, dateRange?: DateRange) => {
  const transactions: LexofficeTransactionPayload[] = [];
  let nextPath: string | null = buildTransactionsPath(dateRange);

  while (nextPath) {
    const response = await lexofficeFetch(nextPath, apiKey);
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
  if (dateRange?.start) params.set('voucherDateFrom', dateRange.start);
  if (dateRange?.end) params.set('voucherDateTo', dateRange.end);
  params.set('size', '100');

  let nextPath: string | null = `/v1/vouchers?${params.toString()}`;
  while (nextPath) {
    const response = await lexofficeFetch(nextPath, apiKey);
    const data = await response.json();
    const entries = Array.isArray(data?.content)
      ? data.content
      : Array.isArray(data?.vouchers)
        ? data.vouchers
        : [];

    entries.forEach((entry: any) => {
      const id = entry?.id || entry?.voucherId;
      if (id) voucherIds.push(id);
    });

    const nextLink = normalizeNextPath(data?.links?.next || data?._links?.next?.href || data?.nextLink);
    nextPath = nextLink;
  }

  return voucherIds;
};

const fetchVoucherDetail = async (voucherId: string, apiKey: string) => {
  const response = await lexofficeFetch(`/v1/vouchers/${voucherId}`, apiKey);
  return response.json();
};

const fetchDocumentsFromLexofficeLive = async (apiKey: string, transactions: LexofficeTransactionPayload[], dateRange?: DateRange) => {
  const voucherMap = new Map<string, LexofficeTransactionPayload | undefined>();
  transactions.forEach(tx => {
    if (tx.voucherId) {
      voucherMap.set(tx.voucherId, tx);
    }
  });

  if (voucherMap.size === 0 && dateRange) {
    const ids = await listVoucherIds(apiKey, dateRange);
    ids.forEach(id => {
      if (!voucherMap.has(id)) {
        voucherMap.set(id, undefined);
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

      attachments.forEach((attachment: any) => {
        const fileId = attachment?.id || attachment?.fileId || (typeof attachment === 'string' ? attachment : null);
        if (!fileId) return;

        const filename = attachment?.filename || attachment?.name || attachment?.originalFilename || `${voucherId}.pdf`;

        documents.push({
          id: fileId,
          transactionExternalId: transaction?.id,
          filename,
          issuedDate,
          vendor: vendor || 'Unbekannt',
          totalAmount: Number(totalAmount) || 0,
          vatAmount: typeof vatAmount === 'number' ? vatAmount : undefined,
          taxCategory: taxCategory || undefined,
          invoiceType: transaction?.invoiceType
            ?? (detail.voucherType === 'sales' ? 'outgoing' : 'incoming'),
          invoiceNumber,
          downloadUrl: `${LEXOFFICE_API_BASE}/v1/files/${fileId}/download`,
        });
      });
    } catch (error) {
      console.warn('Lexoffice Voucher konnte nicht verarbeitet werden:', error);
    }
  }

  return documents;
};

const parseDateRange = (req: Request): DateRange => {
  const start = typeof req.query.start === 'string' ? req.query.start : undefined;
  const end = typeof req.query.end === 'string' ? req.query.end : undefined;

  if (!start && !end) return {};

  const range: DateRange = {};
  if (start) range.start = start;
  if (end) range.end = end;
  return range;
};

router.get('/import', async (req: Request, res: Response) => {
  try {
    const includeDocuments = String(req.query.includeDocuments ?? 'true') !== 'false';
    const dateRange = parseDateRange(req);

    const apiKey = (req.header('x-lexoffice-api-key') || process.env.LEXOFFICE_API_KEY || '').trim();
    if (!apiKey) {
      return res.status(400).json({ error: 'Kein Lexoffice API-Schlüssel vorhanden.' });
    }

    const transactions = await fetchTransactionsFromLexofficeLive(apiKey, dateRange);
    const documents = includeDocuments
      ? await fetchDocumentsFromLexofficeLive(apiKey, transactions, dateRange)
      : [];

    const missingReceipts = transactions.filter(tx => !tx.hasDocument).length;

    res.json({
      mode: 'live',
      transactions,
      documents,
      summary: {
        imported: transactions.length,
        updated: 0,
        skipped: 0,
        missingReceipts,
      },
    });
  } catch (error) {
    console.error('Lexoffice Import fehlgeschlagen:', error);
    const message = error instanceof Error ? error.message : 'Unbekannter Fehler beim Lexoffice-Import.';
    res.status(500).json({ error: message });
  }
});

export default router;
