# Loops de Erro — Diagnóstico Técnico e Soluções

**Data:** 28/07/2026
**Entrada:** `Relatorio-Loops-de-Erro.pdf` (análise de 8.715 mensagens)
**Escopo:** somente **erros técnicos**. Regras de negócio (valores, carências, limites, percentuais) estão **fora de escopo** e não devem ser alteradas por este trabalho.

---

## Resumo

O relatório em PDF acertou o diagnóstico de alto nível ("a mesma regra escrita em vários lugares"). Este documento confirma isso com evidência de código e acrescenta **quatro causas técnicas que o PDF não identificou**:

| # | Causa técnica | Loops afetados | Gravidade |
|---|---|---|---|
| A | `calcRepasseFull` existe **duplicado** e as duas cópias divergiram | 5 | Alta |
| B | Regra de desconto reimplementada em **4 lugares**, um deles em SQL | 2, gratuidade | Alta |
| C | Pagamento misto persistido como **texto livre** e reparseado por **3 regex diferentes** | 3 | Alta |
| D | Fronteira de dia calculada em **timezone do navegador** (`new Date().toISOString()`), 25 ocorrências | 1, 4 | Alta |
| E | Sessão de caixa escolhida **sem filtrar por operador** | 4 | Média |
| F | **Não existe runner de teste configurado** — o único teste do projeto nunca roda | todos | Crítica (habilitador) |

O item **F** é o que transforma bug em *loop*: sem teste executável, nenhuma correção fica travada, e a próxima refatoração desfaz a anterior.

---

## A — `calcRepasseFull` duplicado e divergente (Loop 5)

**Sintoma no PDF:** "o mesmo atendimento aparece com um valor na GR, outro na aba de Atendimentos e um terceiro no comprovante de repasse."

**Evidência:**

- `src/lib/repasse-calc.ts:104` — versão compartilhada, pura. Usada por `src/components/financeiro/comprovantes-tab.tsx:275`.
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx:1035` — **segunda implementação**, local, copiada e depois editada só de um lado.

**A divergência exata:** a versão de `repasse-calc.ts` tem um passo 1 que a versão local **não tem**:

```ts
// repasse-calc.ts:127-135 — EXISTE
const linhaServico = findConvenioRow(ctx, medicoId, procNome);
if (linhaServico) {
  if (ehCartaoConsulta && linhaServico.cartao_consulta_valor != null) {
    return { total: totalPago, repasse: Number(linhaServico.cartao_consulta_valor) };
  }
  if (ehCartaoDesconto && linhaServico.cartao_desconto_valor != null) {
    return { total: totalPago, repasse: Number(linhaServico.cartao_desconto_valor) };
  }
}
```

Em `app.financeiro.atendimentos.tsx` esse bloco não existe — ela pula direto para `med.cb_valor_repasse`. **Resultado determinístico:** para qualquer médico que tenha `cartao_consulta_valor` cadastrado por serviço, a aba Atendimentos mostra um valor e o comprovante mostra outro. Não é intermitente; é sempre.

Segunda divergência, no fallback por texto:

```ts
// atendimentos.tsx:1049-1052 — cartao_desconto entra em ehConvenio,
// mas o fallback textual só testa isCartaoConsultaDesc
const ehConvenio =
  modalidade === "cartao_consulta" || modalidade === "cartao_desconto" ||
  (modalidade == null && isCartaoConsultaDesc(descricao));

// repasse-calc.ts:120-123 — trata as duas modalidades separadamente
const ehCartaoConsulta = modalidade === "cartao_consulta" || (modalidade == null && isCartaoConsultaDesc(descricao));
const ehCartaoDesconto = modalidade === "cartao_desconto" || (modalidade == null && isCartaoDescontoDesc(descricao));
```

Lançamentos antigos (sem `convenio_modalidade` carimbado) com descrição "CARTÃO DESCONTO" caem em caminhos diferentes nas duas telas.

### Solução

1. **Deletar** a função local em `app.financeiro.atendimentos.tsx:1035-1127` e importar de `@/lib/repasse-calc`.
2. A tela usa índices `Map` (`convenioIdx.porNomeNorm` / `porNomeCru`) por performance. Preservar isso: estender `RepasseCtx` com um índice opcional em vez de reintroduzir a busca linear.

```ts
// src/lib/repasse-calc.ts
export interface RepasseCtx {
  medicos: RepasseMedico[];
  convenios: RepasseConvenio[];
  procTipos: Map<string, string>;
  /** Índice opcional medicoId|nomeNormalizado -> linha. Quando ausente,
   *  cai na varredura linear em `convenios`. */
  idx?: { porNomeNorm: Map<string, RepasseConvenio>; porNomeCru: Map<string, RepasseConvenio> };
}

