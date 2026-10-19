# Gestão de Status de Pagamento (Pago/Pendente) e Contas Recorrentes

Status: entregue


Requisitos descrevem comportamento observável, não tarefas de código. Ao mudar um requisito, atualize esta spec **antes** do código.

## Problema e objetivo
<!-- product-owner: quem sofre, custo hoje, resultado e métricas (linha de base → alvo) -->

### Problema
Usuários do aplicativo de controle financeiro precisam registrar contas que se repetem todos os meses (aluguel, condomínio, internet, assinaturas, salários) e saber exatamente quais contas do mês já foram quitadas e quais continuam pendentes.
Hoje, o usuário precisa:
1. Cadastrar manualmente a mesma conta todo santo mês, correndo o risco de esquecer de lançar compromissos fixos futuros.
2. Abrir o modal de edição para qualquer alteração, sem conseguir saber ou alternar rapidamente se uma conta já foi paga diretamente na listagem.
3. Não ter visão consolidada de quanto dinheiro do mês ainda está comprometido em contas a vencer vs. já liquidado.

### Objetivo
Permitir ao usuário:
1. Visualizar e alternar o status de pagamento de qualquer transação (`Pago`/`Recebido` vs. `Pendente`) com **1 clique** diretamente na tabela/lista de transações, com feedback visual imediato e acessível.
2. Criar lançamentos recorrentes (mensais) informando se a conta é recorrente e "até quando", com **preenchimento padrão de 1 ano para frente** (12 meses), gerando as competências futuras automaticamente como pendentes.
3. Filtrar e acompanhar totais pendentes vs. pagos no período para tomada de decisão ágil.

### Métricas de sucesso
| Métrica | Linha de base | Alvo |
|---|---|---|
| **Tempo para marcar conta como paga** | ~10s (clicar editar, alterar e salvar) | **≤ 1 segundo** (1 clique direto na lista) |
| **Tempo para provisionar contas fixas do ano** | ~15 min (criar 12 transações manuais) | **≤ 15 segundos** (criar 1 vez marcando recorrência de 1 ano) |
| **Visibilidade de compromissos pendentes** | Inexistente (tudo é tratado como já ocorrido) | **100% das transações** com status explícito e filtro dedicado |

## Escopo e fora de escopo
<!-- product-owner: histórias US-n em ordem de prioridade; o que NÃO será feito -->

### Escopo
- **US-6 — Status de pagamento com alternância rápida (Quick Toggle):**
  Como usuário, quero ver um botão/selo claro em cada transação indicando se ela já foi paga/recebida ou se está pendente, e poder alternar esse status com um único clique na própria lista, para manter meu controle em dia sem atrito.
- **US-7 — Criação de conta recorrente mensal com teto de 1 ano:**
  Como usuário, quero marcar uma transação como recorrente e definir a data final (tendo como sugestão padrão 1 ano à frente), gerando automaticamente as ocorrências mensais futuras já com status `Pendente`, para planejar meu orçamento dos próximos meses sem retrabalho manual.
- **US-8 — Filtros e totalizadores de pendências:**
  Como usuário, quero filtrar transações por status de pagamento (todos, pagos/recebidos, pendentes) e ver o montante total pendente do mês, para saber exatamente quanto ainda preciso desembolsar ou receber até o final do período.
- **US-9 — Exclusão inteligente de série recorrente:**
  Como usuário, ao excluir uma transação pertencente a uma série recorrente, quero poder escolher entre excluir apenas aquele lançamento pontual ou excluir aquela e todas as ocorrências futuras da mesma série.

### Fora de escopo
- Recorrências com frequências exóticas (diária, semanal, quinzenal) neste ciclo — o foco é mensal, atendendo 99% das contas fixas pessoais.
- Atualização em lote de valor/descrição de séries passadas retroativamente.
- Integração com débito automático bancário.

## Requisitos
<!-- requirements-analyst: cada item é uma afirmação testável, sem "rápido" ou "fácil" -->

