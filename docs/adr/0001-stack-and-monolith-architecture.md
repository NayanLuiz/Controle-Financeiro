# 0001. Arquitetura em Monolito Modular Full-Stack TypeScript com SQLite (WAL)

Status: aceita

## Contexto
O projeto consiste em um Web App responsivo (PWA) de controle financeiro pessoal de uso individual (*single-user*), com requisitos estritos de privacidade (`RNF-6` — zero envio de dados para terceiros), baixa latência de API (`RNF-4` — p95 <= 200 ms para até 10.000 transações), orçamento enxuto de JavaScript no cliente (`RNF-3` — bundle inicial <= 170 KB gzip por rota) e facilidade de auto-hospedagem local ou em plataformas cloud gratuitas/acessíveis (Fly.io, Render, Railway) via Docker.

Precisamos escolher a arquitetura de implantação, o framework HTTP, o banco de dados relacional e a estratégia de compartilhamento de contratos entre backend e frontend.

## Decisão
1. **Monolito Modular em Processo Único (Node.js + Fastify + React SPA):**
   - Um único serviço Node.js (Fastify) expõe os endpoints REST sob `/api/*` e serve os ativos estáticos compilados do frontend React (Vite) em produção.
   - O código é organizado em módulos por domínio/feature (`auth`, `categories`, `transactions`, `budgets`, `dashboard`) e compartilha schemas Zod (`src/shared/contracts/`) como fonte única da verdade entre servidor e cliente.
2. **Persistência Relacional Embarcada com SQLite em Modo WAL:**
   - Utilizamos SQLite persistido em arquivo local/volume (`DATABASE_PATH`) configurado na inicialização com `PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON; PRAGMA synchronous = NORMAL;`.
3. **Visualização de Dados Nativa (Zero Bibliotecas Pesadas de Gráficos):**
   - Os gráficos de fluxo de caixa e barras de distribuição por categoria (`RF-11`, `RF-12`) são construídos com componentes SVG e CSS nativos em vez de bibliotecas como Chart.js ou Recharts, preservando o orçamento de bundle (`<= 170 KB` gzip) e garantindo acessibilidade semântica (`RNF-5`).

### Alternativas Descartadas
- **Microsserviços ou Backend/Frontend em repositórios separados:** descartado por adicionar latência de rede, complexidade de CORS/cookies em domínios distintos e duplicação de tipos sem ganho para um produto single-user.
- **PostgreSQL / MySQL gerenciado externo:** descartado para o MVP por exigir infraestrutura adicional (segundo container ou serviço pago na nuvem) e aumentar a latência de rede por query, enquanto o SQLite em modo WAL executa agregações locais de 10.000 registros em poucos milissegundos no mesmo processo.
- **ORMs pesados (Prisma / TypeORM):** descartados por adicionarem binários pesados e camadas de abstração desnecessárias para 3 tabelas relacionais bem definidas, onde SQL parametrizado explícito com validação Zod oferece controle total de índices (`RNF-4`) e zero queries N+1.

## Consequências
- **Ganhos:**
  - Deploy trivial em um único container Docker com um único volume persistente (`/data`), custo mínimo de memória/CPU e latência de banco sub-milissegundo.
  - Contrato único de tipos e validação (`Zod`) entre frontend e backend, eliminando divergências de payload.
  - Autenticação por cookie `HttpOnly` (`SameSite=Lax`) funciona nativamente na mesma origem sem problemas de cookies *cross-site*.
- **Custos e Limitações:**
  - O SQLite em arquivo local restringe o escalonamento horizontal a uma única instância de escrita (perfeitamente adequado ao escopo *single-user* do produto).
  - Caso o produto evolua no futuro para um SaaS multi-tenant com múltiplas réplicas concorrentes de escrita, será necessário migrar a camada de repositório SQL para PostgreSQL.
