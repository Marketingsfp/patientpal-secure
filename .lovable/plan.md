## Objetivo

No registro de **Atendimento externo**, o valor deixa de ser um campo digitável. Ele aparece pronto, calculado pela tabela de preços desta clínica, apenas como base do repasse do médico — com aviso claro de que não entra no movimento de caixa da atendente.

## O que muda

### 1. Diálogo da Agenda clássica (`src/components/agenda/atendimento-externo-dialog.tsx`)
- Substituir o `Input` editável por um bloco de leitura mostrando o valor formatado (`R$ 0,00`), com estado "Buscando na tabela…" enquanto carrega.
- Se o serviço não tiver preço cadastrado, exibir "Sem valor na tabela desta clínica" (o registro continua permitido, valor nulo).
- Remover o estado de digitação; manter apenas o valor buscado, enviado como está para `marcarAtendimentoExterno`.
- Aviso destacado (faixa âmbar com ícone de alerta):
  "Este valor é usado apenas para o repasse do médico. Não entra no movimento de caixa da atendente e não gera nota fiscal."

### 2. Aba "Externo" do wizard V2 (`src/components/agenda-v2/novo-agendamento-wizard.tsx`)
- Mesmo tratamento: campo de valor vira exibição somente leitura, alimentado pela mesma busca de preço, com o mesmo aviso.

### 3. Sem mudanças de backend
`marcarAtendimentoExterno` já busca o preço no banco quando o valor chega nulo, e já cria o `fin_atendimentos` com `valor_clinica = 0`. A regra de negócio permanece intacta; a alteração é de interface.

## Detalhes técnicos
- Reaproveita `valorDaTabela` de `src/lib/agenda/atendimento-externo-preco.ts` e a consulta já existente em `procedimentos` (`valor_dinheiro`, `valor_dinheiro_pix`, `valor_padrao`).
- Estados `valor`/`externoValor` passam de string editável para número (ou `null`) somente de leitura.
- Nenhuma migração de banco.
