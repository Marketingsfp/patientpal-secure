## Objetivo
Executar 50 simulações automatizadas de criação de contrato na aba **Cartão Benefícios → Vendas**, variando todos os campos do formulário, e entregar um **relatório consolidado de erros e sugestões de melhoria**.

## Como vou executar

1. **Reconhecimento da tela** (Playwright headless em `http://localhost:8080`)
   - Restaurar sessão Supabase injetada e navegar para `/app/cartao-beneficios/contratos`.
   - Abrir o diálogo **+ Vendas** e mapear todos os campos: titular, convênio, plano/faixa, valor mensal, vencimento, dependentes, forma de pagamento, data de início, observações, etc.
   - Ler os componentes envolvidos (`contratos-page.tsx`, formulário de venda, `cb_convenio_faixas`, `contratos_assinatura`) para saber quais valores são válidos.

2. **Amostragem de dados reais** (via `supabase--read_query`, somente leitura)
   - Pacientes existentes (para titulares e dependentes)
   - Convênios ativos + faixas (`cb_convenios`, `cb_convenio_faixas`)
   - Regras/procedimentos para validar coerência

3. **Matriz de 50 casos variados** cobrindo:
   - Convênios/faixas diferentes (todas as disponíveis, rotacionando)
   - Valor mensal: valor da faixa, acima, abaixo, R$ 0, campo vazio
   - Vencimento: dias 1, 5, 10, 15, 20, 28, 31, inválido
   - Dependentes: 0, 1, 3, 10, com/sem parentesco, mesmo paciente duplicado
   - Data de início: hoje, passado, futuro distante, inválida
   - Forma de pagamento: cada opção do select
   - Campos obrigatórios em branco (para checar validação)
   - Textos longos / caracteres especiais em observações
   - Titular já com contrato ativo (duplicidade)
   - Submissão dupla (double-click)

4. **Coleta de sinais por caso**
   - Screenshot antes/depois do submit
   - Toast/mensagem de erro capturada
   - Console errors + falhas de rede (status ≥ 400)
   - Estado final no banco (`contratos_assinatura`, `contrato_mensalidades`, `contrato_dependentes`)
   - Tempo de resposta

5. **Limpeza**
   - Marcar contratos gerados com prefixo/observação `SIM-QA-<timestamp>` para permitir remoção depois (não vou apagar sem confirmação).

6. **Entrega**
   - `/mnt/documents/relatorio-cb-vendas-50sim.md` com:
     - Sumário executivo (X sucessos, Y erros, Z avisos)
     - Tabela: caso, entrada, resultado esperado, resultado observado, evidência
     - **Bugs encontrados** (com repro mínima)
     - **Melhorias de UX/validação** priorizadas (alta/média/baixa)
     - Screenshots-chave anexados em `/mnt/documents/cb-sim/`

## Confirmações que preciso antes de rodar

1. **Escrita no banco de produção**: os 50 contratos serão **realmente inseridos** via UI (é o único jeito de testar o fluxo ponta a ponta). Marco todos com tag `SIM-QA` nas observações. Posso executar ou prefere que eu use um **dry-run** só validando formulário (sem submit final)?
2. **Limpeza pós-teste**: depois do relatório, quer que eu **remova** os 50 contratos criados (e mensalidades/dependentes vinculados) ou deixo para você decidir?
3. **Escopo do formulário**: testo só a aba **+ Vendas** (novo contrato) ou incluo também edição, cancelamento, adição de dependente e emissão de mensalidade?

Sem essas respostas eu paro aqui — inserir 50 registros reais e não limpar depois é destrutivo o suficiente para não assumir sozinho.