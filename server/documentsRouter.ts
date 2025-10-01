import express from 'express';
import multer from 'multer';
import { join } from 'path';
import { addDocument, deleteDocument, deleteAllDocuments, getDocument, listDocuments, updateDocument, UPLOAD_DIR } from './documentStore';
import { DocumentStatus } from '../types.js';
import { DocumentSource } from '../types.js';

const router = express.Router();

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    const safe = file.originalname.replace(/[^a-zA-Z0-9_.-]+/g, '_');
    const unique = `${Date.now()}-${Math.random().toString(36).slice(2,6)}-${safe}`;
    cb(null, unique);
  },
});

const upload = multer({ storage });

router.get('/', (_req, res) => {
  console.log('[DocumentsRouter] GET / called');
  const docs = listDocuments();
  console.log('[DocumentsRouter] Returning', docs.length, 'documents');
  res.json(docs);
});

router.post('/', upload.single('file'), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'Datei fehlt.' });
  }
  const sourceRaw = (req.body.source as string) || 'Manuell';
  const source = Object.values(DocumentSource).includes(sourceRaw as any) ? (sourceRaw as DocumentSource) : DocumentSource.MANUAL;
  const record = await addDocument({ originalName: req.file.originalname, storedFilename: req.file.filename, source, mimeType: req.file.mimetype });
  res.status(201).json({ ...record, compression: 'completed' });
});

router.get('/:id', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(doc);
});

router.put('/:id', (req, res) => {
  const updated = updateDocument(req.params.id, req.body || {});
  if (!updated) return res.status(404).json({ error: 'Nicht gefunden' });
  res.json(updated);
});

// Markiere mutmaßliches Duplikat als bestätigt (kein Duplikat)
router.post('/:id/ignore-duplicate', (req, res) => {
  const doc = getDocument(req.params.id);
  if (!doc) return res.status(404).json({ error: 'Nicht gefunden' });
  const updated = updateDocument(doc.id, { duplicateIgnored: true, status: doc.status === DocumentStatus.POTENTIAL_DUPLICATE ? DocumentStatus.OK : doc.status });
  res.json(updated);
});

// Batch Update (Metadaten)
router.patch('/batch', (req, res) => {
  const body = Array.isArray(req.body) ? req.body : [];
  const results = body.map(item => {
    if (!item?.id) return { id: null, success: false };
    const updated = updateDocument(item.id, item.patch || {});
    return { id: item.id, success: !!updated };
  });
  res.json({ results });
});

router.delete('/', (_req, res) => {
  deleteAllDocuments();
  res.status(204).end();
});

router.delete('/:id', (req, res) => {
  const ok = deleteDocument(req.params.id);
  if (!ok) return res.status(404).json({ error: 'Nicht gefunden' });
  res.status(204).end();
});

export default router;
