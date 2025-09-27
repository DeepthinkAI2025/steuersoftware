import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import lexofficeProxyRouter from './lexofficeProxy';

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

const PORT = Number(process.env.LEXOFFICE_PROXY_PORT ?? process.env.PORT ?? 5174);

app.listen(PORT, () => {
  console.log(`Lexoffice Proxy läuft auf http://localhost:${PORT}`);
});
