## Problema

Hoje só é possível renovar contrato com `status = 'ativo'` e as parcelas da renovação são geradas a partir da data atual (`CURRENT_DATE` na troca de plano) ou do último vencimento existente. Contratos com renovações antigas realizadas manualmente ficam sem histórico e novas renovações barram.

O objetivo é permitir registrar renovações retroativas informando a data em que a paciente efetivamente renovou (ex.: 27/06/2026), tanto para "Extensão" quanto para "Troca de plano".

## Escopo

1. **Diálogo de renovação** (`src/components/contratos/renovar-contrato-dialog.tsx`)
   - Adicionar campo opcional "Data da renovação" (DateInputBR), default = hoje.
   - Exibir aviso quando a data for anterior a hoje: "Renovação retroativa — as parcelas serão geradas a partir desta data".
   - Enviar a data para as RPCs.

2. **Página de contratos** (`src/components/pages/contratos-page.tsx`)
   - Habilitar o botão "RENOVAÇÃO" também quando o contrato estiver com `status IN ('expirado','vencido','renovado')` ou quando `data_fim < hoje`, marcando-o como "Renovação retroativa".
   - Tooltip explicando que se trata de renovação retroativa.

3. **Migração SQL** — atualizar as duas funções para aceitar `_data_renovacao date DEFAULT CURRENT_DATE` e:
   - `renovar_contrato_extensao`: usar `_data_renovacao` como base para gerar as 12 parcelas (em vez de `MAX(vencimento)`), preservando `dia_vencimento`. Remover a restrição `v_contrato.status = 'ativo'` (aceitar `ativo`, `expirado`, `vencido`, `renovado`), mantendo a checagem de `cancelado_em IS NULL`.
   - `renovar_contrato_troca_plano`: usar `_data_renovacao` como `v_data_inicio` (hoje é `CURRENT_DATE`). Mesma flexibilização de status.
   - Registrar `_data_renovacao` no `renovado_em` e em `contrato_renovacoes.periodo_inicio` para manter histórico correto.

## Regras preservadas

- Renovação continua exigindo todas as 12 parcelas quitadas.
- Renovação **não** cobra taxa de adesão nem carência (regra já vigente).
- Somente membros da clínica podem executar (`is_member`).
- O botão continua desabilitado após uma renovação já registrada para aquele ciclo (tooltip mostra a data).

## Fora do escopo

- Editar renovações passadas já registradas.
- Alterar o cálculo de valores/faixas.
- Retroagir data de parcelas já pagas de renovações anteriores não registradas — usuário registra apenas a partir da data informada.

## Validação

- Testar renovação retroativa (data anterior a hoje) e conferir vencimentos gerados.
- Testar renovação normal (data = hoje) para garantir que não houve regressão.
- Conferir se `contrato_renovacoes` grava o `periodo_inicio` correto.
