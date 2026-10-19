# 0002. Representação Monetária em Centavos Inteiros e Datas Civis ISO (`YYYY-MM-DD`)

Status: aceita

## Contexto
Sistemas financeiros pessoais sofrem frequentemente com duas classes de bugs críticos:
1. **Imprecisão de ponto flutuante IEEE 754 (`double`/`float`):** operações como `0.1 + 0.2 === 0.30000000000000004` ou `(799.90 / 1000) * 100` geram erros de arredondamento no saldo líquido (`RF-10`) e na classificação de limites de orçamento (`RF-12`, ex.: fronteira exata entre `79,99%` `NORMAL` e `80,00%` `WARNING` nos critérios `CA-23` e `CA-24`).
2. **Deslocamento de dia/mês por fuso horário (*Timezone Shift*):** converter uma data de lançamento como `"2026-10-01"` via `new Date("2026-10-01")` interpreta o valor como `2026-10-01T00:00:00.000Z` (UTC), que no fuso `America/Sao_Paulo` (`UTC-3`) retrocede para `2026-09-30 21:00`, alocando a transação no mês errado (`CA-13`, `Q-1`).

## Decisão
1. **Valores Monetários Exclusivamente em Centavos Inteiros (`amountCents`, `limitCents`):**
   - No banco de dados (`INTEGER`), nos payloads JSON da API e em toda a camada de domínio, valores monetários são representados como inteiros seguros (`Number.isSafeInteger`, de `1` a `99999999999` centavos para lançamentos e limites).
   - A conversão para string formatada (`Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })`) ocorre exclusivamente na borda de apresentação (UI), e a entrada do usuário converte dígitos numéricos diretamente para centavos inteiros (`"4590"` -> `4590` -> `R$ 45,90`).
   - O cálculo de percentual de uso do orçamento (`RF-12`) usa aritmética determinística de ponto fixo sobre centavos: `Math.round((spentCents * 10000) / limitCents) / 100`, garantindo 2 casas decimais exatas sem ruído binário.
2. **Datas de Transação como Datas Civis (`YYYY-MM-DD`) + Competência (`year`, `month`) Explícita:**
   - O campo `date` de uma transação representa uma data civil local no formato `YYYY-MM-DD`, validada por parser estrito de calendário (rejeitando datas inexistentes como `2026-02-30`) sem instanciar timestamps UTC para cálculos de dia/mês.
   - Os inteiros `year` (`2000..2100`) e `month` (`1..12`) são extraídos diretamente da string `YYYY-MM-DD` e armazenados em colunas indexadas na tabela `transactions`, garantindo que filtros de competência (`RF-8`, `RF-10`) nunca dependam do timezone do servidor ou do navegador.

### Alternativas Descartadas
- **`DECIMAL` / `NUMERIC` ou `FLOAT` no SQLite:** o SQLite armazena `NUMERIC` com afinidade flutuante de 8 bytes (`REAL`) se possuir casas decimais, reintroduzindo imprecisão IEEE 754; armazenar `INTEGER` em centavos é nativo, exato e rápido no SQLite.
- **Timestamps ISO-8601 completos (`YYYY-MM-DDTHH:mm:ssZ`) para a data da transação:** descartado para o campo `date` do lançamento porque o usuário pensa em data civil do evento ("gastei no dia 15/10/2026"), e não em instante UTC. Timestamps ISO completos são usados apenas nos metadados de auditoria (`created_at`, `updated_at`).

## Consequências
- **Ganhos:**
  - Zero erro de arredondamento em somas, saldos e fronteiras de alerta (`79.99%` vs `80.00%` vs `100.01%`).
  - Zero deslocamento de dia ou mês entre servidor (UTC em containers cloud) e cliente (`America/Sao_Paulo` ou qualquer outro fuso).
  - Consultas de competência (`WHERE year = ? AND month = ?`) usam índices inteiros diretos no SQLite (`RNF-4`).
- **Custos:**
  - Qualquer novo endpoint ou componente precisa respeitar o sufixo `Cents` nos campos monetários e usar os utilitários de `src/shared/domain/money.ts` e `src/shared/domain/civil-date.ts`.
