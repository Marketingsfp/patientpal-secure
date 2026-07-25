## Objetivo

Permitir remover **juros + multa** de uma mensalidade atrasada do Cartão Benefícios sem usar valor manual (que continua bloqueado). A ação exige **senha de gestor** e fica registrada em auditoria.

**Escopo:** todas as clínicas. Apenas a tela de contrato (aba Mensalidades). Somente a linha visual/UX de pagamento — motor de cálculo e RLS permanecem intactos.

## Comportamento

No diálogo "Forma de pagamento" (que aparece ao clicar em **Pagar** numa mensalidade), quando a parcela estiver com mais de 5 dias de atraso (`pagDiasAtraso > 5`, é a mesma condição que hoje mostra o box vermelho de multa + juros):

1. Aparece um botão secundário **"Isentar juros e multa"** logo acima da grade de formas de pagamento.
2. Ao clicar, abre o `SupervisorAuthDialog` existente (`acao="isentar juros e multa"`, roles `admin` e `gestor`).
3. Autorizado: a tela passa a mostrar o valor da parcela **sem encargos** (`Number(m.valor)`), o box vermelho de encargos é substituído por um aviso amarelo "Juros e multa isentados por {nome do gestor}", e todos os botões de forma de pagamento passam a cobrar o valor original. Um botão pequeno "Reaplicar juros" permite desfazer antes de escolher a forma.
4. A isenção vale só para aquele pagamento; ao fechar o diálogo, some.
5. Ao efetivar o lançamento (via `LancamentoDialog`), o `valor_manual` continua bloqueado — o valor já sai correto porque `initialValor` passa a ser o valor original da parcela.

## Auditoria

Como o pedido foi "só auditoria automática", registra-se um insert em `audit_log` no momento da autorização (antes de abrir a forma de pagamento) com:

- `acao = 'isentar_juros_multa_mensalidade'`
- `entidade = 'contrato_mensalidades'`, `entidade_id = pagMens.id`
- `payload` com: `contrato_id`, `numero_parcela`, `valor_original`, `valor_com_encargos`, `dias_atraso`, `autorizado_por_user_id`, `autorizado_por_nome`, `executado_por_user_id` (usuário logado).

Sem migration nova — a tabela `audit_log` já existe e é usada pelo projeto.

## Arquivos

- `src/components/pages/contratos-page.tsx`
  - Novo estado local `isencaoEncargos: { autorizadoPor: string } | null`.
  - Ajustar `pagValorFinal` para retornar o valor base quando `isencaoEncargos` estiver ativo.
  - Renderizar o botão "Isentar juros e multa" e o `SupervisorAuthDialog` (já importado no projeto).
  - Ao autorizar: `insert` em `audit_log` e set do estado.
  - Reset do estado quando `formaPagOpen` fecha ou `pagMens` muda.

Nenhuma outra tela é afetada. Nenhum arquivo gerado (`types.ts`, `client.ts` etc.) é tocado. Sem alteração no banco.

## Fora de escopo

- Isenção em lote (várias parcelas de uma vez).
- Isenção parcial (só multa, ou só juros).
- Alteração no template do contrato ou no cálculo de juros.
- Fluxos fora da tela de contrato (Financeiro avulso, Agenda).