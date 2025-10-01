import express from 'express';
import cors from 'cors';
import * as dotenv from 'dotenv';
import { join } from 'path';
import lexofficeProxyRouter from './lexofficeProxy';
import documentsRouter from './documentsRouter';
import { UPLOAD_DIR } from './documentStore';

dotenv.config();

const app = express();

app.use(cors());
app.use(express.json());

app.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    message: 'Lexoffice Proxy läuft. Verwenden Sie /api/lexoffice/import für Importe.',
    endpoints: {
      import: '/api/lexoffice/import',
    },
  });
});

app.use('/api/lexoffice', lexofficeProxyRouter);
app.use('/api/documents', documentsRouter);
app.use('/uploads', express.static(UPLOAD_DIR));

const PORT = Number(process.env.LEXOFFICE_PROXY_PORT ?? process.env.PORT ?? 5174);

app.listen(PORT, () => {
  console.log(`Server läuft auf http://localhost:${PORT}`);
  console.log(` - Lexoffice Proxy: http://localhost:${PORT}/api/lexoffice/import`);
  console.log(` - Dokumente API:  http://localhost:${PORT}/api/documents`);
});
