
## O que muda

Hoje, quando o paciente tem cartão benefícios com mensalidade vencida, o agendamento é bloqueado sem alternativa. Vamos permitir que, na hora de agendar, o operador escolha se aquele atendimento vai usar o **Convênio (cartão benefícios)** ou vai ser **Particular**. Se for Particular, o bloqueio de inadimplência não se aplica — o paciente paga o valor cheio, como qualquer outro.

## Fluxo novo

1. No modal de "Novo/Editar agendamento", assim que o paciente for selecionado, o sistema verifica se ele tem contrato ativo de cartão benefícios (titular ou dependente).
2. Se **tem contrato**, aparece um seletor **"Tipo de atendimento"** logo abaixo do paciente:
   - **Convênio — {nome do convênio}** (padrão quando o contrato está em dia)
   - **Particular** (padrão quando o contrato está com mensalidade vencida, para não travar o operador)
3. Se **não tem contrato**, o campo não aparece — segue Particular implícito, como hoje.
4. Regra de bloqueio no `save()`:
   - Só chama `paciente_cartao_inadimplente` quando o tipo escolhido = **Convênio**.
   - Particular ignora inadimplência e agenda normalmente.
5. A escolha é persistida no agendamento (nova coluna `tipo_atendimento` em `agendamentos`: `convenio` | `particular`) e propagada ao fluxo de pagamento:
   - Ao clicar em **Pagar/Imprimir** ou **Pagar/Imprimir/Nota**, o diálogo já abre com "Particular" ou "Convênio" pré-selecionado conforme o agendamento — o operador ainda pode trocar lá dentro se precisar (mantém a flexibilidade que você já tem).
   - Se trocar para Convênio no momento do pagamento e houver inadimplência, mostramos o mesmo alerta atual antes de confirmar.
6. Mesma lógica aplicada ao **check-in** (`app.checkin.tsx`): só bloqueia se o agendamento estiver marcado como Convênio.

## Sugestões extras (aviso, não bloqueio)

- Quando o operador escolher **Particular** existindo débito no cartão, mostrar um aviso não-bloqueante (banner amarelo dentro do modal): *"Paciente tem R$ X em aberto no cartão. Este atendimento será cobrado como Particular."* — ajuda a recepção a lembrar de comentar com o paciente sem travar o agendamento.
- Registrar no histórico/observação automática do agendamento a escolha feita (ex.: `TIPO: PARTICULAR (paciente possui cartão convênio)`) para rastreabilidade em auditoria.

## Detalhes técnicos

- **Migração**: adicionar `tipo_atendimento text not null default 'particular' check (tipo_atendimento in ('convenio','particular'))` em `public.agendamentos`. Backfill: linhas existentes ficam `particular` (comportamento atual do bloqueio equivale a "sempre convênio se tem contrato" — mas para o histórico já pago não muda nada, pois o pagamento já registrou a forma).
- `src/routes/_authenticated/app.agenda.tsx`:
  - Estender `form` com `tipo_atendimento`.
  - Ao selecionar paciente, chamar `obterInfoConvenioPaciente` (já existe) para saber se há contrato; guardar em estado `contratoInfo`.
  - Renderizar `<Select>` "Tipo de atendimento" só quando `contratoInfo` existe.
  - No `save()`, envolver o bloco de bloqueio (linhas ~2187-2204) em `if (form.tipo_atendimento === 'convenio')`.
  - Incluir `tipo_atendimento: form.tipo_atendimento` no `payload`.
  - Passar essa escolha ao abrir o diálogo de pagamento (já existe `irParaPagamento`) como valor inicial de `forma_pagamento` / `convenio_id`.
- `src/routes/_authenticated/app.checkin.tsx`: só chamar o alerta de mensalidade vencida quando `agendamento.tipo_atendimento === 'convenio'`.
- Sem mudança em `PendenciasAlert.tsx` (continua usado no fluxo do paciente / atendimento onde o débito é geral, não específico do cartão).

## O que **não** muda

- Override do gestor por senha continua existindo para o caso Convênio + inadimplente.
- Nenhuma outra tela do cartão benefícios é alterada.
- Nenhum comportamento financeiro de contratos existentes é tocado.

Confirma que posso seguir assim? Se preferir, também dá para deixar a escolha só no momento do **pagamento** (sem seletor no agendamento), mas aí o bloqueio no agendar continua — por isso a recomendação é colocar o toggle já no agendamento.
