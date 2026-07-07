# Multi-exame + contagem por categoria de procedimento

## Fonte da verdade: `procedimentos.tipo_procedimento`

Já existe hoje com CHECK: `consulta | exame | laboratorio | procedimento | cirurgia | equipamento | vacina | telemedicina`.

Ajuste **mínimo** no CHECK: adicionar `imagem`. Fica:
`consulta | exame | laboratorio | imagem | procedimento | cirurgia | equipamento | vacina | telemedicina`.

Mantemos `exame` como valor legado (procedimentos antigos que ninguém reclassificou continuam funcionando — caem em "cada um = 1 atendimento", mesma regra de imagem).

Categorias que o usuário pediu mapeadas 1:1:
- **laboratório** → `tipo_procedimento = 'laboratorio'`
- **imagem** → `tipo_procedimento = 'imagem'`
- **consulta** → `tipo_procedimento = 'consulta'`
- **procedimento** → `tipo_procedimento = 'procedimento'`
- **cirurgia** → `tipo_procedimento = 'cirurgia'`

## Migration (aguarda aprovação separada)

1. `ALTER TABLE procedimentos DROP CONSTRAINT procedimentos_tipo_procedimento_check`
2. Recria o CHECK incluindo `'imagem'`.
3. Backfill best-effort para `tipo_procedimento IS NULL`:
   - nome contém `raio-x|raio x|rx |tomograf|ultrass|usg|ressonan|mamograf|densitomet` → `'imagem'`
   - nome contém `hemograma|glicemia|colesterol|urina|fezes|coleta` **ou** grupo contém `laborat` → `'laboratorio'`
   - resto → mantém NULL (não força classificação).

Sem toque em: cobranças, pagamentos, NFS-e, GR/guia, contratos, cartão benefícios, financeiro. **Nenhum trigger, nenhuma RLS, nenhuma flag de QA.**

Rollback: recolocar o CHECK antigo (o backfill vira dado válido nele porque só adicionamos rótulos).

## Código

### Novo helper: `src/lib/procedimento/categoria.ts`

```ts
export type CategoriaProc = "laboratorio" | "imagem" | "consulta"
  | "procedimento" | "cirurgia" | "outro";

export function categoriaDoProcedimento(tipo: string | null): CategoriaProc;
export function permiteMultiExame(cat: CategoriaProc): boolean;   // true p/ laboratorio+imagem
export function contaComoUmAtendimento(cat: CategoriaProc): boolean; // true p/ laboratorio
```

### Refactor: `src/lib/agenda/contagem.ts`

Troca a heurística "especialidade contém laborat" pela categoria real do procedimento. Assinatura nova:

```ts
contarAtendimentos(ags, procMetaById): number
// agrupa por (paciente_id, dia) quando categoria === 'laboratorio';
// demais contam 1 por linha.
```

Fallback: se `procMetaById` não tiver o id (linha antiga sem procedimento_id), conta 1 — comportamento atual.

### UI — `app.agenda.tsx` + `procedimento-cell.tsx`

Quando os procedimentos filtrados para o médico selecionado tiverem `tipo_procedimento in ('laboratorio','imagem')`, o campo vira multiselect com checkboxes + busca. Badge:
- "Laboratório — conta como 1 atendimento"
- "Imagem — cada exame conta 1"

Fora dessas categorias, single-select como hoje. **Zero mudança visual** no fluxo de consulta/procedimento/cirurgia.

### Server — `src/lib/agenda/criar-agendamento.functions.ts`

Novo campo opcional `procedimentos?: string[]` (nomes).

- `laboratorio` (N nomes) → **1 agendamento**, campo `procedimento` recebe os nomes concatenados com ` + `. Cria **N linhas em `agendamento_orcamento_itens`** — isso preserva GR/guia separada por exame quando o financeiro emitir. 1 `fin_atendimento`, 1 pagamento, 1 NFS-e (regra financeira **inalterada**).
- `imagem` (N nomes) → **N agendamentos irmãos** no mesmo horário/paciente/médico. 1º valida slot; irmãos 2..N recebem `origem='encaixe_grupo'` e bypass de slot. Cada um gera `fin_atendimento` e GR próprios (comportamento atual).
- demais categorias → **single**, comportamento idêntico ao atual (contrato preservado para Agenda V2).

### Contagem aplicada em 4 pontos

Todos passam a usar o helper `contarAtendimentos`:
- `src/routes/_authenticated/app.painel.tsx`
- `src/routes/_authenticated/app.painel-executivo.tsx`
- `src/routes/_authenticated/app.relatorios.tsx`
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (Repasse) — apenas a **quantidade** de atendimentos é agrupada; o **valor de repasse** continua vindo da soma dos `fin_atendimentos` (regra financeira preservada).

## O que NÃO muda (compromisso do ticket)

- Cobrança, pagamento, NFS-e, GR/guia, regra financeira, contratos, pacientes associados: intocados.
- GRs continuam separadas por exame/procedimento quando o fluxo financeiro exigir (imagem = N `fin_atendimentos`; laboratório = 1 agendamento com N itens de orçamento).
- Agenda V2 e Express: intocadas — o campo `procedimentos[]` é opcional.

## Rascunho da Jornada do Paciente

Crio `.lovable/plan-jornada.md` **só como documento**, com:
- objetivo (uma ficha por comparecimento agrupando N atendimentos de N modalidades),
- modelo de dados proposto (tabela `jornadas_paciente` + `jornada_itens`, sem migration nesta rodada),
- fluxo de recepção,
- impactos em Painel, Relatórios, Repasse (por jornada + por exame),
- riscos e faseamento.

## Ordem de execução (após seu OK)

1. Migration (CHECK + backfill).
2. Helper `categoria.ts` + refactor `contagem.ts`.
3. UI multiselect + `criarAgendamento` (procedimentos[]).
4. Aplicar contagem nos 4 lugares.
5. Rascunho `.lovable/plan-jornada.md`.

Cada passo autocontido; se algo travar, dá para reverter só aquele passo.
