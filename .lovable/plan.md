## Objetivo

Na **Agenda clássica**, ao criar/editar um agendamento em especialidades de laboratório ou imagem (RX, ultrassom, tomografia, ressonância), permitir selecionar **mais de um exame** de uma vez.

Regra de contagem — vale em **painéis + relatórios + repasse**:

- **Laboratório** (especialidade cujo nome contém "laborat"): mesmo com N exames, conta como **1 atendimento**.
- **Imagem** (RX, ultra, tomo, RM): cada exame conta como **1 atendimento**.

Fora da Agenda clássica nada muda (V2 e Express seguem intocadas — Frente Final §"Não alterar a Agenda clássica" fica flexibilizado por pedido explícito seu).

---

## Estratégia (sem migration)

Aproveitamos que o banco já modela "1 agendamento = 1 procedimento":

- **Laboratório** → cria **1 único agendamento** cujo `procedimento` guarda os exames concatenados (ex.: `HEMOGRAMA + GLICEMIA + TSH`). Um único slot ocupado, um único `fin_atendimento`, um único repasse.
- **Imagem** → cria **N agendamentos irmãos** (um por exame) no **mesmo horário**, mesmo paciente. Cada um vira um `fin_atendimento` e um repasse próprio. Para não colidir com a validação de slot, o server function marca os irmãos com `origem='encaixe_grupo'` e faz bypass da checagem de slot para os agendamentos 2..N (o 1º valida normalmente).

Sem tabela nova, sem coluna nova, rollback trivial (revert do código).

---

## Alterações

### 1. UI — form da Agenda clássica

Arquivo: `src/routes/_authenticated/app.agenda.tsx` (+ componente auxiliar em `src/components/agenda/procedimento-cell.tsx`).

- Quando a especialidade do médico selecionado for laboratório **ou** imagem (rx/ultra/tomo/rm), o campo "Procedimento" vira **multiselect** (checkboxes + busca) puxando de `procedimentos` filtrando pela especialidade.
- Fora dessas especialidades, permanece single-select como hoje.
- Indicador visual: badge "Laboratório — conta como 1" ou "Imagem — conta 1 por exame".

### 2. Server — `criarAgendamento`

Arquivo canônico: `src/lib/agenda/criar-agendamento.functions.ts`.

- Novo campo opcional no input: `procedimentos?: string[]` (nomes).
- Se `procedimentos.length > 1`:
  - Detecta modalidade via `especialidade.nome`:
    - contém "laborat" → **modo LAB**: concatena com " + " no campo `procedimento` e cria 1 agendamento (regra existente inalterada).
    - senão → **modo IMAGEM**: valida o slot para o 1º exame; para os demais, cria irmãos com `origem='encaixe_grupo'` e mesmo `grupo_uuid` (usa `orcamento_id` só se já vier do fluxo de orçamento; caso contrário grava referência cruzada em `observacoes` com o `id` do 1º).
- Para edição, se o agendamento estava em grupo, o UPDATE preserva o `grupo_uuid` e aplica em todos os irmãos.

### 3. Contagem — 3 pontos

Padroniza um helper `contarAtendimentos(agendamentos, especialidades)` em `src/lib/agenda/contagem.ts`:

```ts
// Lab agrupa por (paciente_id, dia). Imagem/outros contam 1 por linha.
```

Aplicar em:

- `src/routes/_authenticated/app.painel.tsx` (já tem a lógica embutida — troca para o helper).
- `src/routes/_authenticated/app.painel-executivo.tsx` (novo — adiciona o helper).
- `src/routes/_authenticated/app.relatorios.tsx` (checar quais listagens somam atendimentos).
- **Repasse médico**: `src/routes/_authenticated/app.financeiro.atendimentos.tsx` — a contagem passa a agrupar exames de laboratório do mesmo paciente/dia como 1, mas o **valor** (soma de `valor_medico`) continua vindo dos N `fin_atendimentos`. Ou seja, "N exames de lab do mesmo paciente = 1 atendimento com repasse somado". Confirmar se essa é a leitura correta para o financeiro (ver §Riscos).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Bypass de slot em irmãos de imagem cria overbooking real | Somente o mesmo paciente + mesmo horário + mesmo médico. Nunca fura slot de terceiros. |
| Repasse de laboratório: cliente pode preferir "1 atendimento = 1 repasse único" em vez de "1 atendimento contado com valor somado" | Confirmar antes de mexer no repasse. Se preferir o primeiro modelo, criamos 1 `fin_atendimento` com `valor_total` somado; se o segundo, mantemos N e só ajustamos a contagem. |
| Editar 1 exame do grupo vs editar o grupo todo | Menu do agendamento oferece "editar este exame" e "editar grupo". |
| Cancelar 1 exame do grupo | Cancela só a linha; grupo continua vivo. |
| `criarAgendamento` é contrato — mudar aqui afeta Agenda V2 no futuro | Novo campo é opcional, default = single. V2 não passa `procedimentos[]`, comportamento inalterado. |

---

## Rollback

- Reverter os 3 arquivos alterados (`app.agenda.tsx`, `criar-agendamento.functions.ts`, `contagem.ts`).
- Registros criados no modo IMAGEM ficam válidos porque são agendamentos comuns — nada corrompe.
- Registros do modo LAB ficam com `procedimento` concatenado (ex.: `HEMOGRAMA + GLICEMIA`) — o campo é texto livre, permanece legível.

---

## Validação prevista

1. Criar agendamento de laboratório com 3 exames → 1 linha na agenda, painel mostra 1 atendimento, repasse soma valores.
2. Criar agendamento de RX + ultra (mesmo médico? não — testar dois cenários) com 2 exames → 2 linhas na agenda, painel mostra 2 atendimentos, 2 repasses.
3. Painel executivo: KPI "compareceram" respeita a regra.
4. Editar apenas 1 exame do grupo de imagem → outros preservados.
5. Cancelar 1 exame do grupo → contagem cai só de 1.
6. Cliente fora de lab/imagem: form continua single-select (regressão).

---

## Perguntas antes de codar

1. **Repasse de laboratório**: 1 atendimento com valor somado (`fin_atendimento` único) ou N `fin_atendimento` com contagem agrupada? *(a segunda é menos invasiva; a primeira exige mudar `criarAgendamento` para não emitir N linhas)*
2. **Imagem RX + ultra no mesmo médico**: existe? Ou os médicos de imagem são especializados por modalidade? Isso muda se preciso identificar modalidade por procedimento ou por especialidade.
3. Ok criar `origem='encaixe_grupo'` como novo valor de `agendamentos.origem` (sem migration, coluna já é texto livre)?

Aprovando este plano, executo em 2 etapas: (a) helper de contagem + Painel Executivo/antigo (isolado, sem risco), (b) UI multiselect + `criarAgendamento` (toca contrato compartilhado).