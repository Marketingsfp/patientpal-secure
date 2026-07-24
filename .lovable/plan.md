## Diagnóstico técnico (o que está acontecendo)

Confirmei no banco:

- A Vania Maria Dario tem hoje **1 agendamento futuro em aberto**: **11/08/2026 12:30 — PAQUIMETRIA**, na agenda **EXAMES** do Dr. João Hélio (o card da tela reflete isso — a data no cabeçalho é 11/08/26, não 18/07). É esse o agendamento que está sendo movido.
- No dia **23/07/2026** essa agenda EXAMES do Dr. João Hélio tem **21 slots ocupados e apenas 4 disponíveis**: **15:10, 15:20, 16:20 e 16:30**.
- Quando você clica em qualquer outro horário do 23/07 (que na tela aparece livre visualmente, mas no banco já tem paciente), a função `reagendar_atendimento` dispara este trecho:

```text
raise exception 'Esse horário não está disponível...'
  using errcode = '23505';
```

O código `23505` é o mesmo código de "chave duplicada". O frontend genérico traduz qualquer `23505` como **"Já existe um registro com esses dados"**. Ou seja: o sistema **está bloqueando corretamente**, mas mostra uma mensagem enganosa que faz parecer bug/duplicidade.

Também existe uma segunda armadilha: a agenda "EXAMES" desse médico tem consultas misturadas (histórico antigo antes da regra nova de consulta × exame). Isso deixa muito slot já ocupado, dando a sensação de que "não tem lugar em lugar nenhum".

## Solução em duas frentes

### 1) Resolver a Vania agora (operacional)

Escolher **um** dos 4 slots realmente livres em 23/07 na EXAMES e mover a PAQUIMETRIA para lá — direto no banco, mesma lógica do RPC (libera 11/08 12:30, ocupa o slot alvo, mantém o pagamento ligado):

- Sugestão: **23/07/2026 15:10** (primeiro slot livre).

Precisa confirmar comigo:
- Confirma **23/07 às 15:10**? Ou prefere 15:20 / 16:20 / 16:30?

### 2) Correção definitiva (todas as clínicas)

Para não repetir o mesmo susto:

- **RPC `reagendar_atendimento`**: trocar o `errcode 23505` por um código próprio (`P0001` ou `restrict_violation`) e propagar a mensagem real ("Esse horário não está disponível — escolha um slot DISPONÍVEL").
- **Frontend (`app.agenda.tsx`, fluxo de reagendar)**: quando a resposta do RPC vier com esse novo código, mostrar a mensagem exata devolvida pelo banco em vez do texto genérico "Já existe um registro com esses dados"; e desabilitar visualmente o clique em slots que não estão como DISPONÍVEL enquanto o modo "Reagendando" estiver ativo, para o operador ver de cara onde pode soltar.
- **Sem tocar** na regra de negócio: continua bloqueando reagendar sobre slot ocupado (isso está correto).

Escopo de aplicação (**Regra 1.10 do AGENTS.md**): preciso confirmar antes de codar — a correção da mensagem/UX deve valer para **todas as clínicas** (Menino Jesus, SFP e a terceira)? A recomendação técnica é sim, porque é bug de UX genérico, mas quero sua confirmação explícita.

## O que NÃO vou fazer sem sua ordem

- Não vou renomear/limpar a agenda EXAMES misturada com consultas do Dr. João Hélio (é regra de negócio antiga; entra em outro ticket).
- Não vou criar novos slots no 23/07 automaticamente — se você quiser mais horários nesse dia, me diga o intervalo.

## Confirmações que preciso de você

1. Qual horário livre em 23/07 usar para a Vania: **15:10**, 15:20, 16:20 ou 16:30?
2. A correção de mensagem/UX pode ser aplicada em **todas as clínicas**?
