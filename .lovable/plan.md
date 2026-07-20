## Objetivo

Permitir que um paciente desista de um convênio para aderir a outro, cancelando o contrato atual e emitindo um novo contrato **sem taxa de adesão e sem carência**, com rastreabilidade completa. Aplicável às 3 clínicas.

## Comportamento

Na página de Contratos (Cartão Benefícios), quando o pop-up de "Nova venda" pergunta o tipo, além de "Nova adesão" e "Renovação", passa a existir a opção **"Troca de convênio"**. Ao selecionar:

1. Usuário escolhe o contrato antigo (busca por titular/número).
2. Escolhe o novo convênio, nº de pessoas e dependentes (mesma UX da renovação).
3. Ao confirmar:
   - Contrato antigo → status `cancelado`, motivo `Troca de convênio → #<novo>`, `cancelado_em = hoje`.
   - Todas as mensalidades **pendentes** (não pagas) do contrato antigo → status `cancelada`. Pagas ficam intactas.
   - Novo contrato é criado com `contrato_origem_id = antigo`, **taxa de adesão R$ 0**, **sem carência** (mesma regra já aplicada em renovação), 12 parcelas normais do novo plano.
   - Registro em `contrato_renovacoes` com `tipo = 'troca_convenio'` ligando antigo → novo.

## Onde muda

**Backend (migration)**
- Nova RPC `trocar_convenio_contrato(_contrato_antigo, _novo_convenio_id, _nova_faixa_id, _dependentes, _data_inicio)` que, em transação:
  - valida permissão (`is_member`),
  - cancela contrato antigo + mensalidades pendentes,
  - chama a lógica de criação de novo contrato reutilizando o caminho de renovação (isento de taxa/carência),
  - insere linha em `contrato_renovacoes` com `tipo = 'troca_convenio'`.
- Ajuste no ENUM/CHECK de `contrato_renovacoes.tipo` se necessário para aceitar `troca_convenio`.
- Ajuste em `contrato_historico` para rotular eventos de troca.

**Frontend**
- `src/components/pages/contratos-page.tsx`: adicionar terceira opção no AlertDialog de tipo de venda.
- Novo `src/components/contratos/trocar-convenio-dialog.tsx` derivado do `renovar-contrato-dialog.tsx` (mesma UX de convênio/faixa/dependentes, sem campo de "data da renovação retroativa" — usar data de hoje por padrão, permitindo ajuste).
- `historico-contrato-tab.tsx`: exibir evento "Troca de convênio" com link para o contrato de origem/destino.

## Regras de negócio confirmadas

- Sem taxa de adesão no novo contrato.
- Sem carência (mesmo tratamento de renovação — `contrato_origem_id` já isenta).
- Mensalidades pagas do contrato antigo permanecem; pendentes viram `cancelada`.
- Aplicável às 3 clínicas (sem feature flag).

## Fora de escopo

- Estorno financeiro de mensalidades já pagas do contrato antigo.
- Proporcionalização de mês corrente (usuário optou por cancelar todas as pendentes).
- Mudança de titular na troca (mantém o mesmo titular; troca de titular continua exigindo cancelamento manual).

## Validação

- Criar troca de teste entre dois convênios distintos em contrato fictício, conferir:
  - contrato antigo cancelado + mensalidades pendentes canceladas,
  - novo contrato sem parcela 0 (taxa de adesão) e sem carência,
  - `contrato_renovacoes` com `tipo = 'troca_convenio'`,
  - aba Histórico mostrando o evento nos dois contratos.
- Reverter registros de teste ao final.
