## Objetivo
Gerar um comprovante imprimível ao pagar o repasse do médico, listando cada atendimento pago (data, médico, paciente, serviço e valor do médico), com um resumo no topo.

## Alterações
Arquivo único: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.

### 1. Novo estado + diálogo "Comprovante de repasse"
- Estado `comprovante` guardando: `medicoNome`, `dataPagamento`, `formaPagamento`, `contaNome`, `itens: [{ data, medico, paciente, servico, valorMedico }]`, `totalRepasse`, `qtd`.
- Após `confirmarPagamento` bem-sucedido, montar esse objeto a partir de `selectedItems` (usando `pacMap`, `medMap` e os campos já disponíveis) e abrir o diálogo em vez de só fechar o de pagamento.

### 2. Layout do comprovante
- Cabeçalho: nome da clínica atual, "Comprovante de pagamento de repasse médico", data/hora de emissão.
- Resumo (topo): Médico, Data do pagamento, Forma, Conta, Qtd de atendimentos, **Total pago ao médico** em destaque.
- Tabela: Data | Paciente | Serviço | Valor pago ao médico. Rodapé com total.
- Linha para assinatura do médico e da clínica.

### 3. Impressão
- Botão "Imprimir" no diálogo que chama `window.print()`.
- Envolver o conteúdo com classe `print-area` e adicionar CSS `@media print` (via `<style>` inline no componente) que oculta tudo menos `.print-area`, remove sombras/bordas de dialog e força fundo branco. Botões "Fechar/Imprimir" ficam com classe `no-print`.

### 4. Reimprimir depois
- Adicionar botão de impressora na coluna Ações quando `repasse_pago` for `true` (linha já paga) que reabre o mesmo diálogo com aquele único item, para permitir 2ª via.
- Quando o filtro "Status repasse = Pago" estiver ativo e houver seleção, o botão superior "Pagar repasse" vira "Imprimir comprovante" gerando o comprovante consolidado da seleção.

## Fora de escopo
- Sem alterações em banco/RPC. Sem mudanças em outros arquivos.
