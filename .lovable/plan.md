## Problema

Em `src/routes/_authenticated/app.agenda.tsx` (função que calcula o benefício do convênio, linhas ~388-519), o sistema conta como "usados" **todos os agendamentos não cancelados** da paciente no dia. Isso faz com que, quando existem 2 agendamentos apenas marcados (nenhum pago ainda), o segundo já dispare o excedente ("cobrando 50% do valor particular") na tela de cobrança do primeiro.

A regra correta: o limite só é consumido quando um agendamento é **efetivamente pago/realizado**. Se houver apenas agendamentos pendentes, mostrar aviso informativo.

## Mudanças

### 1. `src/routes/_authenticated/app.agenda.tsx` — contagem só considera pagos
Na consulta de `agendamentos` para o cálculo do limite (linhas ~435-482):
- Filtrar `agsFiltrados` para contar apenas os que já foram cobrados/atendidos: `status === "realizado"` (o status "pago" existe em telas legadas mas na tabela `agendamentos` os que já foram pagos ficam como `realizado`).
- Manter também um segundo array `agsPendentes` (mesmos filtros de especialidade/paciente, mas com `status IN ('agendado','confirmado')`, excluindo o próprio agendamento sendo cobrado agora) para gerar o aviso informativo.

O `esgotadoExclusivo` (titular_ou_dependente) também passa a olhar só para agendamentos realizados.

### 2. Novo aviso informativo (não é excedente)
Quando:
- `usados < limite_qtd` (limite ainda não consumido de fato), E
- `agsPendentes.length >= 1` (há outros agendamentos pendentes no dia que compartilham a cota)

...adicionar um `avisoLimite` do tipo **informativo** com texto:
> "Existem X agendamento(s) para hoje com este benefício. Apenas 1 será cobrado como benefício; os demais sairão com 50% de desconto (ou regra do excedente configurado)."

O texto do excedente é derivado do `excedente_modo` da regra (particular, valor_fixo, percentual_particular ou bloquear), sem aplicar o desconto de excedente **neste** agendamento — ele continua como benefício normal. Não altera `desconto` nem `bloquear`.

### 3. Dobrar o tempo do toast
Sonner default = 4s. Passar `{ duration: 8000 }` nas chamadas de `toast.warning(info.avisoLimite)` e `toast.error(info.avisoLimite ...)` relacionadas a limite de convênio (linhas ~2716, 2729, 2732, 2969, 2982, 2985). Não altera outros toasts do arquivo.

## Fora do escopo
- Não muda schema nem regras cadastradas.
- Não altera fluxos de pagamento/GR.
- Ao pagar o 1º agendamento (vira `realizado`), a próxima cobrança do 2º agendamento continuará disparando o excedente (50%) normalmente — comportamento correto.
