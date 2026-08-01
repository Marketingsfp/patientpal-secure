# Arquitetura da Agenda — clássica + V2

Documento oficial (07/2026). Fonte-verdade da arquitetura de agendamento
após o encerramento da Fase F. Toda mudança futura na Agenda deve respeitar
os limites descritos aqui.

## 1. Princípio central

**Existe uma e apenas uma função de criação/edição de agendamento no
sistema:** `criarAgendamento`, em
`src/lib/agenda/criar-agendamento.functions.ts`.

Qualquer interface (atual ou futura) que precise gravar em `agendamentos`
DEVE consumir essa função. É proibido:

- Reintroduzir INSERT/UPDATE em `agendamentos` em outro ponto do código.
- Duplicar validações client-side (paciente completo, slot livre, agenda
  aberta, inadimplência) fora da função.
- Criar rotas alternativas de "salvar agendamento" que a ignorem.
- Duplicar a lógica de vínculos `agendamento_orcamento_itens`.

Consequência: novas interfaces herdam automaticamente qualquer evolução da
regra — basta patch em um arquivo.

## 2. Fluxo da Agenda clássica

Rota: `src/routes/_authenticated/app.agenda.tsx` (fica sempre disponível,
não depende de flag).

```text
Usuário clica em slot DISPONÍVEL na grade
  → abre modal de agendamento (inline no app.agenda.tsx)
  → usuário preenche paciente, procedimento, horário, tipo de atendimento,
    orçamento (opcional)
  → submit() valida form no client (nome, fim>inicio, procedimento) e monta
    payload
  → chama criarAgendamento({ clinica_id, editing_id, payload, checagens,
                             pending_orc_item_ids })
  → mostra toast (sucesso, validation_error ou pg_error)
  → invalida queries da grade clássica
  → fecha modal
```

Características:
- Suporta INSERT (novo) e UPDATE (edição preservando o mesmo id).
- Suporta orçamento (1 grupo e múltiplos grupos via
  `DividirOrcamentoDialog`).
- Suporta sessão laboratorial com N exames (procedimento composto +
  vínculos em `agendamento_orcamento_itens`).
- Suporta recursos de enfermagem (`enfermagem_recurso_id`) — bypass de
  checagem de slot é decidido pelo caller e sinalizado em `checagens`.
- Suporta "Salvar e cobrar" — grava agendamento e abre tela de cobrança
  sem confirmar.

## 3. Fluxo da Agenda V2

Rota: `src/routes/_authenticated/app.agenda-v2.tsx` (piloto, gated por
flag `agenda_v2` em `profiles.preferencias_ui.flags`, restrito a
admin/gestor, OFF por padrão).

```text
Usuário clica "Nova sessão" (HhpToolbar)
  → abre NovoAgendamentoWizard (5 passos)
    1. Paciente     — patient-search-input (reuso da clássica)
    2. Serviço      — procedimento-picker (reuso da clássica)
    3. Profissional — lista de médicos ativos da clínica
    4. Horário      — date input + grid de slots DISPONÍVEL do médico no dia
    5. Confirmação  — resumo + toggle particular/convenio
  → handleConfirmar() monta payload idêntico ao clássico
     (orcamento_id=null, pending_orc_item_ids=[], observacoes="[V2]")
  → chama criarAgendamento(...) via useServerFn
  → mostra toast (mesmas mensagens da clássica)
  → invalida queries ["agenda-v2","ags",...]
  → reset() + fecha wizard
```

Escopo atual (Fase F simples):
- Somente agendamento simples (1 paciente × 1 profissional × 1 slot).
- Somente médicos regulares (recursos de enfermagem indisponíveis pelo
  wizard — o usuário precisa usar a clássica).
- Somente slots `DISPONÍVEL` já gerados em Disponibilidades.
- Sem orçamento (`orcamento_id = null`).
- Sem "salvar e cobrar" (fecha após salvar).
- Rastreabilidade obrigatória: `observacoes = "[V2]"`.

## 4. Responsabilidades de `criarAgendamento`

Server function (`createServerFn` + `requireSupabaseAuth`). Encapsula as
7 regras extraídas 1:1 do `submit` clássico:

1. Paciente precisa ter telefone e data_nascimento (checagem em `pacientes`).
2. Médico precisa ter agenda aberta no dia (nenhum slot no intervalo do dia
   → bloqueia). Bypass para recursos de enfermagem.
3. Slot `DISPONÍVEL` deve cobrir literalmente o intervalo `[inicio, fim]`.
4. Bypass total de checagem de slot quando `enfermagem_recurso_id` está
   presente.
5. Inadimplência em cartão benefícios (RPC
   `paciente_cartao_inadimplente`) bloqueia `tipo_atendimento = "convenio"`.
6. INSERT em `agendamentos` (novo) OU UPDATE preservando o mesmo id
   (edição).
7. Vínculos em `agendamento_orcamento_itens` — em edição, limpa vínculos
   antigos antes de reinserir.

Resultado é discriminated union: `{ ok: true, id }`,
`{ ok: false, validation_error }` ou `{ ok: false, pg_error }`. Mensagens
PT-BR já formatadas para toast.

Callers responsáveis por: (a) montar o payload; (b) decidir quais
`checagens` rodar; (c) tratar o resultado (toast, `mostrarErro`); (d)
invalidar queries; (e) fechar o modal/wizard; (f) UX.

