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
/** SERVER_PORT tem prioridade sobre PORT (evita conflito quando PORT=3000 já está em uso por outro processo). */
let PORT = parseInt(String(process.env.SERVER_PORT || process.env.PORT || '3535'), 10);
if (!Number.isFinite(PORT) || PORT < 1) PORT = 3535;

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
};

// CORS (dev): permite localhost e faixas de rede local comuns no Vite (porta 5257)
const allowedOriginPatterns = [
  /^https?:\/\/[^/]+:3000$/,
  /^https?:\/\/[^/]+:5257$/,
  /^http:\/\/localhost:5257$/,
  /^http:\/\/127\.0\.0\.1:5257$/,
  /^http:\/\/170\.84\.146\.147:5257$/,
  /^https:\/\/170\.84\.146\.147:5257$/,
  /^http:\/\/10\.\d{1,3}\.\d{1,3}\.\d{1,3}:5257$/,
  /^http:\/\/192\.168\.\d{1,3}\.\d{1,3}:5257$/,
  /^http:\/\/172\.(1[6-9]|2\d|3[0-1])\.\d{1,3}\.\d{1,3}:5257$/,
];

const corsAllowAll = String(process.env.CORS_ALLOW_ALL || '').toLowerCase() === 'true';

app.use(
  cors({
    origin(origin, callback) {
      // Permite requests sem Origin (curl, health checks locais)
      if (!origin) return callback(null, true);
      if (corsAllowAll) return callback(null, true);
      const allowed = allowedOriginPatterns.some((pattern) => pattern.test(origin));
      if (allowed) return callback(null, true);
      console.error('CORS bloqueado para origem:', origin);
      return callback(new Error('Origem não permitida pelo CORS'));
    },
    optionsSuccessStatus: 200,
  })
);
app.use(express.json());

// Rota de saúde: abrir http://localhost:3535 no navegador mostra que a API está no ar
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'API Projeção de Estoque',
    endpoints: { stock: 'GET /api/stock', shelfFicha: 'GET /api/shelf-ficha' },
  });
});

function getQueriesDir() {
  return path.join(__dirname, 'queries');
}

async function loadQuery(filename) {
  const filePath = path.join(getQueriesDir(), filename);
  let sql = await fs.promises.readFile(filePath, 'utf8');

  // Tokens seguros (evita SQL injection via .env)
  if (filename === 'saldo-estoque.sql') {
    const rawSectorIds = String(process.env.STOCK_SECTOR_IDS || '5,24').trim();
    if (!/^\d+(,\d+)*$/.test(rawSectorIds)) {
      throw new Error('STOCK_SECTOR_IDS inválido. Use apenas números separados por vírgula, ex: 5,24');
    }
    sql = sql.replace(/\{\{STOCK_SECTOR_IDS\}\}/g, rawSectorIds);
  }

  return sql;
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

/** Converte linha MySQL (aliases snake_case) para o formato ShelfFicha do frontend. */
function rowToShelfFicha(row) {
  if (!row || typeof row !== 'object') return null;
  const codigo = row.codigo_estante;
  if (codigo == null || String(codigo).trim() === '') return null;
  const descRaw = row.desc_estante;
  const desc =
    descRaw != null && String(descRaw).trim() !== '' ? String(descRaw).trim() : undefined;
  return {
    codigoEstante: String(codigo).trim(),
    descEstante: desc,
    codColuna: String(row.cod_coluna ?? '').trim(),
    descColuna: String(row.desc_coluna ?? '').trim(),
    qtdColuna: toNumber(row.qtd_coluna),
    codBandeja: String(row.cod_bandeja ?? '').trim(),
    descBandeja: String(row.desc_bandeja ?? '').trim(),
    qtdBandeja: toNumber(row.qtd_bandeja),
  };
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

// GET /api/shelf-ficha — Mini ficha (estante → coluna/bandeja) via ERP
app.get('/api/shelf-ficha', async (_req, res) => {
  try {
    const sql = await loadQuery('mini-ficha.sql');
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(sql);
      const list = (rows || []).map(rowToShelfFicha).filter(Boolean);
      res.json(list);
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.error('GET /api/shelf-ficha error:', err.message);
    res.status(500).json({ error: 'Erro ao buscar ficha de estantes. Tente novamente.' });
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