### Requisitos Funcionais
- **RF-13 (Status de Pagamento):** Toda transação deve possuir um campo `status` obrigatório com valores permitidos `'PAID'` ou `'PENDING'`. Por padrão, novas transações não recorrentes são salvas como `'PAID'`. Para despesas (`EXPENSE`), a UI exibe "Pago" ou "Pendente"; para receitas (`INCOME`), a UI exibe "Recebido" ou "Pendente".
- **RF-14 (Quick Toggle de Status na API e UI):** A API deve disponibilizar a rota `PATCH /api/transactions/:id/status` recebendo `{ status: 'PAID' | 'PENDING' }`, retornando a transação atualizada com `HTTP 200`. Na UI, a coluna de status deve conter um botão interativo com indicação textual e ícone (`✓` para pago, `⏱` para pendente), permitindo alternância com um clique e suporte total a teclado (`Enter`/`Espaço`).
- **RF-15 (Geração de Transações Recorrentes):** No cadastro de uma transação, o sistema deve permitir selecionar a opção `isRecurring` (booleano) e informar `recurrenceEndDate` (data civil `YYYY-MM-DD`). Por padrão, `recurrenceEndDate` deve ser pré-preenchida com a mesma data civil do lançamento avançada em exatamente 1 ano (12 meses). O sistema deve criar a transação inicial com o status selecionado e criar as transações subsequentes (uma para cada mês subsequente até a data final, no mesmo dia civil com ajuste para o último dia em meses mais curtos) associadas a um mesmo `recurringGroupId` e com status `'PENDING'`. O limite máximo permitido para a data final é de até 36 meses a partir da data inicial.
- **RF-16 (Filtro por Status de Pagamento):** O endpoint `GET /api/transactions` e a tela de listagem de transações devem suportar o filtro opcional `status` (`'PAID'` | `'PENDING'`).
- **RF-17 (Indicadores de Pendências do Mês):** Na visualização de transações e no resumo do período, deve ser exibido o total em centavos e a quantidade de transações pendentes a pagar e pendentes a receber do mês selecionado.
- **RF-18 (Exclusão de Séries Recorrentes):** Ao solicitar a exclusão de uma transação associada a um `recurringGroupId`, o usuário deve poder escolher entre excluir apenas a transação selecionada (`scope = 'single'`) ou excluir a selecionada e todas as futuras ocorrências da mesma série (`scope = 'following'`). A API deve suportar o parâmetro opcional `DELETE /api/transactions/:id?scope=single|following`.

### Requisitos Não Funcionais
- **RNF-7 (Integridade Transacional de Séries):** A geração de ocorrências de uma série recorrente e a exclusão de séries devem ser executadas em transação atômica (`BEGIN IMMEDIATE ... COMMIT/ROLLBACK`) no SQLite.
- **RNF-8 (Acessibilidade e Micro-interações):** Os botões de alternância de status devem possuir `aria-label` dinâmico (ex.: "Status atual: Pendente. Clique para marcar como Pago"), contraste de cores WCAG 2.2 AA (mínimo 4.5:1) e indicação de foco visual sem depender apenas da cor.
- **RNF-9 (Performance de Índices):** O banco de dados deve possuir índices cobrindo `status` e `recurring_group_id` para garantir latência p95 ≤ 200 ms mesmo com séries provisionadas.

## Critérios de aceite
<!-- requirements-analyst: Dado/Quando/Então; todo RF tem ao menos um CA -->

- **CA-26 (RF-13, RF-14):** **Dado** uma despesa com status `'PENDING'`, **Quando** o usuário acionar o botão de status na listagem de transações, **Então** o status deve mudar para `'PAID'` com rótulo "Pago", estilo verde com ícone de verificação, e a persistência deve ser confirmada no backend.
- **CA-27 (RF-13, RF-14):** **Dado** uma receita com status `'PAID'`, **Quando** o usuário acionar o botão de status, **Então** o status deve alternar para `'PENDING'` com rótulo "Pendente", e o backend deve registrar a alteração.
- **CA-28 (RF-15):** **Dado** que o usuário está criando uma transação na data `2026-10-19`, **Quando** ele marcar a opção "Conta recorrente", **Então** o campo "Recorrente até" deve vir pré-preenchido por padrão com `2027-10-19` (exatamente 1 ano para frente).
- **CA-29 (RF-15, RNF-7):** **Dado** que o usuário submete uma despesa recorrente de R$ 100,00 no dia `2026-10-15` com fim em `2027-10-15` e status `'PAID'`, **Quando** a transação for salva, **Então** o sistema deve registrar 13 transações compartilhando o mesmo `recurringGroupId`: a de outubro/2026 com status `'PAID'` e as 12 ocorrências subsequentes (novembro/2026 até outubro/2027) com status `'PENDING'`.
- **CA-30 (RF-15):** **Dado** uma conta recorrente iniciada em `2026-01-31`, **Quando** as ocorrências dos meses seguintes forem geradas, **Então** a competência de fevereiro deve ser criada no dia `2026-02-28` (ou 29 em bissextos) e abril no dia `2026-04-30`, sem pular meses nem estourar calendário civil.
- **CA-31 (RF-16, RF-17):** **Dado** uma listagem com 3 contas pagas e 2 pendentes no mês, **Quando** o usuário selecionar o filtro "Pendentes", **Então** apenas as 2 contas pendentes devem ser exibidas, e o totalizador deve exibir a soma exata dos valores pendentes.
- **CA-32 (RF-18):** **Dado** uma transação de março/2027 que faz parte de uma série que vai até outubro/2027, **Quando** o usuário excluí-la escolhendo a opção de excluir esta e as futuras, **Então** as transações de março a outubro daquele `recurringGroupId` devem ser removidas, mantendo intactas as transações anteriores (outubro/2026 a fevereiro/2027).