## 5. Pontos de extensão previstos

Todas as extensões abaixo devem consumir `criarAgendamento` sem
modificá-la, exceto onde explicitamente indicado.

### Fase F.2 — Orçamento vinculado (Agenda V2)
- Adicionar `orcamento_id` e `pending_orc_item_ids` no payload do wizard.
- Reutilizar `buscarOrcamento` da clássica (extrair para
  `src/lib/agenda/orcamento.functions.ts` se acoplamento permitir).
- Reutilizar `DividirOrcamentoDialog` como está para o caso "múltiplos
  grupos" — não reimplementar.
- Sem mudança em `criarAgendamento`: a função já aceita os campos.

### Fase F.3 — Sessão laboratorial com N exames (Agenda V2)
- Novo step "múltiplos exames" no wizard V2 (ou reuso do picker).
- Payload monta `procedimento = "LABORATÓRIO (N EXAMES): nome1, nome2..."`
  e envia N `pending_orc_item_ids`.
- Sem mudança em `criarAgendamento`.

### Recursos de Enfermagem (Agenda V2)
- Novo step "profissional ou recurso" com toggle médico/recurso.
- Payload preenche `enfermagem_recurso_id` em vez de `medico_id`.
- Caller marca `checagens.validar_agenda_aberta = false` (bypass conforme
  regra 4).
- Sem mudança em `criarAgendamento`.

### Encaixe / overbooking (fora de escopo)
- Não existe hoje na clássica; se aprovado no futuro, requer nova regra
  (quem autoriza, se conta ocupação, flag por clínica).
- Implementação será via novo parâmetro em `checagens` (ex.:
  `permitir_overbooking: boolean`) — única mudança permitida em
  `criarAgendamento`, decidida em plano dedicado.

## 6. Regras de negócio que NÃO podem ser duplicadas

As regras abaixo vivem exclusivamente em `criarAgendamento`. Qualquer
componente que precise verificá-las (para UX preventiva, badge, aviso)
DEVE apenas ler o mesmo dado do banco — nunca reimplementar a decisão de
bloqueio:

| Regra | Onde vive | O que NÃO pode ser feito em outro componente |
|---|---|---|
| Paciente completo (telefone + nascimento) | `criarAgendamento` step 1 | Duplicar a decisão de bloqueio. UX pode mostrar aviso amarelo, mas o veredicto final vem do servidor. |
| Agenda aberta no dia | `criarAgendamento` step 2 | Nenhum componente pode decidir "não tem agenda" client-side. |
| Slot livre cobrindo intervalo | `criarAgendamento` step 3 | Nenhum componente pode reimplementar overlap. Grade mostra slots do banco; wizard mostra slots do banco. |
| Bypass de slot para enfermagem | `criarAgendamento` step 4 | Nenhum componente pode "pular" a validação por conta própria — apenas sinalizar `checagens.validar_agenda_aberta = false`. |
| Inadimplência cartão benefícios | `criarAgendamento` step 5 (RPC `paciente_cartao_inadimplente`) | Nenhum componente pode decidir "está inadimplente" — apenas ler o resultado da RPC para UX. |
| INSERT vs UPDATE (preservação de id) | `criarAgendamento` step 6 | Nenhum componente pode gravar em `agendamentos`. |
| Vínculos `agendamento_orcamento_itens` | `criarAgendamento` step 7 | Nenhum componente pode inserir/deletar essa tabela em fluxos de agendamento. |

Regras puramente client-side (nome preenchido, `fim > inicio`,
procedimento não-vazio, edição de agendamento pago bloqueada, encaixe de
campo, etc.) permanecem inline nos callers — não são regras de negócio de
persistência.

## 7. Testes e validação

- `docs/agenda/criar-agendamento-shared.md` — contrato + 12 testes manuais
  do Passo B (extração 1:1).
- Fase F encerrada com 3 testes Playwright (happy path, paciente
  incompleto, sem horário) + SELECTs de verificação confirmando zero
  duplicidade, zero vínculo indevido, zero pagamento, zero
  fin_atendimentos.
- Toda evolução futura de `criarAgendamento` DEVE reexecutar o roteiro do
  Passo B na clássica + o roteiro Fase F na V2.

## 8. Diagrama de dependência

```text
┌───────────────────────────────┐   ┌───────────────────────────────┐
│  app.agenda.tsx (clássica)    │   │  novo-agendamento-wizard.tsx  │
│  submit() — monta payload     │   │  handleConfirmar() — monta    │
│  + trata toast/invalidação    │   │  payload + trata toast        │
└──────────────┬────────────────┘   └──────────────┬────────────────┘
               │                                    │
               │            (payload)               │
               ▼                                    ▼
       ┌──────────────────────────────────────────────────┐
       │  src/lib/agenda/criar-agendamento.functions.ts   │
       │  criarAgendamento — server fn + requireSupabase  │
       │  Regras 1–7 (paciente, agenda, slot, bypass,     │
       │  inadimplência, INSERT/UPDATE, vínculos)         │
       └──────────────────────┬───────────────────────────┘
                              ▼
                     ┌─────────────────┐
                     │  agendamentos   │
                     │  agendamento_   │
                     │  orcamento_itens│
                     └─────────────────┘
```

Nada mais grava em `agendamentos`. Nada.