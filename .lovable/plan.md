## Corrigir manualmente o repasse do atendimento da Vanderlea

**Diagnóstico:** O lançamento `707961b6-edaf-4689-8f2f-5bf44188298a` (Vanderlea Pereira, TESTE ERGOMETRICO, 09/07/26) tem na descrição "CARTAO CONSULTA + SEGUROS (LIMITE ATINGIDO)". A tela detecta "CARTÃO CONSULTA" e aplica o repasse de Cartão Benefícios do médico (`cb_valor_repasse = R$ 0`), em vez do repasse padrão (R$ 175,00).

## Ação

Como o pagamento real foi por cartão/seguro (limite do cartão consulta foi atingido), remover o rótulo "CARTAO CONSULTA" da descrição do lançamento para que o cálculo caia no repasse padrão do médico (R$ 175,00).

- Alterar `fin_lancamentos.descricao` de:
  - `VANDERLEA PEREIRA DA SILVA DE OLIVEIRA — TESTE ERGOMETRICO — CARTAO CONSULTA + SEGUROS (LIMITE ATINGIDO)`
  - para:
  - `VANDERLEA PEREIRA DA SILVA DE OLIVEIRA — TESTE ERGOMETRICO — SEGUROS (LIMITE CARTAO CONSULTA ATINGIDO)`

A palavra "CARTAO CONSULTA" deixa de estar contígua, então a função `isCartaoConsultaDesc` não a detecta e o repasse volta a R$ 175,00 automaticamente. Não altera nenhum outro registro nem regra do sistema.

## Verificação

Após a alteração, recarregar a tela **Financeiro → Atendimentos** e confirmar que a linha da Vanderlea passa a mostrar R$ 175,00 na coluna Médico e R$ 125,00 na coluna Clínica, com botão de seleção habilitado (deixa de exibir "Sem repasse").