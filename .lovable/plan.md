## Ajustes na renovação de contrato

Hoje o diálogo de "Renovar contrato" separa duas opções fixas (mesmo plano vs. trocar plano) e a troca não cobra taxa de adesão. Vou transformar o fluxo em uma revisão única, com escolha explícita do convênio, confirmação dos dependentes e cobrança da taxa de adesão sempre que houver troca de plano.

### Comportamento novo

1. **Passo 1 — Novo convênio** (obrigatório): dropdown com todos os convênios ativos da clínica, pré-selecionado com o convênio atual do contrato. Cada item mostra nome, valor mensal e nº de parcelas. Ao lado, resumo do plano escolhido: valor mensal, parcelas, taxa de adesão vigente.
2. **Passo 2 — Dependentes e nº de pessoas**: lista os dependentes ativos do contrato atual com checkbox para manter/remover cada um. O "nº de pessoas no contrato" (titular + dependentes ativos) é recalculado automaticamente conforme os checkboxes; campo apenas leitura, exibido no topo. Botão para adicionar novos dependentes fica fora do escopo desta alteração (continuam podendo ser incluídos depois pela aba de dependentes do contrato).
3. **Passo 3 — Resumo e confirmação**: mostra
   - Convênio anterior → novo
   - Valor anterior → valor da renovação
   - Nº de pessoas no contrato (após ajuste)
   - Parcelas a gerar (do convênio escolhido, default 12)
   - Taxa de adesão que será cobrada: **R$ 0,00** quando o convênio é o mesmo (extensão), ou o valor da taxa de adesão do novo convênio quando houver troca.
   - Campo de observação opcional.

### Regra de taxa de adesão

- Convênio novo = atual → **extensão** do contrato atual (parcelas 13–24 com o valor atual do convênio), sem taxa. Comportamento igual ao atual.
- Convênio novo ≠ atual → **novo contrato** vinculado ao anterior via `contrato_origem_id`, replicando apenas os dependentes que foram mantidos no passo 2, e gerando **taxa de adesão normal** do novo convênio como encargo (`numero_parcela = 0`) — mesmo padrão da venda de contrato novo. Exemplo: Cartão Consulta → Cartão Consulta + Seguros gera novo contrato com taxa de adesão do "+ Seguros".

O texto "A renovação não cobra taxa de adesão" sai; entra uma linha explicando que a taxa só é cobrada quando há troca de plano.

### Alterações técnicas

1. **Migration — RPC `renovar_contrato_troca_plano`**
   - Aceita novos parâmetros: `_dependentes_manter uuid[]` (IDs de `contrato_dependentes` a replicar) e `_cobrar_taxa_adesao boolean default true`.
   - Insere no novo contrato somente os dependentes cujo ID veio em `_dependentes_manter` (mantém `paciente_id`, `paciente_nome`, `parentesco`, `tipo`).
   - Se `_cobrar_taxa_adesao` e o convênio novo tiver `taxa_adesao > 0`, insere uma linha em `contrato_mensalidades` com `numero_parcela = 0`, descrição "Taxa de adesão", valor da taxa, vencimento = hoje, seguindo o mesmo padrão usado hoje na venda de contrato.
   - Registra em `contrato_renovacoes` os campos já existentes (`valor_anterior`, `valor_novo`, `parcelas_geradas`, período) — sem mudança de schema.

2. **Migration — RPC `renovar_contrato_extensao`**: sem mudança de assinatura; continua sem taxa.

3. **Frontend — `src/components/contratos/renovar-contrato-dialog.tsx`**
   - Substituir os dois botões de modo por: Select de convênio (default = atual) + lista de dependentes com checkboxes carregada de `contrato_dependentes` (ativos) + resumo recalculado.
   - Modo (`extensao` vs `troca_plano`) passa a ser derivado: `novoConvenioId === convenioAtualId`. O diálogo já decide qual RPC chamar.
   - No RPC de troca, enviar `_dependentes_manter` (IDs marcados) e `_cobrar_taxa_adesao: true`.
   - Buscar `taxa_adesao` do convênio escolhido para exibir no resumo.
   - Mensagens de toast e confirmação atualizadas.

4. **Frontend — `src/components/pages/contratos-page.tsx`**: nenhuma mudança além da já existente `onRenovado` (que já recarrega ou navega quando é troca).

### Fora de escopo

- Adicionar novos dependentes durante a renovação (continua pela aba de dependentes após a renovação).
- Renovação parcial de parcelas.
- Notificação automática ao paciente.

Confirme para eu executar.
