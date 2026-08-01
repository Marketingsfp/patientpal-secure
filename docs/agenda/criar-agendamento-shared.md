# `criarAgendamento` — fonte única de criação/edição de agendamentos

Aprovado no Passo B (06/07/2026). A partir desta data, toda criação ou edição
de agendamento no sistema DEVE passar por `criarAgendamento`.

## Arquivo canônico

`src/lib/agenda/criar-agendamento.functions.ts` — server function
(`createServerFn` + `requireSupabaseAuth`).

Encapsula as 7 regras extraídas 1:1 do `submit` clássico:

1. Paciente precisa ter telefone e data de nascimento.
2. Médico precisa ter agenda aberta no dia (bypass para recursos de enfermagem).
3. Slot `DISPONÍVEL` deve cobrir o intervalo escolhido.
4. Bypass de checagem de slot para `enfermagem_recurso_id`.
5. Inadimplência em cartão benefícios bloqueia `tipo_atendimento = "convenio"`.
6. INSERT (novo) ou UPDATE (edição) preservando o mesmo ID.
7. Vínculos em `agendamento_orcamento_itens` (limpa antigos antes de inserir
   os novos em edição).

## Módulos que dependem de `criarAgendamento`

| Módulo | Arquivo | Uso |
|---|---|---|
| Agenda clássica | `src/routes/_authenticated/app.agenda.tsx` (`submit`) | Consumidor oficial desde o Passo B — validado com 12 testes |
| Agenda V2 — wizard "Nova sessão" | `src/components/agenda-v2/novo-agendamento-wizard.tsx` | Consumirá a mesma função na Fase F (planejamento pendente) |

## Regra de manutenção

**Qualquer alteração na lógica de criação/edição de agendamento deve ocorrer
exclusivamente em `src/lib/agenda/criar-agendamento.functions.ts`.**

É proibido:

- Reintroduzir validações client-side de slot/agenda/inadimplência fora dessa função.
- Duplicar a lógica de INSERT/UPDATE em `agendamentos` em outro ponto do código.
- Criar novas rotas de "salvar agendamento" que ignorem essa função.

Ao evoluir uma regra (novo campo, nova validação, mudança de mensagem), o
patch cobre um único arquivo e ambas as agendas — clássica e V2 — herdam a
mudança automaticamente. Isso é a garantia contratual do Passo B.

## Validação executada (06/07/2026)

12 testes manuais na Agenda clássica após a extração:

- ✅ Criar agendamento simples
- ✅ Bloquear paciente incompleto
- ✅ Bloquear slot ocupado
- N/A Orçamento
- ✅ Editar agendamento existente (mesmo ID)
- ✅ Salvar e cobrar (tela abre, sem confirmar)
- ✅ Toasts idênticos
- ✅ Agenda clássica geral
- ✅ Agenda V2 intacta
- ✅ Console limpo
- ✅ Update sem alterações (mesmo ID)
- ✅ Update alterando apenas horário (mesmo ID)

SELECTs de verificação confirmaram: 0 duplicidade, 0 INSERTs indevidos,
0 `pagamentos` extras, 0 `fin_atendimentos` extras, vínculos íntegros.