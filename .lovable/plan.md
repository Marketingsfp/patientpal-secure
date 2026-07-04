
# Fase 3 (revisada) — Conversão item-a-item de orçamentos mistos

Regra nova: cada item do orçamento é convertido **individualmente**, para o destino correto (venda, agenda médica, agenda de exame/equipamento, fluxo de laboratório) ou marcado como "não aplicável". O orçamento só vira `convertido` quando **todos** os itens tiverem destino final.

---

## Análise dos 4 eixos

- 💰 **Financeiro**: cada item vira 1 `fin_atendimentos` (mantido) → preserva comissões/repasse/relatórios por procedimento. Bloqueio server-side evita duplicidade.
- ⏱️ **Operacional**: uma única tela "Converter orçamento" com todos os itens e o destino sugerido para cada um; recepção resolve pacote misto (consulta + MAPA + US + laboratório) em uma passagem, sem trocar de módulo.
- 😊 **Paciente**: sai da recepção com todos os agendamentos marcados e recibo/venda dos itens de balcão emitidos, sem retornar depois para "marcar o MAPA".
- 🛡️ **Segurança**: validação por tipo de procedimento (impede MAPA em agenda de consulta, US sem sala, consulta sem médico); toda ação passa por RPC/`createServerFn`; audit da Fase 2 grava cada transição.

---

## Modelagem

### 1. Classificar procedimento por destino

Nova coluna em `procedimentos`:

```
tipo_destino text check (tipo_destino in (
  'consulta',            -- agenda médica
  'exame_equipamento',   -- MAPA, Holter, US, ECG etc.
  'laboratorio',         -- coleta/laboratório
  'procedimento_medico', -- pequenos procedimentos que exigem médico
  'venda_balcao'         -- itens sem agendamento (produto, kit)
))
requer_medico boolean default false
requer_sala boolean default false          -- sala/equipamento (US, MAPA, Holter)
tipo_recurso text                          -- 'mapa','holter','us','sala_us_1' etc. (livre)
```

Backfill inicial pelo `grupo`/`nome` (heurística), com tela de revisão em Configurações → Procedimentos (fora do escopo desta migration; migration apenas cria as colunas e um backfill best-effort).

### 2. Status do item + status do orçamento

Nova coluna em `orcamento_itens`:

```
status_item text default 'pendente' check (status_item in (
  'pendente','agendado','vendido','nao_aplicavel','cancelado'
))
agendamento_id uuid references agendamentos(id) on delete set null
fin_atendimento_id uuid references fin_atendimentos(id) on delete set null
status_alterado_por uuid, status_alterado_em timestamptz,
motivo_nao_aplicavel text
```

Ampliar `orcamentos.status` para o enum textual:

```
'aberto' | 'parcialmente_agendado' | 'convertido' | 'cancelado'
```

(hoje aceita `aberto|aprovado|convertido|cancelado` — `aprovado` vira alias legado; migração converte).

### 3. Trigger de recomputo do status do orçamento

`fn_orcamento_recalcula_status()` roda `AFTER INSERT/UPDATE/DELETE` em `orcamento_itens`:

```
total       = count(itens)
resolvidos  = count(itens em ('agendado','vendido','nao_aplicavel','cancelado'))
com_dest    = count(itens em ('agendado','vendido'))

status =
  cancelado           se todos itens cancelados
  convertido          se resolvidos = total e com_dest > 0
  parcialmente_agendado se com_dest > 0 e resolvidos < total (ou algum nao_aplicavel/cancelado misto)
  aberto              caso contrário
```

Somente ADMIN/GESTOR podem marcar `nao_aplicavel`/`cancelado` (checado por `has_role` na RPC dedicada; a trigger da Fase 2 continua bloqueando edição pós-convertido).

### 4. RPCs (SECURITY INVOKER)

- `converter_item_venda(p_item_id, p_caixa_sessao_id)` — só para `tipo_destino='venda_balcao'` ou fallback confirmado; cria `fin_atendimentos` + `caixa_movimentos`; grava `fin_atendimento_id` + `status_item='vendido'`. Exige caixa aberta.
- `converter_item_agendamento(p_item_id, p_agenda_payload jsonb)` — payload: `{ medico_id?, agenda_id?, enfermagem_recurso_id?, inicio, fim, tipo_atendimento, observacoes }`. Valida por `tipo_destino`:
  - `consulta` / `procedimento_medico` → exige `medico_id`
  - `exame_equipamento` → exige `enfermagem_recurso_id` OU `agenda_id` marcada como recurso; bloqueia se `medico_agendas.tipo_recurso` não bater com o do procedimento
  - `laboratorio` → aceita `agenda_id` de laboratório ou insere direto em fluxo lab (sem agendamento) marcando `agendamento_id=null` + `status_item='agendado'` com flag
  - `us` → exige `medico_id` E `enfermagem_recurso_id` (sala)
  - Cria `agendamentos` com `orcamento_id` + novo campo `agendamento.orcamento_item_id` (UNIQUE).
