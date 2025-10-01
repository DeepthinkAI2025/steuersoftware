import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, renameSync, readdirSync } from 'fs';
import { join } from 'path';
import { createHash } from 'crypto';
import { PDFDocument } from 'pdf-lib';
import sharp from 'sharp';
import { DocumentSource, DocumentStatus, InvoiceType } from '../types.js';

export interface StoredDocumentRecord {
  id: string;
  name: string;
  originalName: string;
  date: string; // ISO
  year: number;
  quarter: number;
  source: DocumentSource;
  status: DocumentStatus;
  fileUrl: string; // served URL (/uploads/...)
  invoiceType: InvoiceType;
  documentType?: 'Rechnung' | 'Angebot' | 'Bestellbestätigung' | 'Unbekannt';
  createdAt: string;
  updatedAt: string;
  vendor?: string;
  totalAmount?: number;
  vatAmount?: number;
  invoiceNumber?: string;
  taxCategory?: string;
  tags?: string[];
  errorMessage?: string;
  storageLocationId?: string;
  linkedTransactionIds?: string[];
  textContent?: string;
  fileHash?: string;
  duplicateOfId?: string;
  duplicateIgnored?: boolean;
}

const DATA_DIR = join(process.cwd(), 'server', 'data');
const UPLOAD_DIR = join(process.cwd(), 'server', 'uploads');
const DATA_FILE = join(DATA_DIR, 'documents.json');

const ensureDirs = () => {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(UPLOAD_DIR)) mkdirSync(UPLOAD_DIR, { recursive: true });
};

ensureDirs();

let cache: StoredDocumentRecord[] = [];

const load = () => {
  try {
    if (existsSync(DATA_FILE)) {
      const raw = readFileSync(DATA_FILE, 'utf-8');
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) cache = parsed;
    }
  } catch (e) {
    console.warn('[DocumentStore] Konnte Dokumente nicht laden:', (e as Error).message);
  }
};

const persist = () => {
  try {
    writeFileSync(DATA_FILE, JSON.stringify(cache, null, 2), 'utf-8');
  } catch (e) {
    console.error('[DocumentStore] Persistenzfehler:', (e as Error).message);
  }
};

load();

const genId = () => `doc-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;

const compressFile = async (filePath: string, mimeType: string): Promise<void> => {
  try {
    if (mimeType === 'application/pdf') {
      // PDF komprimieren (grundlegende Optimierung)
      const pdfBytes = readFileSync(filePath);
      const pdfDoc = await PDFDocument.load(pdfBytes);
      const compressedPdfBytes = await pdfDoc.save({ useObjectStreams: false });
      writeFileSync(filePath, compressedPdfBytes);
    } else if (mimeType.startsWith('image/')) {
      // Bild stärker komprimieren
      let pipeline = sharp(filePath);
      if (mimeType === 'image/jpeg' || mimeType === 'image/jpg') {
        pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
      } else if (mimeType === 'image/png') {
        pipeline = pipeline.png({ compressionLevel: 9 });
      } else if (mimeType === 'image/webp') {
        pipeline = pipeline.webp({ quality: 85 });
      } else if (mimeType === 'image/tiff' || mimeType === 'image/tif') {
        pipeline = pipeline.tiff({ quality: 85 });
      } else {
        // Für andere Bildformate zu JPEG konvertieren und komprimieren
        pipeline = pipeline.jpeg({ quality: 85, mozjpeg: true });
      }
      await pipeline.toFile(filePath + '.tmp');
      renameSync(filePath + '.tmp', filePath);
    }
    // Andere Typen unverändert lassen
  } catch (e) {
    console.warn('[Compression] Fehler bei Kompression:', (e as Error).message);
  }
};

export const listDocuments = () => cache.slice();
export const getDocument = (id: string) => cache.find(d => d.id === id) || null;

const hashFile = (full: string) => {
  try {
    const buf = readFileSync(full);
    return createHash('sha256').update(buf).digest('hex');
  } catch {
    return undefined;
  }
};

export const addDocument = async (params: { originalName: string; storedFilename: string; source: DocumentSource; mimeType: string }): Promise<StoredDocumentRecord> => {
  const now = new Date();
  const id = genId();
  const date = now;
  const fullPath = join(UPLOAD_DIR, params.storedFilename);
  const fileHash = hashFile(fullPath);
  let duplicateOfId: string | undefined;
  let status: DocumentStatus = DocumentStatus.ANALYZING;
  if (fileHash) {
    const existing = cache.find(d => d.fileHash === fileHash && !d.duplicateIgnored);
    if (existing) {
      duplicateOfId = existing.id;
      status = DocumentStatus.POTENTIAL_DUPLICATE;
    }
  }
  const record: StoredDocumentRecord = {
    id,
    name: params.originalName,
    originalName: params.originalName,
    date: date.toISOString(),
    year: date.getFullYear(),
    quarter: Math.floor((date.getMonth() + 3) / 3),
    source: params.source,
    status,
    fileUrl: `/uploads/${params.storedFilename}`,
    invoiceType: InvoiceType.INCOMING,
  documentType: 'Unbekannt',
    createdAt: now.toISOString(),
    updatedAt: now.toISOString(),
    tags: [],
    linkedTransactionIds: [],
    fileHash,
    duplicateOfId,
  };
  cache.push(record);
  persist();

  // Kompression
  await compressFile(fullPath, params.mimeType);

  return record;
};

export const updateDocument = (id: string, patch: Partial<StoredDocumentRecord>) => {
  const idx = cache.findIndex(d => d.id === id);
  if (idx === -1) return null;
  const updated: StoredDocumentRecord = { ...cache[idx], ...patch, id, updatedAt: new Date().toISOString() };
  cache[idx] = updated;
  persist();
  return updated;
};

export const deleteDocument = (id: string) => {
  const idx = cache.findIndex(d => d.id === id);
  if (idx === -1) return false;
  const [removed] = cache.splice(idx, 1);
  persist();
  // Datei optional löschen
  try {
    const filename = removed.fileUrl.replace('/uploads/', '');
    const full = join(UPLOAD_DIR, filename);
    if (existsSync(full)) unlinkSync(full);
  } catch {/* ignore */}
  return true;
};

export const deleteAllDocuments = () => {
  const seenFiles = new Set<string>();

  for (const doc of cache) {
    if (!doc.fileUrl) continue;
    const filename = doc.fileUrl.replace('/uploads/', '');
    if (filename) seenFiles.add(filename);
  }

  cache = [];
  persist();

  try {
    const files = readdirSync(UPLOAD_DIR);
    for (const file of files) {
      seenFiles.add(file);
    }
  } catch (error) {
    console.warn('[DocumentStore] Upload-Verzeichnis konnte nicht gelesen werden:', (error as Error).message);
  }

  for (const file of seenFiles) {
    try {
      const full = join(UPLOAD_DIR, file);
      if (existsSync(full)) unlinkSync(full);
    } catch (error) {
      console.warn('[DocumentStore] Datei konnte nicht gelöscht werden:', (error as Error).message);
    }
  }
};

export { UPLOAD_DIR };
