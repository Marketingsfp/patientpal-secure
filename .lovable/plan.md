## Diagnóstico

O agendamento das 08:40 do Dr. Milton apareceu como "EXAMES LABORATORIAIS", mas no banco o campo `procedimento` está **vazio** — a atendente salvou sem escolher procedimento. O texto vermelho circulado é apenas um rótulo de fallback da tela.

O rótulo vem de `medicoEhLaboratorioFormulario` (`src/routes/_authenticated/app.agenda.tsx`, linhas 2232-2254): a regra atual marca o médico como "de laboratório" se **qualquer** procedimento do cadastro dele tiver `tipo_procedimento = 'laboratorio'`. O Dr. Milton tem cadastrado "PROCEDIMENTOS, ANALISE DE LABORATORIO A PARTIR" (tipo=laboratorio) como cobrança avulsa, então toda a agenda dele foi rotulada como lab.

## Correções

### 1. Médico só é "de laboratório" pela especialidade

Em `src/routes/_authenticated/app.agenda.tsx`, `medicoEhLaboratorioFormulario`: remover o bloco que varre `opcoesProcedimentoMedico` procurando `tipo_procedimento='laboratorio'`. Manter apenas a checagem pela `especialidade_nome` do médico e pelas `medico_especialidades` contendo "laborat". Resultado: Dr. Milton (Dermato + Clínico Geral) deixa de ser tratado como laboratório, o rótulo cai para "CONSULTA" e o comportamento operacional de lab (agrupamento multi-exames, contagem, texto no serviço) não se aplica mais a ele.

Efeito colateral revisado: a mesma função é usada em outros pontos do arquivo (rótulo de fallback, texto na coluna Serviço, filtros multi-exame, agrupamento de orçamento). Todos passam a exigir que o médico tenha especialidade "Laboratório" — coerente com a regra pedida.

### 2. Procedimento obrigatório ao salvar agendamento

Duas camadas:

- **UI (`app.agenda.tsx`, `submit`)**: antes de chamar `criarAgendamento`, validar `form.procedimento?.trim()`. Se vazio, `toast.error("Selecione o procedimento antes de salvar")` e abortar. Marcar o campo como obrigatório visualmente.
- **Server (`src/lib/agenda/criar-agendamento.functions.ts`)**: adicionar validação no início do handler — se `data.procedimento` estiver vazio/nulo, `throw new Error("Procedimento é obrigatório")`. Isso protege também a Agenda V2 e qualquer outra tela que use a mesma função (regra do `docs/agenda/criar-agendamento-shared.md`).

Fica fora do escopo desta correção: alterar agendamentos já existentes sem procedimento (como o 622d3d6a da Adriny). Eles continuam válidos; se quiserem, faço um relatório separado listando os registros com `procedimento` vazio para revisão manual.

### 3. Verificação

- Recarregar a agenda do dia 14/07 do Dr. Milton — a linha 08:40 deve aparecer sem procedimento (ainda vazio no banco) e o rótulo de fallback deve ser "CONSULTA", não "EXAMES LABORATORIAIS".
- Tentar salvar um novo agendamento sem selecionar procedimento — deve ser bloqueado com toast de erro.
- Abrir a agenda de um médico realmente de laboratório — comportamento lab (multi-exame, rótulo) deve continuar igual.
- `tsgo` sem erros.

## Fora do escopo

- Reclassificar o procedimento "PROCEDIMENTOS, ANALISE DE LABORATORIO A PARTIR" no cadastro (pode ser feito depois pela equipe se quiserem tirar o `tipo_procedimento='laboratorio'` dele).
- Backfill dos agendamentos antigos com procedimento vazio.
- Mudanças na regra de contagem de atendimentos (`src/lib/agenda/contagem.ts`) — ela já usa `procedimentos.tipo_procedimento` como fonte primária e não depende dessa heurística.
