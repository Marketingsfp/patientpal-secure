# Salvar mapeamento do "caminho do dinheiro"

Gerar o arquivo `/mnt/documents/caminho-do-dinheiro.md` com o mapeamento ponta a ponta já apresentado no chat, para consulta e download.

## Conteúdo do documento

1. **Origem do valor** — orçamento, agendamento, convênio/cartão benefícios, mensalidade, boleto (tabelas + arquivos).
2. **Recebimento no caixa** — `caixa_sessoes` / `caixa_movimentos` / `fin_lancamentos`, formas de pagamento, definição de "pago" (`pagamento-status.ts`).
3. **Registro contábil** — colunas-chave de `fin_lancamentos`, categorias, contas, RPC `fin_resumo_periodo`, `fin_atendimentos`.
4. **Repasse ao médico** — cascata Cartão Consulta → `medico_convenios` → padrão do médico; splits em `pagamento_splits` via `procedimento_split_regras`.
5. **Saída** — pagamento de repasse (`confirmarPagamento`), aba Repasse no caixa, estorno (`estorno_solicitacoes`), lacuna RH.
6. **NFS-e** — emissão manual, roteamento de CNPJ, Focus NFe.
7. **Diagrama textual** do fluxo.
8. **Tabela de pontos de decisão.**
9. **Lacunas encontradas** (`regras_rateio`, `hr_holerites`, flag `emitir_nfse`, prestadores externos).

## Entrega

- Arquivo: `/mnt/documents/caminho-do-dinheiro.md`
- Nenhuma alteração em código do projeto.
- Preview via `<presentation-artifact>` para download.

Sem impacto em build, banco ou runtime.
