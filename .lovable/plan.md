## Renovação de Contrato de Convênio

### Comportamento

- Botão vermelho **"RENOVAR CONTRATO"** aparece no cabeçalho do contrato **somente quando todas as 12 parcelas de mensalidade estão pagas** (taxa de adesão e taxas de inclusão não contam).
- Ao clicar, abre diálogo de confirmação com dois caminhos:
  1. **Renovar mesmo plano** → estende o contrato atual, gerando parcelas 13–24 com o **valor atual do convênio** (buscado do cadastro `cb_convenios`), mantendo dependentes e configuração.
  2. **Alterar convênio** → abre wizard reduzido para escolher novo convênio; encerra o atual (marca `renovado_em`) e cria **novo contrato** vinculado por `contrato_origem_id`.
- Confirmação final antes de gravar, mostrando: novo período, novo valor mensal, nº de parcelas geradas e se haverá taxa (renovação não cobra taxa de adesão por padrão).

### Histórico

Nova tabela `contrato_renovacoes` registrando cada renovação:
- `contrato_id` (origem), `contrato_novo_id` (quando trocou de plano, senão null)
- `tipo`: `extensao` | `troca_plano`
- `convenio_anterior_id`, `convenio_novo_id`
- `valor_anterior`, `valor_novo`
- `parcelas_geradas` (int), `periodo_inicio`, `periodo_fim`
- `usuario_id`, `created_at`, `observacao`

Exibido em nova aba/seção **"Histórico de renovações"** dentro do contrato.

### Técnico

1. **Migration**
   - `contrato_renovacoes` (com GRANTs + RLS por `clinica_id`).
   - `contratos_assinatura`: adicionar `contrato_origem_id uuid`, `renovado_em timestamptz`, `numero_renovacoes int default 0`.
2. **RPC `renovar_contrato`** (`extensao`): valida 12/12 pagas, busca valor atual do convênio, insere 12 novas `contrato_mensalidades` com `numero_parcela = 13..24`, atualiza `data_termino` do contrato, grava `contrato_renovacoes`, registra `audit_log`.
3. **RPC `renovar_contrato_trocando_plano`** (`troca_plano`): cria novo contrato (reaproveitando dependentes conforme escolha), encerra atual, grava histórico.
4. **Frontend** em `contratos-page.tsx`:
   - Helper `podeRenovar(contrato, mensalidades)` — 12 parcelas de mensalidade com status pago.
   - Botão vermelho no header do contrato quando `podeRenovar`.
   - `RenovarContratoDialog` com as duas opções.
   - Aba "Histórico de renovações" listando registros de `contrato_renovacoes`.

### Fora de escopo

- Notificação/lembrete automático ao paciente.
- Recalcular taxa de adesão na renovação (não cobra por padrão; pode ser adicionado depois se necessário).
- Renovação parcial (só alguns dependentes).

Confirme para eu executar.
