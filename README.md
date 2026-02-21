# Projeção de Estoque

Aplicação web para gestão de projeção de estoque, sequência de entrega e romaneios.

## Stack

- **Frontend:** React, Vite, TypeScript, Tailwind CSS, TanStack Query
- **Backend:** Node.js/Express (API para MySQL)
- **Bancos:** MySQL (pedidos/romaneio e estoque), Supabase/PostgreSQL (MiniFicha / shelf_ficha)

## Pré-requisitos

- Node.js 18+
- MySQL (acesso às bases do sistema)
- Conta Supabase (para shelf_ficha; opcional — sem Supabase a ficha usa localStorage)

## Variáveis de ambiente

Copie `.env.example` para `.env` e preencha:

- **Backend (raiz do projeto):** `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`
- **Frontend:** `VITE_API_URL` (URL do backend, ex.: `http://localhost:3000`), `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` (se usar Supabase)

Nunca commite o arquivo `.env` (ele está no `.gitignore`).

## Execução

### 1. Backend (API MySQL)

```bash
cd server
npm install
npm run dev
```

O servidor sobe em `http://localhost:3000` (ou no `PORT` definido no `.env`). Endpoints:

- `GET /api/stock` — saldo de estoque (query em `server/queries/saldo-estoque.sql`)
- `GET /api/orders` — romaneio/requisição (query em `server/queries/romaneio-requisicao.sql`)

Para alterar as consultas, edite os arquivos em `server/queries/` e reinicie o servidor.

### 2. Frontend

```bash
npm install
npm run dev
```

Acesse a URL exibida no terminal (em geral `http://localhost:5173`). Configure `VITE_API_URL` para apontar ao backend.

### 3. Supabase (shelf_ficha)

Se for usar a MiniFicha no Supabase:

1. Crie um projeto no [Supabase](https://supabase.com).
2. No SQL Editor, execute o script em `docs/supabase-shelf-ficha.sql` para criar a tabela e as políticas RLS.
3. Para usar **romaneio e estoque** sem a API MySQL, execute também `docs/supabase-romaneio-estoque.sql` (cria as tabelas `romaneio` e `estoque`). Com isso, você pode importar Excel/CSV pelo modal Atualizações e os dados ficam no Supabase.
4. Em Settings > API, copie a URL e a chave `anon` e defina `VITE_SUPABASE_URL` e `VITE_SUPABASE_ANON_KEY` no `.env`.

Sem Supabase, os dados da Ficha de Estantes ficam apenas em localStorage. Romaneio e estoque continuam vindo da API (MySQL) se o Supabase não estiver configurado.

## Deploy (Vercel + API)

O frontend pode ser deployado na **Vercel**; a API (estoque e romaneio) precisa rodar em outro serviço (ex.: **Railway**, **Render**, **Fly.io**), pois a Vercel não mantém um servidor Node sempre ativo da mesma forma.

1. **Deploy da API** (em Railway, Render, etc.):
   - Use a pasta `server/` (ou monorepo com raiz do projeto).
   - Configure as variáveis: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME`, `PORT`.
   - Defina **`CORS_ORIGIN`** com a URL do frontend na Vercel, ex.: `https://seu-projeto.vercel.app` (ou várias URLs separadas por vírgula, ex.: `https://seu-app.vercel.app,http://localhost:5173`).
   - Anote a URL pública da API (ex.: `https://sua-api.railway.app`).

2. **Deploy do frontend na Vercel**:
   - Em **Settings → Environment Variables** do projeto Vercel, defina:
     - **`VITE_API_URL`** = URL pública da sua API (ex.: `https://sua-api.railway.app`), **não** `http://localhost:3000`.
     - **`VITE_SUPABASE_URL`** e **`VITE_SUPABASE_ANON_KEY`** (se usar Supabase).
   - Faça o deploy. O frontend passará a chamar a API deployada e o CORS permitirá a origem da Vercel.

Se a API continuar em `localhost`, o frontend na Vercel não conseguirá acessá-la (e aparecerão erros de CORS / rede no console).

## Deploy único (recomendado — tudo no Railway)

A forma **mais simples** de hospedar o sistema é subir **frontend + API no mesmo servidor**. Assim não há CORS, não é preciso configurar Vercel nem duas URLs.

1. **No Railway:** crie um projeto a partir do repositório (raiz do projeto, não só a pasta `server/`).

2. **Variáveis de ambiente** no Railway:
   - `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` (conexão MySQL)
   - **`SERVE_CLIENT=true`** — faz o Express servir o frontend (pasta `dist`) na mesma URL
   - **Não defina `VITE_API_URL`** (ou deixe vazio) — o frontend usará URLs relativas (`/api/stock`, `/api/orders`)
   - Opcional: `CORS_ORIGIN` (só necessário se você ainda usar o front na Vercel em paralelo)

3. **Build e Start:**
   - **Build Command:** `npm install && npm run build`  
     (gera a pasta `dist` com o React)
   - **Start Command:** `npm start`  
     (sobe o Node e, com `SERVE_CLIENT=true`, serve a API em `/api/*` e o app em `/`)

4. Acesse a URL do Railway (ex.: `https://seu-projeto.up.railway.app`). A aplicação e a API estarão no mesmo domínio; os dados carregam sem CORS.

**Requisito:** o MySQL precisa ser acessível a partir da rede da Railway (liberar firewall / IP ou usar um banco em nuvem que aceite conexões externas).

## Estrutura

- `server/` — API Express, conexão MySQL, leitura das queries em `server/queries/*.sql`
- `components/` — componentes React (ImportModal, ProjectionTable, etc.)
- `docs/` — PRD e script SQL da tabela `shelf_ficha`
- `api.ts` — cliente HTTP para `/api/stock` e `/api/orders`
- `supabaseClient.ts` — cliente Supabase e funções para `shelf_ficha`

## Segurança

- Credenciais do MySQL ficam apenas no backend e no `.env` (nunca com prefixo `VITE_`).
- A API é a fonte de verdade para pedidos e estoque; o frontend apenas consome e exibe.
- Supabase usa RLS na tabela `shelf_ficha`; use a chave anon (pública) e restrinja acesso pelas políticas.