- `marcar_item_nao_aplicavel(p_item_id, p_motivo)` — restrito a ADMIN/GESTOR; grava motivo + status.
- `cancelar_item(p_item_id, p_motivo)` — idem.

Todas gravam em `audit_log` via trigger da Fase 2. Todas usam `SELECT ... FOR UPDATE` do item + UNIQUE em `orcamento_itens.fin_atendimento_id` e em `orcamento_itens.agendamento_id` para evitar duplicidade.

### 5. Enriquecer `medico_agendas` para recursos

`medico_agendas` hoje é usada como calendário do médico. Adicionar:

```
tipo_recurso text        -- 'consulta','mapa','holter','us','ecg','laboratorio', null = consulta
sala text                -- descritivo
```

Assim uma "agenda do MAPA" existe sem médico titular, e o filtro por `tipo_recurso` casa com `procedimentos.tipo_recurso`. (`enfermagem_recursos` continua sendo o cadastro de equipamentos usado pelo módulo enfermagem — pode conviver.)

### 6. UI: tela "Converter orçamento"

Rota: mesma `app.orcamentos` abre um dialog fullscreen `ConversaoOrcamentoDialog`.

Layout: tabela com uma linha por item. Colunas:

```
Item | Tipo | Destino sugerido | Ação (Vender / Agendar / Não aplicável) | Status
```

Ao clicar "Agendar" abre um subformulário contextual conforme `tipo_destino`:
- consulta → seletor de médico + `medico_agendas` compatíveis + slot;
- exame_equipamento → seletor de recurso/agenda com `tipo_recurso` filtrado + slot;
- us → médico + sala + slot;
- laboratorio → destino "lab" (sem slot) ou agenda de coleta;
- venda_balcao → "Registrar venda" (exige caixa aberto).

Feedback em tempo real: quantos itens resolvidos / total; o botão "Finalizar" só marca `convertido` implicitamente via trigger — não há update manual de status.

Botão "Marcar não aplicável" só aparece para ADMIN/GESTOR (`usePermissoes`).

Sem caixa aberto: ações de venda ficam desabilitadas com tooltip.

### 7. Bloqueios server-side (defesa em profundidade)

Trigger `fn_agendamento_valida_destino()` `BEFORE INSERT` em `agendamentos`:
- se `orcamento_item_id` presente, carrega `procedimentos.tipo_destino` do item e rejeita combinações inválidas (MAPA sem recurso, consulta sem médico, US sem sala, tipo do recurso ≠ tipo do procedimento).

Mesma validação replicada dentro da RPC (mensagem PT-BR amigável); trigger é rede de segurança para inserts diretos (importações, scripts).

---

## Impacto por módulo

| Módulo | Impacto | Risco |
|---|---|---|
| Orçamentos | Novos campos + tela nova + status ampliado | 🟡 Médio (contrato do status muda) |
| Agenda | Nova coluna `orcamento_item_id`, trigger de validação, `medico_agendas.tipo_recurso` | 🟡 Médio |
| Caixa | Igual à Fase 3 anterior | 🟢 Baixo |
| Financeiro | Igual à Fase 3 anterior; ganha `fin_atendimentos.orcamento_item_id` | 🟢 Baixo |
| Enfermagem/Recursos | Passa a receber agendamentos de MAPA/Holter/US originados do orçamento | 🟡 Médio (validar fluxo existente) |
| NFS-e / Relatórios | Nenhum | 🟢 Baixo |

Legado: qualquer código que filtra `orcamentos.status = 'aprovado'` precisa aceitar `parcialmente_agendado`. Vou grepar e ajustar como parte da migration (função utilitária no front).

---

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| Item classificado errado (MAPA marcado como consulta no cadastro) | Backfill best-effort + revisão obrigatória em Configurações antes de a tela aceitar aquela categoria; RPC rejeita `tipo_destino IS NULL` com "classifique este procedimento antes de converter" |
| Duas recepcionistas convertendo o mesmo item | `SELECT ... FOR UPDATE` + UNIQUE em `agendamento_id`/`fin_atendimento_id` do item |
| Recepção esquece de agendar 1 item e marca todo mundo como não aplicável | Só ADMIN/GESTOR marca "não aplicável"; audit_log guarda motivo + autor |
| Status `parcialmente_agendado` quebra relatórios/filtros existentes | Migration inclui alias no front (`aprovado` legado → tratado como aberto) e busca por todos os pontos de filtro |
| Trigger de validação bloqueia agendamento manual legítimo | Só valida quando `orcamento_item_id IS NOT NULL`; agenda manual sem orçamento passa igual |

