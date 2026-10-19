# 0003. Adaptador Neon PostgreSQL Serverless para Persistência na Vercel

## Status
Aceito

## Contexto
Na Vercel, o ambiente de funções serverless é efêmero (`/tmp` é limpo entre execuções e instâncias não compartilham estado). O banco SQLite local em arquivo não persiste dados após reciclagem de pods ou cold starts. Ao conectar a aplicação ao banco de dados Neon na Vercel, as variáveis `DATABASE_URL` e `POSTGRES_URL` são injetadas no ambiente.

Para manter a consistência e integridade das informações salvas pelo usuário, o sistema precisava persistir os dados no banco Neon em produção na Vercel, ao mesmo tempo em que preserva a velocidade dos testes automatizados e o desenvolvimento local offline usando SQLite em memória / WAL.

## Decisão
Implementamos a interface de abstração assíncrona `DbAdapter` (`src/server/db/database.ts`):
- `NeonDbAdapter`: utiliza o driver oficial `@neondatabase/serverless` via HTTP sem estado, ativado automaticamente quando `DATABASE_URL`, `POSTGRES_URL`, `POSTGRES_PRISMA_URL` ou `POSTGRES_URL_NON_POOLING` estiverem presentes.
- `SqliteDbAdapter`: encapsula `node:sqlite` para desenvolvimento local e suíte de testes ultrarrápida (`:memory:`).
- `translateSqlToPostgres`: traduz placeholders posicionais `?` para `$1, $2, ...`, ignora strings literais e remove sintaxes exclusivas do SQLite (`COLLATE NOCASE`).
- Migrações e esquemas idempotentes (`POSTGRES_SCHEMA_SQL` com `CREATE TABLE IF NOT EXISTS` e `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`) executados no hook `onReady` do Fastify.

## Consequências
### Positivas
- Todas as operações de criação, alteração, alternância de status e exclusão persistem permanentemente no Neon PostgreSQL na Vercel.
- O driver Neon HTTP opera sem pool de conexões com vazamento em lambdas serverless.
- Zero regressão no ambiente de desenvolvimento local e testes (`npm run check` permanece 100% verde e executa em segundos).

### Negativas / Mitigações
- Módulos do backend operam de forma assíncrona (`await db.query(...)`), padrão já nativo do Fastify.
