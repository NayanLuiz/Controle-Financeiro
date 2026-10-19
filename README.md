# Personal Finance Control (MVP)

Aplicação web responsiva (**PWA**) de controle financeiro pessoal **single-user**, projetada para visibilidade imediata de fluxo de caixa, lançamento rápido de transações em centavos (`amountCents`) e acompanhamento de orçamento mensal por categoria com alertas proativos (`NORMAL < 80%`, `WARNING 80%..100%`, `EXCEEDED > 100%`).

## Principais Funcionalidades

- **Autenticação Single-User (`US-1`):** Proteção por senha/PIN (`APP_PASSWORD`) validada em tempo constante (`crypto.timingSafeEqual`), sessão em cookie `HttpOnly` assinado (`HMAC-SHA256`) e rate limit contra força bruta (`5` falhas / `15` min por IP).
- **Gestão de Categorias (`US-2`):** Seed inicial idempotente com 9 categorias (`3` de receita e `6` de despesa), cores em hexadecimal (`#RRGGBB`), proteção contra exclusão/mudança de tipo quando há vínculos (`HTTP 409 Conflict`) e arquivamento (`isArchived`).
- **Transações Financeiras (`US-3`):** Registro em até 15 segundos (atalho global `N`), precisão monetária em centavos inteiros (`BRL R$`), datas civis `YYYY-MM-DD` imunes a deslocamento de fuso horário, filtros combinados por mês/ano/tipo/categoria/busca e paginação.
- **Orçamento Mensal por Categoria (`US-4`):** Definição e edição rápida de limites mensais (`limitCents`) por categoria de despesa.
- **Dashboard e Fluxo de Caixa (`US-5`):** KPIs consolidados (Receitas, Despesas, Saldo Líquido e Orçamento Comprometido), gráfico comparativo de fluxo de caixa, participação por categoria e barras de progresso com alertas semânticos multimodais (cor + ícone + badge textual, WCAG 2.2 AA).

---

## Arquitetura e Stack

- **Runtime:** Node.js `>= 24.0.0` (utiliza o módulo nativo `node:sqlite` / `DatabaseSync` em modo `WAL`, sem dependências C++ externas)
- **Backend:** Fastify 5 + Zod (validação estrita compartilhada entre cliente e servidor)
- **Frontend:** React 19 + Vite 6 + CSS Custom Properties (Design System leve, bundle inicial `< 90 KB` gzip, suporte a Dark Mode e `prefers-reduced-motion`)
- **Qualidade Automatizada (`npm run check`):** Biome (lint & format) + TypeScript (`tsc --noEmit` estrito) + Knip (zero código morto) + jscpd (zero duplicação) + Vitest (testes unitários, banco, integração de API e componentes UI)

Documentação arquitetural e especificação:
- Especificação completa: [`docs/specs/personal-finance-mvp.md`](docs/specs/personal-finance-mvp.md)
- ADR 0001 (Monólito Modular e Stack): [`docs/adr/0001-stack-and-monolith-architecture.md`](docs/adr/0001-stack-and-monolith-architecture.md)
- ADR 0002 (Centavos Inteiros e Datas Civis): [`docs/adr/0002-integer-cents-and-civil-dates.md`](docs/adr/0002-integer-cents-and-civil-dates.md)

---

## Como Executar Localmente

### 1. Pré-requisitos
- **Node.js** `v24+`
- **npm** `v10+`

### 2. Configuração de Ambiente
Copie o arquivo `.env.example` para `.env`:

```bash
cp .env.example .env
```

Variáveis disponíveis em `.env`:
- `PORT=3000` — Porta HTTP do servidor
- `NODE_ENV=development` — Ambiente (`development`, `test`, `production`)
- `APP_PASSWORD=admin123` — Senha/PIN de acesso ao aplicativo (mínimo de 4 caracteres em produção)
- `SESSION_SECRET=...` — Segredo de no mínimo 32 caracteres para assinatura HMAC do cookie de sessão
- `DATABASE_PATH=./data/finance.db` — Caminho do arquivo SQLite (criado automaticamente com seed na 1ª execução)

### 3. Instalação e Desenvolvimento
```bash
npm install
npm run dev
```
- Frontend (Vite HMR): `http://localhost:5173`
- Backend API (Fastify): `http://localhost:3000/api/health`

### 4. Portão de Qualidade e Testes
Para rodar formatação, lint, checagem de tipos, detecção de código morto, detecção de duplicação e toda a suíte de testes:
```bash
npm run check
```

---

## Executando com Docker

A aplicação conta com `Dockerfile` multi-stage seguro (usuário não-root `node` e `HEALTHCHECK` integrado) e `docker-compose.yml` com volume persistente para o SQLite:

```bash
APP_PASSWORD="sua-senha-forte-aqui" \
SESSION_SECRET="seu-segredo-com-pelo-menos-32-caracteres-aqui" \
docker compose up --build -d
```

Acesse em `http://localhost:3000`.

---

## Deploy em Cloud (Fly.io ou Render)

### Opção A: Fly.io (`fly.toml` incluso)
1. Crie o app e o volume persistente de 1 GB para o SQLite:
   ```bash
   fly launch --no-deploy
   fly volumes create finance_data --region gru --size 1
   ```
2. Configure os segredos de produção:
   ```bash
   fly secrets set APP_PASSWORD="sua-senha-forte" SESSION_SECRET="$(openssl rand -hex 32)"
   ```
3. Realize o deploy:
   ```bash
   fly deploy
   ```

### Opção B: Render (`render.yaml` incluso)
1. Conecte seu repositório Git ao **Render** usando **Blueprint (`render.yaml`)**.
2. O Render provisionará automaticamente o Web Service Docker com disco persistente montado em `/data`, gerará `SESSION_SECRET` e solicitará apenas o valor de `APP_PASSWORD` no painel.