## Design
<!-- ux-designer: fluxos, telas e estados. ui-designer: tokens e componentes. Só referencie RF/CA por ID -->

### Fluxo de Alternância Rápida (Quick Toggle)
- Na tabela de transações, uma nova coluna **Status** posicionada com clareza.
- Botão `.btn-status-toggle`:
  - Estado `'PAID'` (Despesa): fundo `var(--color-income-bg)`, borda `var(--color-income-border)`, texto `var(--color-income-text)`, ícone `CheckIcon` + texto "Pago".
  - Estado `'PAID'` (Receita): fundo `var(--color-income-bg)`, borda `var(--color-income-border)`, texto `var(--color-income-text)`, ícone `CheckIcon` + texto "Recebido".
  - Estado `'PENDING'`: fundo `var(--color-status-warning-bg)`, borda `var(--color-status-warning-border)`, texto `var(--color-status-warning-text)`, ícone `ClockIcon` + texto "Pendente".
- Micro-animação suave no hover e feedback sonoro/tátil em navegadores suportados.

### Modal de Criação / Edição
- Seletor de Status (Segmented Button): `[ Pago / Recebido ]` e `[ Pendente ]`.
- Seção de Recorrência:
  - Checkbox toggle estilisado: `🔁 Repetir mensalmente (conta recorrente)`.
  - Ao marcar: expande com transição suave exibindo o campo de data `Recorrente até:` (padrão preenchido com data + 1 ano) e texto explicativo "Serão gerados lançamentos automáticos até a data limite".

### Resumo de Pendências no Cabeçalho da Listagem
- Barra de mini-KPIs:
  - `Pendente a Pagar: R$ X,XX` (em destaque âmbar)
  - `Pendente a Receber: R$ Y,YY` (em destaque azul/verde)

## Solução técnica e tarefas
<!-- tech-lead: decisões, contrato de API, riscos. Tarefas em fatias verticais; marque [x] ao concluir -->

### Decisões Técnicas
1. **Adição de Colunas no SQLite:**
   - `status TEXT NOT NULL DEFAULT 'PAID' CHECK (status IN ('PAID', 'PENDING'))`
   - `is_recurring INTEGER NOT NULL DEFAULT 0 CHECK (is_recurring IN (0, 1))`
   - `recurring_group_id TEXT NULL`
   - Índices: `idx_transactions_status` e `idx_transactions_recurring_group`.
2. **Geração Determinística de Recorrência em `src/shared/domain/recurrence.ts`:**
   - Função pura `generateRecurringDates(startDate: string, endDate: string)` usando a lógica civil já testada de `src/shared/domain/civil-date.ts`, respeitando dias de mês (28/29/30/31).
3. **Contratos Zod Atualizados em `src/shared/contracts/index.ts`:**
   - `transactionStatusSchema = z.enum(['PAID', 'PENDING'])`
   - Inclusão de `status`, `isRecurring`, `recurrenceEndDate`, `recurringGroupId` nos DTOs e schemas de criação/atualização.
4. **Endpoint Rápido e Seguro:**
   - `PATCH /api/transactions/:id/status` para alternância atômica sem payload redundante.
   - Suporte a `scope=single|following` no `DELETE /api/transactions/:id`.

### Tarefas
- [x] T-12: Especificação técnica e critérios de aceite (`docs/specs/recurring-and-payment-status.md`).
- [x] T-13: Domínio e Contratos (`civil-date.ts`, `recurrence.ts`, `contracts/index.ts`) com testes unitários.
- [x] T-14: Migração de banco de dados e rotas backend (`database.ts`, `transactions.ts`) com testes de integração.
- [x] T-15: Componentes e UI no Frontend (`tokens.css`, `TransactionModal.tsx`, `TransactionsView.tsx`, `DashboardView.tsx`).
- [x] T-16: Validação de acessibilidade, testes E2E/UI e verificação geral (`npm run check`).
- [x] T-17: Persistência permanente na Vercel com adaptador Neon PostgreSQL Serverless (`NeonDbAdapter`, ADR-0003).


## Riscos e questões abertas
- **Risco:** Usuário informar data final com muitos anos, gerando milhares de registros e degradando performance.
  - **Mitigação:** Validação estrita limitando a recorrência a no máximo 36 meses (3 anos), com padrão rigoroso de 12 meses (1 ano).
