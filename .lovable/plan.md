## O que está acontecendo (causa confirmada)

Existem dois caminhos de cobrança na agenda, em `src/routes/_authenticated/app.agenda.tsx`:

1. **Agendar > depois Pagar** — função `cobrarAgendamento` (linha ~5093). Ela chama `obterEtapaSinal(a.id)` e, no bloco da linha ~5259, substitui os valores das formas de pagamento pelo valor da etapa (sinal ou saldo), mostra o aviso "Orçamento com entrada — Total / Já pago / Falta pagar" e preenche o resumo `setSaldoOrcResumo`.
2. **Salvar e pagar** (criar agendamento já indo para o caixa) — bloco `if (irParaPagamento && novoId)` (linha ~4701). Esse caminho monta as opções via `opcoesPagamentoDeOrcamento(...)`, mas **nunca chama `obterEtapaSinal`**. Por isso vem o valor cheio do item, sem o selo "SINAL (entrada)" e sem o resumo.

Ou seja: não é problema de dado nem do orçamento — é lógica que existe em um fluxo e não no outro.

Classificação do pedido: **erro de código** (regra de negócio já definida, só não aplicada em um dos caminhos).

## Correção proposta

Espelhar no fluxo "Salvar e pagar" o mesmo tratamento já usado no "Agendar > Pagar":

- Depois de calcular `opcoes` (e depois de `opcoesOrc`), chamar `obterEtapaSinal(novoId)`.
- Se houver etapa pendente:
  - aplicar `etapaSinal.valor` em todas as formas de pagamento;
  - acrescentar ao rótulo ` — SINAL (entrada)` ou ` — SALDO FINAL`;
  - preencher `setSaldoOrcResumo({ total, pago, restante, itens })`;
  - exibir o mesmo aviso com Total / Já pago / Falta pagar.
- Se não houver, `setSaldoOrcResumo(null)` (como já é feito no outro fluxo).

Para não duplicar código, extraio esse trecho em uma pequena função local (ex.: `aplicarEtapaSinal(opcoes, agendamentoId)`) e uso nos dois pontos, mantendo o comportamento atual do fluxo já correto.

O registro do pagamento (`registrarPagamentoEtapaSinal`, linha ~6763) já é comum aos dois fluxos e não muda.

## Escopo

- Arquivo alterado: `src/routes/_authenticated/app.agenda.tsx` (somente o fluxo de cobrança da agenda).
- Não serão alterados: `src/lib/agenda/sinal-orcamento.ts`, banco de dados, valores de orçamento, regras de convênio.

## Validação

- Checagem de tipos com `tsgo`.
- Conferência prática sugerida (feita por você, sem gerar pagamento real): abrir um orçamento de odontologia com item com entrada, usar "Salvar e pagar" e confirmar que aparece o valor do sinal + o aviso, igual ao fluxo "Agendar > Pagar".
