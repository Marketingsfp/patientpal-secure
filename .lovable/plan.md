## Objetivo
Simular o fluxo real de estorno de ponta a ponta usando um dos pagamentos criados na simulação anterior, aprovar como financeiro pela UI e confirmar que a solicitação some do sino/caixa.

## Alvo escolhido
Pagamento **JOAO PEDRO NEVES CANTARELA – CONSULTA – R$ 150,00** (lançamento `653c5041…`, agendamento `fee8e982…` de hoje 09:00). É o mais recente da POLICLINICA MENINO JESUS, ideal para o teste sem afetar dados reais antigos.

## Etapa 1 — Criar a solicitação (via banco)
Inserir 1 linha em `estorno_solicitacoes` como se a recepção tivesse pedido, apontando para o lançamento e agendamento acima:
- `status = 'pendente'`
- `tipo = 'erro_caixa'`
- `motivo = 'SIMULAÇÃO QA — cobrança em duplicidade, favor estornar'`
- `valor = 150.00`, `paciente_nome = 'JOAO PEDRO NEVES CANTARELA'`
- `solicitado_por` = qualquer usuário membro da clínica (uso o próprio Jean para representar a recepção)

Isso dispara o realtime que já existe: o sino no header (`EstornosBell`) e o painel em `/app/financeiro/atendimentos` recebem a solicitação em tempo real.

## Etapa 2 — Aprovar como financeiro (via UI/Playwright)
Abrir `http://localhost:8080/app/financeiro/atendimentos` autenticado, capturar screenshot mostrando o card "1 solicitação(ões) de estorno pendente(s)" com JOAO PEDRO, e clicar em **Aprovar**. Isso executa `aprovarSolicitacao()` que:
1. localiza o lançamento correspondente em `items`;
2. chama `estornar(alvo)` — gera um lançamento de despesa compensatória (estorno) na mesma conta/categoria;
3. marca a solicitação como `status = 'aprovado'` com `resolvido_por/resolvido_em`.

Screenshot pós-clique confirmando o toast "Solicitação aprovada" e o desaparecimento do card.

## Etapa 3 — Verificar no caixa e no sino
1. Navegar para `/app/caixa` e tirar screenshot mostrando os dois movimentos casados (receita R$ 150 + despesa/estorno R$ 150) para o JOAO PEDRO — saldo neutro.
2. Abrir o sino de notificações no header e confirmar que **não há mais solicitação pendente** (`estorno_solicitacoes.status = 'pendente'` zerado para essa clínica).
3. Query final no banco:
   - `SELECT status, resolvido_em, resposta FROM estorno_solicitacoes WHERE id = <novo>` → aprovado.
   - `SELECT tipo, valor, descricao FROM fin_lancamentos WHERE agendamento_id = 'fee8e982…' ORDER BY created_at` → mostra receita original + despesa de estorno.

## Entrega
Tabela resumo + 3 screenshots (solicitação pendente na tela do financeiro, tela após aprovação, caixa mostrando o estorno registrado) e a evidência SQL de que o `status` virou `aprovado` e a despesa compensatória foi criada. Nenhum arquivo de código do projeto é alterado.
