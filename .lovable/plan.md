## Objetivo

Hoje, ao registrar um **Atendimento externo** na agenda, o sistema grava o agendamento (`origem_externa = true`) e o `fin_atendimentos` (valor_clinica = 0, valor_medico = repasse), mas **não imprime GR nenhuma**. A guia só sai no fluxo de faturamento normal, que depende de `fin_lancamentos` — que o externo não gera.

Queremos que o atendimento externo imprima uma GR igual às demais, deixando claro que é externo e que não houve cobrança no caixa.

## O que muda

### 1. GR passa a reconhecer o atendimento externo
Em `src/lib/print-gr.ts` (`printGuiaAtendimentoCore`):

- Ler também `origem_externa`, `origem_clinica_nome`, `origem_valor` do agendamento.
- Quando `origem_externa = true`:
  - Cabeçalho da guia ganha um selo em destaque logo abaixo de "GUIA DE ATENDIMENTO":
    ```text
    ***  ATENDIMENTO EXTERNO  ***
      ORIGEM: <NOME DA CLÍNICA>
    SEM COBRANÇA NESTA UNIDADE
    ```
  - No lugar do bloco "VALOR RECEBIDO" (que hoje some porque `valor = 0`), imprime:
    - `VALOR TABELA: R$ x` (origem_valor)
    - `CLINICA: R$ 0,00`
    - `PRESTADOR: R$ <repasse>` — lido de `fin_atendimentos.valor_medico` do agendamento (fonte da verdade já gravada pela função `marcarAtendimentoExterno`), sem recalcular repasse.
  - Rodapé mantém data/ficha/usuário/impressão nº como nas demais guias.
- Nenhum outro caminho da GR é afetado: o bloco novo só aparece com `origem_externa = true`.

### 2. Impressão automática ao registrar
Em `src/components/agenda/atendimento-externo-dialog.tsx`: depois do `marcarAtendimentoExterno` retornar `ok`, chamar `printGuiaAtendimento` com o `agendamentoId`, `clinicaId`, nome do usuário logado e o número da ficha (quando disponível). Falha de impressão não invalida o registro — mostra toast de aviso.

Mesmo tratamento no ponto equivalente do wizard da Agenda V2, se ele também registra externo.

### 3. Reimpressão
O botão "$" / "Imprimir GR" da agenda já chama `printGuiaAtendimento`/`reimprimirGuiaAtendimento` pelo `agendamentoId`, então a segunda via do externo sai automaticamente com o mesmo selo, contabilizando vias em `gr_impressoes` como qualquer outra guia.

## Detalhes técnicos

- Sem migração de banco: todas as colunas usadas (`origem_externa`, `origem_clinica_nome`, `origem_valor`, `fin_atendimentos.valor_medico`) já existem.
- Layout continua térmico (mesmo `BASE_CSS`), com linhas curtas para não quebrar a impressão de 80mm.
- Número de vias segue a regra atual (`numViasGR`); externo sem forma de pagamento cai no padrão.
