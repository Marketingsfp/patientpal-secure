## Contexto

Na tela **Visualizar cliente → aba "Convênio"** o sistema exibe hoje:

- Cabeçalho do contrato (nº, vigência, valor mensal, dependentes)
- KPIs (Pagas, Pendentes, Em atraso, Total do contrato)
- Tabela completa de parcelas (Nº, Vencimento, Valor, Status, Pago em, Valor pago)
- Botão **"Pagar"** por linha das parcelas em aberto

Esses dados são exatamente os mesmos exibidos em **Cartão Benefícios → Contratos → aba Mensalidades**, que é a tela oficial de gestão do contrato. Além disso, o botão **"Pagar"** dentro da aba Convênio **hoje não registra pagamento**: ele apenas redireciona para o contrato correspondente no Cartão Benefícios (`/app/cartao-beneficios/contratos?contratoId=...`). Ou seja, já existe uma redundância visual sem ganho funcional.

## Proposta

Transformar a aba **Convênio** do cliente em um **resumo consultivo** e centralizar a operação (mensalidades, pagamentos, edições) na tela de contrato do Cartão Benefícios.

### O que a aba "Convênio" passa a mostrar

Para cada contrato do paciente (como titular ou dependente):

- Cabeçalho com:
  - Tipo (TITULAR / DEPENDENTE)
  - Nome do convênio + número do contrato (#20261894)
  - Status (Ativo / Cancelado / Encerrado)
- Linha de dados principais:
  - Vigência (de / até)
  - Valor mensal
  - Dia de vencimento
  - Nº de parcelas
- KPIs enxutos (mantidos): **Pagas · Pendentes · Em atraso · Total**
- Lista de dependentes vinculados (apenas leitura)
- **Botão principal: "Abrir contrato"** → redireciona para
  `/app/cartao-beneficios/contratos?contratoId=<id>`, onde estão:
  - Aba **Mensalidades** com a tabela completa e ação de pagar
  - Abas **Dados**, **Resumo**, **Histórico**, **Renovação**

### O que sai da aba Convênio

- Tabela detalhada de parcelas (Nº, Vencimento, Valor, Status, Pago em, Valor pago)
- Botão **"Pagar"** por linha das parcelas em aberto
- Lógica local de status "Paga / Em atraso / Pendente" da tabela (deixa de ser necessária)

O código de carregamento de `contrato_mensalidades` na aba Convênio pode ser mantido apenas para calcular os KPIs (contagem/soma), ou substituído por uma agregação mais leve no futuro — a princípio, manter o cálculo existente.

## Por que essa é a melhor opção

- **Uma fonte de verdade:** todas as ações operacionais (pagar, editar valor, editar data de vencimento, "Pago em", salvar alterações em lote, renovar) já vivem na tela de contrato. Concentrar reduz risco de divergência entre as duas telas.
- **Menos superfície de erro:** o botão "Pagar" na aba Convênio já apenas redireciona; remover a tabela evita passar a impressão de que se pode pagar por ali.
- **Ficha do cliente enxuta:** o visualizador de cliente vira consulta rápida ("este paciente tem contrato ativo? quantas parcelas vencidas?"), sem sobrepor a tela dedicada ao contrato.
- **Auditoria mais limpa:** todas as edições financeiras continuam ocorrendo em um único ponto, mantendo o histórico do contrato coeso.

## Detalhes técnicos

- **Arquivo alvo:** `src/components/clientes/cliente-form.tsx`, dentro de `TabsContent value="convenio"` (linhas aprox. 1230–1435).
- Substituir o bloco da tabela `<table>` (linhas ~1380–1428) por um botão primário **"Abrir contrato no Cartão Benefícios"** usando o mesmo `<Link to="/app/cartao-beneficios/contratos" search={{ contratoId: c.id }}>` já em uso.
- Manter o carregamento de `contrato_mensalidades` (usado nos KPIs "Pagas / Pendentes / Em atraso / Total"). Manter dependentes.
- Nenhuma alteração no banco, RPCs, RLS ou na tela de contrato do Cartão Benefícios.

## Fora do escopo

- Não alterar a tela de contrato (`src/components/pages/contratos-page.tsx`).
- Não alterar comportamento de pagamento, buffer de "Salvar alterações", ou datas.
- Não alterar o card menor `PacienteCartoesBeneficios` (já é enxuto e correto).