export function buildRepasseIdx(convenios: RepasseConvenio[]): NonNullable<RepasseCtx["idx"]> {
  const porNomeNorm = new Map<string, RepasseConvenio>();
  const porNomeCru = new Map<string, RepasseConvenio>();
  for (const cv of convenios) {
    const kNorm = `${cv.medico_id}|${normRepasse(cv.nome)}`;
    if (!porNomeNorm.has(kNorm)) porNomeNorm.set(kNorm, cv);
    const kCru = `${cv.medico_id}|${cv.nome}`;
    if (!porNomeCru.has(kCru)) porNomeCru.set(kCru, cv);
  }
  return { porNomeNorm, porNomeCru };
}
```

E em `findConvenioRow`, usar `ctx.idx?.porNomeNorm.get(...) ?? convenios.find(...)`.

3. **Teste de regressão obrigatório** (`src/lib/repasse-calc.test.ts`): um caso com `cartao_consulta_valor` cadastrado por serviço, afirmando que o repasse é o valor da linha de serviço — é exatamente o caso que a cópia divergente errava.

4. **Trava contra reincidência** — regra ESLint que impede reintroduzir a cópia:

```js
// eslint.config.js
{
  files: ["src/routes/**", "src/components/**"],
  rules: {
    "no-restricted-syntax": [
      "error",
      {
        selector: "VariableDeclarator[id.name=/^calc(Repasse|RepasseFull)$/][init.type=/FunctionExpression|ArrowFunctionExpression/]",
        message: "Cálculo de repasse só em src/lib/repasse-calc.ts. Importe calcRepasseFull.",
      },
    ],
  },
}
```

---

## B — Regra de desconto do convênio reimplementada em 4 lugares (Loop 2)

**Sintoma no PDF:** "o paciente tem direito a 50% (ou 5%, ou gratuidade), mas o sistema calcula outro valor."

**As quatro implementações:**

| Onde | Faz carência? | Faz limite/cota? | Faz excedente? | Faz grupo_gratuidade? |
|---|---|---|---|---|
| `src/lib/cb-regras.ts` (`findRegra` + `computeValor`) | `carenciaCumprida` exposta, mas **não aplicada** dentro | não | não | não |
| `app.agenda.tsx:614-1200` (`obterInfoConvenioPaciente`) | sim | sim | sim | sim |
| `fila_caixa_hoje` (SQL, migration `20260714134127`) | sim (adicionado em 14/07) | **não** — ignora regras com `limite_qtd` | não | não |
| `app.procedimentos.tsx:543`, `add-to-orcamento-dialog.tsx:225`, `regras-tab.tsx:999` | não | não | não | não |

O comentário da própria migration `20260714134127_...sql` documenta o problema:

> "a fila do Caixa escolhia uma regra e aplicava o desconto direto, sem checar `carencia_mensalidades` nem `limite_qtd` — diferente do resto do sistema"

Ou seja: em julho já houve uma correção que **sincronizou uma das quatro cópias**. As outras três continuaram divergentes. É a mecânica do loop, literalmente registrada no histórico de migrations.

`cb-regras.ts` expõe `carenciaCumprida` como função separada, então **cada chamador precisa lembrar de chamá-la** — `app.procedimentos.tsx` e `add-to-orcamento-dialog.tsx` não chamam.

### Solução

O ponto delicado: a lógica completa mora em `app.agenda.tsx` e depende de I/O (contrato, mensalidades pagas, contagem de usos no período). Não dá para mover tudo para uma função pura de uma vez sem risco.

**Estratégia em duas camadas, sem tocar em regra de negócio:**

**Camada 1 — decisão pura, testável.** Extrair de `app.agenda.tsx` a parte que é só cálculo, recebendo os fatos já carregados. Zero mudança de comportamento: é recorte, não reescrita.

```ts
// src/lib/convenio/decidir-beneficio.ts
export interface FatosBeneficio {
  regras: CbRegra[];
  especialidadesCandidatas: (string | null)[];
  procedimentoId: string | null;
  procedimentoTipo: string | null;
  mensalidadesPagas: number;
  isRenovacao: boolean;
  usosNoPeriodo: number;          // já contado por quem chama
  baseDinheiro: number;
  baseOutros: number;
}