---

## Testes (padrão Fase 2 — bloco transacional, prefixo `[TESTE-FASE3-MIX]`, cleanup + count antes/depois)

1. Criar orçamento com 4 itens: consulta, MAPA, ultrassom, produto balcão.
2. Converter só a consulta → orçamento vira `parcialmente_agendado`.
3. Tentar agendar MAPA em agenda de consulta → rejeita.
4. Agendar MAPA em recurso correto → ok, ainda `parcialmente_agendado`.
5. Agendar US sem sala → rejeita; com sala → ok.
6. Vender item balcão sem caixa aberto → rejeita; com caixa → ok.
7. Após todos resolvidos → orçamento vira `convertido` automaticamente pela trigger.
8. Recepção tenta marcar item como "não aplicável" → rejeita; admin marca → ok e recomputa status.
9. Tentar editar orçamento convertido como recepção → bloqueio da Fase 2 continua ativo, gravado em audit.
10. Testar orçamento vencido (mesma regra da versão anterior: confirmação, não bloqueio).
11. Cleanup e comparação de contagens em todas as tabelas afetadas.

Nenhum dado real é tocado.

---

## Rollback

```sql
DROP TRIGGER IF EXISTS trg_orcamento_recalc_status ON public.orcamento_itens;
DROP FUNCTION IF EXISTS public.fn_orcamento_recalcula_status();
DROP TRIGGER IF EXISTS trg_agendamento_valida_destino ON public.agendamentos;
DROP FUNCTION IF EXISTS public.fn_agendamento_valida_destino();
DROP FUNCTION IF EXISTS public.converter_item_venda(uuid,uuid);
DROP FUNCTION IF EXISTS public.converter_item_agendamento(uuid,jsonb);
DROP FUNCTION IF EXISTS public.marcar_item_nao_aplicavel(uuid,text);
DROP FUNCTION IF EXISTS public.cancelar_item(uuid,text);
ALTER TABLE public.agendamentos DROP COLUMN IF EXISTS orcamento_item_id;
ALTER TABLE public.medico_agendas DROP COLUMN IF EXISTS tipo_recurso, DROP COLUMN IF EXISTS sala;
ALTER TABLE public.orcamento_itens
  DROP COLUMN IF EXISTS status_item,
  DROP COLUMN IF EXISTS agendamento_id,
  DROP COLUMN IF EXISTS fin_atendimento_id,
  DROP COLUMN IF EXISTS status_alterado_por,
  DROP COLUMN IF EXISTS status_alterado_em,
  DROP COLUMN IF EXISTS motivo_nao_aplicavel;
ALTER TABLE public.procedimentos
  DROP COLUMN IF EXISTS tipo_destino,
  DROP COLUMN IF EXISTS requer_medico,
  DROP COLUMN IF EXISTS requer_sala,
  DROP COLUMN IF EXISTS tipo_recurso;
-- status do orçamento volta ao check original
```

Front-end: revert do commit da tela `ConversaoOrcamentoDialog`.

---

## Decisões que preciso confirmar antes de codar

1. **Laboratório sem agenda**: aceita marcar item como `agendado` apontando para "fluxo lab" (sem `agendamentos` real) — ou você prefere que sempre gere um `agendamentos` mesmo para coleta? Proposta: sem agendamento real, só flag + `fin_atendimentos` gerado no momento da coleta (fluxo lab existente).
2. **Backfill de `tipo_destino`**: rodo heurística por nome (MAPA/HOLTER/US/LAB/CONSULTA) e deixo o resto como `NULL` obrigando classificação manual — ou marco tudo como `consulta` para não travar? Proposta: heurística + NULL para o resto (força qualidade de dado).
3. **`medico_agendas.tipo_recurso`**: crio novo cadastro de "agenda de equipamento" reaproveitando `medico_agendas` (com `medico_id` NULL permitido) ou uso `enfermagem_recursos` como fonte única de recursos? Proposta: reaproveitar `medico_agendas` com `medico_id` nullable + `tipo_recurso`, mantendo `enfermagem_recursos` só para o módulo enfermagem, para não fragmentar cadastro de agenda.
4. **Status legado `aprovado`**: converter para `aberto` na migration (proposto) ou preservar como alias?

Aprovando o plano + as 4 decisões, abro a migration seguindo o mesmo protocolo da Fase 2 (SQL para revisão → aprovação → teste transacional → relatório antes/depois).
