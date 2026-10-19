# Personal Finance MVP

Segue o Padrão de Engenharia do plugin `software-team`. Este arquivo só registra o que é específico deste projeto. Mantenha curto: cada linha consome contexto do agente.

## Stack (versões fixadas)
- Runtime: Node.js `>=22.12.0` (TypeScript ESM)
- Backend: `fastify` + `@fastify/cookie` + `@fastify/static` + SQLite (`node:sqlite` / `better-sqlite3` em modo WAL)
- Contratos e Validação: `zod`
- Frontend: `react` + `react-dom` + `vite` + CSS Tokens semânticos (WCAG 2.2 AA, zero libs de gráficos pesadas)
- Qualidade: `@biomejs/biome`, `typescript` (`tsc --noEmit`), `knip`, `jscpd`, `vitest`

## Estrutura
- `docs/specs/personal-finance-mvp.md`: especificação única da verdade (`RF`, `RNF`, `CA`, design e tarefas `T-1..T-11`).
- `docs/adr/`: decisões arquiteturais (`0001` monolito + SQLite WAL; `0002` centavos inteiros + datas civis).
- `src/shared/contracts/`: schemas Zod e tipos compartilhados entre backend e frontend (nunca duplique tipos).
- `src/shared/domain/`: regras puras de moeda em centavos (`money.ts`), datas civis `YYYY-MM-DD` (`civil-date.ts`) e classificação de metas (`budget-status.ts`).
- `src/server/`: app Fastify (`app.ts`), banco SQLite/migrations/seed (`db/`) e módulos por feature (`modules/`).
- `src/client/`: SPA React (`features/`, `components/`, `styles/tokens.css`).

## Comandos
- `check`: `npm run check` (executa Biome format/lint, `tsc --noEmit`, `knip`, `jscpd` e `vitest run` — obrigatório antes de qualquer commit)
- `dev`: `npm run dev` (inicia servidor Fastify + Vite em modo desenvolvimento)
- `build`: `npm run build` (compila frontend e backend para produção em `dist/`)
- `start`: `npm start` (executa o servidor monolítico em produção servindo API + SPA)

## Convenções locais
- Valores monetários são sempre inteiros em centavos (`*Cents`) do banco até a borda da UI (`RNF-1`, ADR-0002).
- Datas de transações são datas civis `YYYY-MM-DD` manipuladas sem `new Date(isoString)` com shift de timezone (ADR-0002).
- Unicidade de nome de categoria por tipo usa a coluna `name_normalized` (`trim().toLocaleLowerCase('pt-BR')`) para suportar acentuação (`CA-8`).
- Todo valor numérico financeiro, percentual ou data exibido na UI deve aplicar a classe `.tabular-nums` (`font-variant-numeric: tabular-nums`).