export interface DecisaoBeneficio {
  regra: CbRegra | null;
  valorDinheiro: number;
  valorOutros: number;
  motivo: "aplicado" | "carencia" | "limite_esgotado" | "sem_regra";
  aviso?: string;
}

export function decidirBeneficio(f: FatosBeneficio): DecisaoBeneficio { /* lógica movida de app.agenda.tsx */ }
```

Os *fatos* continuam sendo carregados por cada tela (I/O fica onde está). A **decisão** passa a ser única.

**Camada 2 — o SQL não reimplementa nada.** `fila_caixa_hoje` deve parar de calcular desconto. Ela é uma tela de *fila*, não de cobrança. Duas opções, em ordem de preferência:

- **Preferida:** `fila_caixa_hoje` retorna só o preço particular + `tem_convenio boolean`. A tela mostra "valor a confirmar" e o valor final vem de `decidirBeneficio` no cliente, igual à Agenda. Elimina a terceira implementação de vez.
- **Se o pré-preenchimento for requisito de operação:** manter o SQL, mas marcar `desconto_origem = 'estimado'` e a tela exibir o valor como estimativa não-confirmável, forçando o operador a passar pelo caminho canônico.

**Trava contra reincidência:** teste em `decidir-beneficio.test.ts` com uma tabela de casos cobrindo as combinações carência × limite × excedente × gratuidade. Cada bug novo vira uma linha nessa tabela.

> Os **valores** das regras (50%, 5%, R$ 9,99, carências) continuam vindo de `cb_convenio_regras` — este trabalho não os toca. Ver `cartao_consulta_seguros_regras.md` para o gabarito de negócio.

---

## C — Pagamento misto como texto livre, reparseado por 3 regex (Loop 3)

**Sintoma no PDF:** "em alguns relatórios ele agrupa tudo como 'misto'."
**Padrão que o PDF nomeou:** "informação importante guardada dentro de um texto de observação".

**Como é gravado** — `src/components/financeiro/lancamento-dialog.tsx:474`:

```ts
formaFinal = "misto";
obsExtra = "Pagamento misto: " + validIdx.map(...).join("; ");
// vira: "Pagamento misto: Dinheiro R$ 60,00; PIX R$ 50,00"
// e é concatenado com desconto/cortesia em obsFinal, separado por " | "
```

Não existe nenhuma tabela de partes de pagamento no schema (`grep fin_lancamento_formas|lancamento_pagamentos` → 0 resultados). A composição do pagamento **só existe dentro de uma string de observação**.

**Os três parsers, todos diferentes:**

| Local | Regex do valor | Rótulos desconhecidos | Valida a soma? |
|---|---|---|---|
| `app.financeiro.movimento.tsx:71` | `/R\$\s*([\d.,]+)/i` | ignora a parte | **sim** (`> 0.05` → descarta a decomposição) |
| `print-gr.ts:639` | `/R\$\s*([\d.]+,\d{2})/` — **exige 2 decimais** | ignora a parte, **silenciosamente** | **não** |
| `app.caixa.tsx:94` | `/pagamento\s+misto\s*:/i` + parser próprio | — | — |

Consequências concretas:

- `print-gr.ts` descarta partes cujo rótulo não bate na sua lista fixa `LABEL_TO_KEY` (linha 622) **sem validar a soma** — a GR pode imprimir um detalhamento que não fecha com o total.
- Qualquer mudança no rótulo (`FORMAS_LABEL`) ou no separador `" | "` quebra os três parsers ao mesmo tempo, e não há teste que perceba.
- `app.relatorios.tsx` e `components/relatorios/CuboBI.tsx` **não têm nenhum parser** — por isso agrupam tudo como "misto". É exatamente a queixa do relatório.

### Solução

**Passo 1 — dar um campo próprio ao dado.** Coluna JSONB no lançamento, escrita na mesma transação da RPC que já existe:

```sql
alter table public.fin_lancamentos
  add column if not exists formas_detalhe jsonb;

