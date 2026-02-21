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
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

const dbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '3306', 10),
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME || process.env.DB_DATABASE,
  connectTimeout: 10000, // 10s — evita travar e gerar 502 se o MySQL estiver inacessível
};

// CORS: lê CORS_ORIGIN do .env (lista separada por vírgulas)
const corsOrigins = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map(s => s.trim()).filter(Boolean)
  : ['http://localhost:5173'];

const corsOptions = {
  origin(origin, callback) {
    // Requisições sem origin (health checks, curl, Postman) são permitidas
    if (!origin) return callback(null, true);
    if (corsOrigins.includes(origin)) return callback(null, origin);
    return callback(null, false);
  },
  optionsSuccessStatus: 200,
  credentials: false,
};
app.use(cors(corsOptions)); // inclui preflight OPTIONS em todas as rotas
app.use(express.json());

// Garante header CORS em respostas de erro (evita "No 'Access-Control-Allow-Origin'" no front)
function setCorsOnError(req, res) {
  const origin = req.get('Origin');
  if (origin && corsOrigins.includes(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
}

// Rota de saúde (não usa DB) — Railway e navegador podem testar se a API está no ar
app.get('/', (_req, res) => {
  res.json({
    ok: true,
    message: 'API Projeção de Estoque',
    endpoints: { stock: 'GET /api/stock', orders: 'GET /api/orders' },
  });
});
app.get('/health', (_req, res) => {
  res.json({ ok: true, timestamp: new Date().toISOString() });
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
    setCorsOnError(_req, res);
    res.status(500).json({ error: 'Erro ao buscar estoque. Tente novamente.' });
  }
});

// GET /api/orders — Romaneio e requisição (retorna camelCase para o frontend)
const orderKeysMap = {
  Codigo_Romaneio: 'codigoRomaneio',
  observacoes_Romaneio: 'observacoesRomaneio',
  dataEmissao_Romaneio: 'dataEmissaoRomaneio',
  N_Pedido: 'numeroPedido',
  Cliente: 'cliente',
  Data_Emissao_Pedido: 'dataEmissaoPedido',
  Cod_Produto: 'codigoProduto',
  descricao: 'descricao',
  'U.M': 'um',
  Qtd_Pedida: 'qtdPedida',
  Qtd_Vinculada_no_Romaneio: 'qtdVinculada',
  Tipo_de_produto_do_item_de_pedido_de_venda: 'tipoProduto',
  Preco_Unitario: 'precoUnitario',
  Data_de_Entrega: 'dataEntrega',
  Municipio: 'municipio',
  UF: 'uf',
  Endereco: 'endereco',
  Metodo_de_entrega: 'metodoEntrega',
  Requisicao_de_Loja_do_grupo: 'requisicaoLojaRaw',
};

const ORDER_NUMERIC_KEYS = ['qtdPedida', 'qtdVinculada', 'precoUnitario'];

function rowToOrder(row) {
  const order = {};
  for (const [dbKey, camelKey] of Object.entries(orderKeysMap)) {
    if (Object.prototype.hasOwnProperty.call(row, dbKey)) {
      order[camelKey] = row[dbKey];
    }
  }
  for (const key of ORDER_NUMERIC_KEYS) {
    if (Object.prototype.hasOwnProperty.call(order, key)) order[key] = toNumber(order[key]);
  }
  if (order.requisicaoLojaRaw !== undefined) {
    order.requisicaoLoja = String(order.requisicaoLojaRaw || '').toLowerCase().includes('sim');
    delete order.requisicaoLojaRaw;
  }
  order.localEntregaDif = 0;
  order.municipioCliente = order.municipio || '';
  order.ufCliente = order.uf || '';
  order.municipioEntrega = order.municipio || '';
  order.ufEntrega = order.uf || '';
  return order;
}

app.get('/api/orders', async (_req, res) => {
  try {
    const sql = await loadQuery('romaneio-requisicao.sql');
    const conn = await getConnection();
    try {
      const [rows] = await conn.execute(sql);
      const orders = (rows || []).map(row => rowToOrder(row));
      res.json(orders);
    } finally {
      await conn.end();
    }
  } catch (err) {
    console.error('GET /api/orders error:', err.message);
    setCorsOnError(_req, res);
    res.status(500).json({ error: 'Erro ao buscar romaneio. Tente novamente.' });
  }
});

// Tratador global: qualquer erro não capturado ainda envia CORS + 500
app.use((err, _req, res, _next) => {
  setCorsOnError(_req, res);
  console.error('Unhandled error:', err?.message || err);
  if (!res.headersSent) res.status(500).json({ error: 'Erro interno do servidor.' });
});

// Escuta em 0.0.0.0 para aceitar conexões externas (Railway, Render, etc.)
app.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando na porta ${PORT}`);
});
