## Diagnóstico

Reproduzi o cenário via banco. Os itens do orçamento #202600023 estão cadastrados assim em `procedimentos`:

| Item | grupo | tipo | tipo_procedimento |
|---|---|---|---|
| ACIDO URICO, HEPATOGRAMA | `Laboratório` | `exame` | `laboratorio` |
| HEMOGRAMA, T4 LIVRE, TSH | `null` | `exame` | `laboratorio` |
| FERRO SERICO, HB GLICOSILADA, LIPIDOGRAMA, VITAMINA B12, VITAMINA D, VDRL | `null` | `exame` | `null` (legado) |

Em `src/routes/_authenticated/app.agenda.tsx` (linhas ~2359-2418) o agrupamento usa apenas `grupo || tipo`, retornando três chaves distintas: `LABORATORIO`, `EXAME` e (para os sem `tipo_procedimento`) mais `EXAME`. Como `gruposDistintos.size > 1`, o dialog "Dividir orçamento" abre indevidamente e o mesmo agrupamento defeituoso replica no dialog (`agruparItens` em `src/components/agenda/dividir-orcamento-dialog.tsx`), gerando as 3 linhas visíveis na foto 2 com médicos aleatórios.

Regra correta: quando **todos** os itens são de laboratório, o orçamento vai como **um único agendamento** para o médico "Laboratório", sem dialog de divisão.

## Correções

### 1. `src/routes/_authenticated/app.agenda.tsx` — fluxo `buscarOrcamento`

- No `SELECT` de `procedimentos` (~linha 2364) incluir `tipo_procedimento` além de `grupo, tipo`.
- Reforçar `isLab(pid)`: considerar lab quando `tipo_procedimento === 'laboratorio'` **ou** (`grupo` normalizado = `LABORATORIO`) **ou** `tipo` = `EXAME`/`LABORATORIO` (mantém compatibilidade com cadastro legado sem `tipo_procedimento`).
- Ajustar `grupoDe(pid)`: se `isLab(pid)` → retornar `"LABORATORIO"`; senão manter `norm(grupo) || norm(tipo) || "OUTROS"`. Isso unifica todos os exames de lab num único grupo mesmo com cadastros heterogêneos.
- Após montar `gruposDistintos`, se `todosLab === true` **nunca** abrir o dialog de divisão; seguir sempre o fluxo de 1 grupo com `procStr = "LABORATÓRIO (N EXAMES): ..."`.
- Pré-selecionar o médico "Laboratório" no `setForm(...)`: procurar em `medicos` o primeiro cujo nome normalizado inicie com `LABORATORIO`/`LABORATÓRIO` (o cadastro "DR(A). LABORATORIO" já existe na clínica). Se não existir, mostrar toast informando "Cadastre um profissional 'Laboratório' para agendar exames laboratoriais" e não travar (o usuário escolhe manualmente).

### 2. `src/components/agenda/dividir-orcamento-dialog.tsx` — defesa em profundidade

Mesmo com o guard acima, o dialog ainda existe para orçamentos mistos (consulta + lab + imagem). Para evitar sub-divisão de exames de lab em subgrupos quando o dialog abrir:

- Adicionar campo opcional `tipo_procedimento: string | null` em `DividirItem`.
- Em `agruparItens`, para cada item calcular chave por prioridade: `LABORATORIO` se `tipo_procedimento === 'laboratorio'` (ou fallback `tipo === 'exame'` com `grupo` vazio) → todos exames de lab caem no mesmo grupo `LABORATORIO`; demais mantêm `norm(grupo) || norm(tipo) || "OUTROS"`.
- Ao construir `itensRicos` no chamador, passar também `tipo_procedimento`.

### 3. Prevenção para não repetir

- Documentar em `docs/regras-negocio.md` (seção Agenda / Orçamentos): "Orçamento composto exclusivamente por procedimentos com `tipo_procedimento='laboratorio'` (ou legado `tipo='exame'`) gera **um único** agendamento vinculado ao profissional 'Laboratório'. Nunca aciona o fluxo de divisão."
- Nada de mock/dados falsos. Não vou alterar cadastros existentes de `procedimentos`; a lógica passa a ser tolerante ao legado (`tipo_procedimento` nulo).

## Verificação

- Reagendar o orçamento #202600023 (após cancelar os 3 agendamentos criados erroneamente) e conferir: 1 agendamento com "LABORATÓRIO (11 EXAMES): ..." vinculado ao médico "Laboratório".
- Rodar cenário misto (1 consulta + 3 exames de lab) e conferir que o dialog de divisão abre com 2 grupos: `CONSULTA` e `LABORATORIO` único.
- Console limpo, sem regressão em orçamentos não-lab.