comment on column public.fin_lancamentos.formas_detalhe is
  'Composição do pagamento misto: [{forma, valor, bandeira, parcelas, recebido, troco}]. '
  'Fonte da verdade — observacoes passa a ser apenas texto para humanos.';

-- invariante: a soma das partes é o valor do lançamento
alter table public.fin_lancamentos
  add constraint fin_lancamentos_formas_detalhe_soma check (
    formas_detalhe is null
    or abs(
         (select coalesce(sum((e->>'valor')::numeric), 0)
            from jsonb_array_elements(formas_detalhe) e)
         - valor
       ) <= 0.01
  );
```

O `CHECK` é o ponto central: **o banco passa a recusar** um misto cuja composição não fecha. Hoje isso passa silencioso.

**Passo 2 — backfill dos históricos.** Rodar o parser mais tolerante (o de `movimento.tsx`, que valida a soma) uma única vez sobre os registros antigos, populando `formas_detalhe`. Quem não parsear fica `null` e continua caindo no fallback textual.

**Passo 3 — um único leitor.**

```ts
// src/lib/financeiro/formas-pagamento.ts
export interface ParteForma { forma: string; valor: number; bandeira?: string | null; parcelas?: number | null; }

/** Único ponto de leitura da composição de um pagamento.
 *  Prefere `formas_detalhe`; só cai no texto para lançamentos anteriores ao backfill. */
