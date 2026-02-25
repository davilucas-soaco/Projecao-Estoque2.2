import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import mysql from 'mysql2/promise';
import fs from 'fs';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// Carrega .env da raiz do projeto (um nível acima de server/)
const envPath = path.resolve(__dirname, '..', '.env');
dotenv.config({ path: envPath });

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
};

// CORS: restrito à origem do frontend em dev
const corsOptions = {
  origin: [
    'http://localhost:5173',
    'http://10.80.1.15:5173',
    'http://192.168.18.155:5173'
  ],
  optionsSuccessStatus: 200,
};
app.use(cors(corsOptions));
app.use(express.json());

// Rota de saúde: abrir http://localhost:3000 no navegador mostra que a API está no ar
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'API Projeção de Estoque',
    endpoints: { stock: 'GET /api/stock' },
  });
});

function getQueriesDir() {
  return path.join(__dirname, 'queries');
}

async function loadQuery(filename) {
  const filePath = path.join(getQueriesDir(), filename);
  return fs.promises.readFile(filePath, 'utf8');
}

async function getConnection() {
  return mysql.createConnection(dbConfig);
}

// Normaliza valores NUMERIC/DECIMAL do MySQL (que vêm como string) para número
function toNumber(v) {
  if (v == null || v === '') return 0;
  if (typeof v === 'number' && !Number.isNaN(v)) return v;
  const n = Number(v);
  return Number.isNaN(n) ? 0 : n;
}

const STOCK_NUMERIC_KEYS = ['idProduto', 'idTipoProduto', 'saldoSetorFinal'];

function normalizeStockRow(row) {
  if (!row || typeof row !== 'object') return row;
  const out = { ...row };
  for (const key of STOCK_NUMERIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(out, key)) out[key] = toNumber(out[key]);
  }
  return out;
}

// GET /api/stock — Saldo estoque
app.get('/api/stock', async (_req, res) => {
  try {
    const sql = await loadQuery('saldo-estoque.sql');
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(sql);
      res.json((rows || []).map(normalizeStockRow));
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.error('GET /api/stock error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar estoque. Tente novamente.' });
  }
});

// para rodar via ip
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});

// para rodar no localhost, descomente a linha abaixo
//app.listen(PORT, () => {
//  console.log(`Servidor rodando em http://localhost:${PORT}`);
//});