export function lerFormas(l: {
  forma_pagamento: string | null;
  valor: number;
  formas_detalhe?: unknown;
  observacoes?: string | null;
}): ParteForma[] { /* ... */ }
```

Substituir os três parsers por chamadas a `lerFormas`. Depois **adicionar** a chamada em `app.relatorios.tsx` e `CuboBI.tsx`, que hoje não têm nenhuma — é o que faz o "misto" sumir dos relatórios.

**Passo 4 — trava.** ESLint `no-restricted-syntax` proibindo o literal `"Pagamento misto:"` fora de `lancamento-dialog.tsx` (escrita) e `formas-pagamento.ts` (fallback).

---

## D — Fronteira de dia em timezone do navegador (Loops 1 e 4)

Este é o item que o PDF não identificou, e é o que explica o comportamento **intermitente** — "às vezes mostra dias errados, às vezes fica em branco".

**Evidência — `app.agenda.tsx:2258`:**

```ts
if (apenasData) {
  const inicio = new Date(`${dataRef}T00:00:00`).toISOString();
  const fim    = new Date(`${dataRef}T23:59:59`).toISOString();
  q = q.gte("inicio", inicio).lte("inicio", fim);
}
```

Três defeitos distintos no mesmo bloco:

1. **`new Date("2026-07-24T00:00:00")` é interpretado no fuso do runtime, não da clínica.** `agendamentos.inicio` é `timestamptz`. O projeto é TanStack Start com `@cloudflare/vite-plugin` — o SSR roda em Worker, cujo fuso é **UTC**. Cliente (BRT, UTC-3) e servidor (UTC) produzem janelas deslocadas em 3 horas para o mesmo `dataRef`. Agendamentos entre 00:00 e 03:00 entram/saem conforme quem executou o cálculo.

2. **`.lte(fim)` com `23:59:59` perde a última fração de segundo** — qualquer registro em `23:59:59.001`–`23:59:59.999` desaparece. Raro, mas é perda silenciosa de dado.

3. **O padrão se repete em 25 lugares** (`grep -c 'T00:00:00\`).toISOString()'`), incluindo `app.painel.tsx`, `app.checkin.tsx`, `app.auditoria.tsx`, `app.painel-executivo.tsx`. Cada tela pode discordar sobre onde o dia começa.

**No lado SQL, o mesmo problema com história relevante.** `fila_caixa_hoje` (migration `20260714134127`, linhas 40-41):

```sql
and a.inicio >= _data::timestamptz
and a.inicio <  (_data + 1)::timestamptz
```

`_data::timestamptz` resolve no fuso da sessão do banco. Em `20260726012207_...sql` (26/07) foi aplicado:

```sql
ALTER ROLE authenticated SET timezone = 'America/Sao_Paulo';  -- + anon, service_role, postgres, authenticator
```

**Antes dessa migration a sessão era UTC** — a janela do dia no SQL estava deslocada em 3h. As datas de reporte do Loop 4 (16/07, 21/07, 24/07×2) e do Loop 1 (16/07, 23/07, 24/07) são **todas anteriores a 26/07**. Isso é forte indício de que o timezone é a causa dos episódios recentes.

**Mas a correção de 26/07 é frágil**, e por isso o loop pode voltar:

- É um GUC de *role*, aplicado no login da conexão. Não é um `SET` dentro das funções.
- `fn_registrar_lancamento_e_caixa` é `SECURITY DEFINER` com `SET search_path TO 'public'` mas **sem** `SET timezone`. Depende inteiramente do GUC global.
- Qualquer caminho que não passe pelas roles listadas (edge function com conexão direta, pooler em modo transaction, migration rodada por outro papel, restore de backup) volta a UTC sem aviso.
- **O lado cliente não foi corrigido** — as 25 ocorrências de `new Date(...).toISOString()` continuam usando o fuso do runtime.

Dentro da própria RPC, mais uma inconsistência — `fn_registrar_lancamento_e_caixa`:

```sql
v_hoje       date := CURRENT_DATE;                                   -- fuso da sessão
v_retroativo := v_data_lanc < v_hoje;
...
v_ts_mov     := (v_data_lanc::text || ' 12:00:00+00')::timestamptz;  -- UTC hardcoded → 09:00 BRT
```

Com sessão em UTC, um lançamento feito às 21:30 BRT com `data` = hoje era classificado como **retroativo** (porque `CURRENT_DATE` em UTC já era o dia seguinte) e caía no ramo de sessão retroativa. É precisamente "o valor aparece na sessão de caixa de outra pessoa, ou some do dia certo".

### Solução

**1. Fuso explícito no SQL, não herdado.** Adicionar `SET timezone TO 'America/Sao_Paulo'` na declaração de toda função que faça fronteira de dia — a mesma linha onde já existe `SET search_path`:

```sql
create or replace function public.fila_caixa_hoje(...)
returns table(...)
language plpgsql stable
set search_path to 'public'
set timezone to 'America/Sao_Paulo'   -- <<< passa a ser explícito
as $function$ ...
```

Aplicar em `fn_registrar_lancamento_e_caixa` e nas demais que usam `CURRENT_DATE` ou `_data::timestamptz`. Mantém o `ALTER ROLE` como rede secundária, mas para de depender só dele.

**2. Trocar `::timestamptz` por conversão explícita:**

```sql
-- em vez de: a.inicio >= _data::timestamptz
and a.inicio >= (_data::timestamp AT TIME ZONE 'America/Sao_Paulo')
and a.inicio <  ((_data + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo')
```

Esta forma já é usada corretamente na migration `20260704160846` (geração de slots) — é só padronizar. Repare que já é meio-aberto `[início, fim)`, o que também resolve o buraco de `23:59:59`.

**3. Um único helper no cliente.** Criar em `src/lib/date-utils.ts` (o arquivo já existe):

```ts
export const TZ_CLINICA = "America/Sao_Paulo";

/** Janela [início, fim) de um dia civil da clínica, em ISO/UTC — independente
 *  do fuso do runtime (navegador ou Worker SSR). */
export function janelaDiaClinica(dataYYYYMMDD: string): { inicio: string; fimExclusivo: string } {
  const inicio = zonedDateToUtcISO(dataYYYYMMDD, TZ_CLINICA);
  const [y, m, d] = dataYYYYMMDD.split("-").map(Number);
  const prox = new Date(Date.UTC(y, m - 1, d + 1));
  const fimExclusivo = zonedDateToUtcISO(prox.toISOString().slice(0, 10), TZ_CLINICA);
  return { inicio, fimExclusivo };
}
```

`zonedDateToUtcISO` via `Intl.DateTimeFormat` com `timeZone: TZ_CLINICA` (sem dependência nova), ou `date-fns-tz` se preferir. Nos consumidores:

```ts
const { inicio, fimExclusivo } = janelaDiaClinica(dataRef);
q = q.gte("inicio", inicio).lt("inicio", fimExclusivo);   // .lt, não .lte
```

**4. Trava.** ESLint proibindo `new Date(...).toISOString()` em expressões com template de data dentro de `src/routes` e `src/components`:

```js
{
  selector: "CallExpression[callee.property.name='toISOString'][callee.object.callee.name='Date'][callee.object.arguments.0.type='TemplateLiteral']",
  message: "Fronteira de dia deve usar janelaDiaClinica() de @/lib/date-utils — toISOString() usa o fuso do runtime (UTC no SSR Cloudflare).",
}
```

Com essa regra as 25 ocorrências viram erros de lint e são migradas uma a uma.

---

## E — Sessão de caixa escolhida sem filtrar por operador (Loop 4)

**Evidência — `src/components/orcamentos/conversao-orcamento-dialog.tsx:183`:**

```ts
// o comentário na linha 177 diz "sessão de caixa aberta do usuário"
supabase.from("caixa_sessoes")
  .select("id")
  .eq("clinica_id", clinicaId)
  .eq("status", "aberto")
  .order("aberto_em", { ascending: false })
  .limit(1)
  .maybeSingle(),
```

Não há `.eq("user_id", user.id)`. Pega a sessão aberta **mais recente da clínica inteira**. Com dois operadores de caixa abertos simultaneamente, a conversão de orçamento cai na sessão de quem abriu por último. É literalmente "o valor aparece na sessão de caixa de outra pessoa".

A RPC `fn_registrar_lancamento_e_caixa` faz certo (`AND user_id = v_user_id`, linha 77) — mais um caso de dois caminhos para a mesma decisão, só que um deles errado.

Problema relacionado, no ramo retroativo da mesma RPC (linhas 113-118):

```sql
WHERE clinica_id = v_clinica_id AND user_id = v_user_id
  AND (aberto_em::date <= v_data_lanc
       AND (fechado_em IS NULL OR fechado_em::date >= v_data_lanc))
ORDER BY aberto_em DESC LIMIT 1
```

`fechado_em IS NULL` casa com **qualquer** data passada: um operador com sessão aberta absorve lançamentos retroativos de qualquer dia anterior. E `aberto_em::date` sofre do mesmo problema de fuso do item D.

### Solução

1. Adicionar `.eq("user_id", user.id)` em `conversao-orcamento-dialog.tsx:183`. Correção de uma linha.
2. **Melhor ainda:** essa tela não deveria escolher sessão. Passar a chamar `fn_registrar_lancamento_e_caixa`, que já resolve sessão corretamente e de forma atômica. Elimina o caminho paralelo.
3. No ramo retroativo da RPC, restringir a janela para não deixar sessão aberta capturar datas arbitrárias:
   ```sql
   AND (fechado_em IS NOT NULL OR aberto_em::date = v_data_lanc)
   ```
4. Trava: teste pgTAP com dois operadores e duas sessões abertas, afirmando que o movimento cai na sessão do autor.

---

## F — Não existe runner de teste (habilitador de todos os loops)

Este é o achado mais importante, e o PDF só o descreve indiretamente ("precisamos de um teste automático para cada erro que já voltou").

**Estado atual:**

```
Arquivos de teste no projeto:  1   (src/lib/agenda/aviso-limite-pendentes.test.ts)
Script "test" em package.json: ausente
vitest / jest / playwright:    nenhum instalado
CI:                            nenhum workflow
```

O único teste usa `import { describe, expect, it } from "bun:test"` e o projeto tem `bun.lock` + Bun 1.3.14 instalado — ou seja, **o teste funciona, mas nada o executa**. Ele nunca roda em nenhum momento do fluxo de trabalho.

Sem isso, toda a "rede de segurança" proposta no PDF (seção 7.2 — teste por erro, paciente-âncora, checklist) é inaplicável: não há onde pendurar os testes.

### Solução — este é o primeiro passo, antes de qualquer correção

```json
// package.json
"scripts": {
  "test": "bun test",
  "test:watch": "bun test --watch",
  "typecheck": "tsc --noEmit"
}
```

```yaml
# .github/workflows/ci.yml
name: CI
on: [push, pull_request]
jobs:
  verificar:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: oven-sh/setup-bun@v2
      - run: bun install --frozen-lockfile
      - run: bun run lint
      - run: bun run typecheck
      - run: bun test
```

**Os testes-âncora**, um por loop, todos sobre funções puras (sem banco, rodam em milissegundos):

| Arquivo | Trava |
|---|---|
| `src/lib/repasse-calc.test.ts` | mesmo insumo → mesmo repasse nos 3 pontos de exibição (Loop 5) |
| `src/lib/convenio/decidir-beneficio.test.ts` | tabela carência × limite × excedente × gratuidade (Loop 2) |
| `src/lib/financeiro/formas-pagamento.test.ts` | soma das partes = total; rótulo desconhecido não some silenciosamente (Loop 3) |
| `src/lib/date-utils.test.ts` | `janelaDiaClinica` dá o mesmo resultado com `TZ=UTC` e `TZ=America/Sao_Paulo` (Loops 1 e 4) |

O teste de fuso é o mais barato e o de maior retorno:

```ts
import { describe, expect, it } from "bun:test";
import { janelaDiaClinica } from "./date-utils";

describe("janelaDiaClinica", () => {
  it("independe do fuso do runtime", () => {
    // roda o mesmo cálculo como se fosse Worker (UTC) e navegador (BRT)
    const emUTC = withTZ("UTC", () => janelaDiaClinica("2026-07-24"));
    const emBRT = withTZ("America/Sao_Paulo", () => janelaDiaClinica("2026-07-24"));
    expect(emUTC).toEqual(emBRT);
    expect(emUTC.inicio).toBe("2026-07-24T03:00:00.000Z");
  });
});
```

Esse teste **falha hoje** com o código atual de `app.agenda.tsx`. É a definição de teste-âncora.

---

## Ordem recomendada

Ordem diferente da sugerida no PDF, porque leva em conta custo técnico e dependências:

| # | Ação | Esforço | Por quê nesta posição |
|---|---|---|---|
| 0 | ✅ **F** — `bun test` + CI + `janelaDiaClinica` com teste | ~2h | Sem isso nada trava. Habilita todo o resto. **Feito em 28/07** — ver nota abaixo. |
| 1 | **E** — `.eq("user_id")` na conversão de orçamento | 15min | Uma linha, corrige perda de dinheiro em sessão errada. |
| 5.5 | **G** (novo, achado ao fazer o item 0) — renormalizar CRLF→LF no checkout | 5min (opcional) | Não bloqueia nada; ver nota abaixo. |
| 2 | **A** — deletar `calcRepasseFull` duplicado | ~3h | Divergência determinística, não intermitente. Recorte mecânico, risco baixo. |
| 3 | **D** — `janelaDiaClinica` + `SET timezone` nas funções SQL | ~1 dia | Resolve Loop 1 e metade do Loop 4 de uma vez. |
| 4 | **C** — `formas_detalhe` jsonb + `CHECK` + leitor único | ~2 dias | Precisa de migration + backfill; o `CHECK` impede recaída. |
| 5 | **B** — `decidirBeneficio` + tirar o cálculo do SQL | ~3 dias | Maior valor, maior risco. Fazer por último, já com rede de teste montada. |

O PDF sugere começar pelo desconto do Cartão Consulta (item B aqui). **Recomendo o contrário:** B é o mais arriscado e o único que encosta perto de regra de negócio. Fazendo os itens 0–4 primeiro, chega-se em B com CI verde, teste-âncora e fuso estabilizado — muito menor chance de a correção de B ser desfeita depois.

---

---

## Nota de implementação — item 0 (feito em 28/07)

Executado exatamente como planejado, com um achado extra:

- **`src/lib/date-utils.ts`** — adicionadas `TZ_CLINICA`, `zonedDateStringToUtcISO` e `janelaDiaClinica`: calculam a fronteira de um dia civil em `America/Sao_Paulo` via `Intl.DateTimeFormat` com `timeZone` explícito, sem depender do fuso do runtime que executa o código nem de biblioteca externa. É o helper que os itens 3 e além vão usar para substituir as 25 ocorrências de `new Date(\`${data}T00:00:00\`).toISOString()`.
- **`src/lib/date-utils.test.ts`** — teste-âncora dos Loops 1 e 4: fronteira correta, contiguidade entre dias, virada de mês/ano, e prova de que o resultado não muda com o fuso do runtime (só com o parâmetro `timeZone` explícito).
- **`package.json`** — scripts `test` (`bun test`), `test:watch` e `typecheck` (`tsc --noEmit`).
- **`.github/workflows/ci.yml`** — roda lint + typecheck + test em toda `push`/`pull_request`.
- **Verificação:** `bun run test` → 26 pass (20 do teste pré-existente + 6 novos). `bun run typecheck` → limpo.

### Achado extra — G: `bun run lint` falha localmente por causa do checkout, não do código

Rodar `bun run lint` nesta máquina retorna **129.085 problemas**. Investigado antes de assumir que era um problema real:

- Verificação por bytes crus do blob (`git cat-file -p HEAD:vite.config.ts | od -An -tx1`): **zero** ocorrências de `0d0a` (CRLF) no conteúdo versionado — só `0a` (LF), 15 vezes, uma por linha.
- O checkout local desta máquina tem `core.autocrlf=true` (`git config --get core.autocrlf`), que converte todo arquivo para CRLF ao dar checkout. O `.prettierrc` do projeto não define `endOfLine` (padrão = `"lf"`). Resultado: Prettier vê CRLF onde só deveria haver LF e marca erro em **toda linha de praticamente todo arquivo**.
- No CI (`ubuntu-latest`, sem `autocrlf`), o checkout do `actions/checkout@v4` produz LF igual ao blob — a mesma classe de erro não deve reaparecer lá. O workflow de CI já criado mantém `lint` no pipeline por isso.
- Parte do total também vinha de `tmp/prontuario/*.mjs` — scripts de scratch **não versionados** (`git status` já os mostrava como `??`), que não existem em um checkout limpo e portanto não afetam o CI.

**Ações tomadas (não alteram nenhum arquivo de código do produto):**

- **`.gitattributes`** (novo) — `* text=auto eol=lf`, para que qualquer clone futuro (em qualquer SO) resulte em LF, independente do `core.autocrlf` de quem clonou. Resolve a causa, não so o sintoma no CI.
- **`.gitignore`** — adicionado `/tmp/`, `/output/`, `/outputs/` (pastas de scratch que já existiam sem estar ignoradas — risco de alguém commitar por engano com `git add -A`).

**Não feito, e por quê:** renormalizar os arquivos já commitados (`git add --renormalize .`) para LF nesta máquina. Isso tocaria em centenas de arquivos versionados de uma vez só — um diff enorme e completamente fora do escopo de "corrigir loops de erro". Fica como ação opcional (item G da tabela acima), a critério do usuário, com este comando:

```bash
git add --renormalize .
git status   # revisar antes de commitar — deve mostrar só mudança de whitespace
```

---

## Fora de escopo — não alterar

Conforme instrução, nada aqui toca em:

- Valores, percentuais, carências e limites em `cb_convenio_regras` — ver `cartao_consulta_seguros_regras.md`.
- `CONSULTA 2` e `ACIDO URICO (2)` — exceções legítimas, não duplicatas.
- Loop 6 (odontograma) — o próprio PDF classifica como ajuste de design, não regressão. Confirmado: está estável.
- Regras de repasse por médico/serviço — o item A **unifica o cálculo**, sem mudar nenhum valor cadastrado.
