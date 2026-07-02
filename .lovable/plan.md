
## Objetivo
Executar 50 testes automatizados na aba **Orçamentos** (`/app/orcamentos`), criando novos orçamentos via UI, sendo:
- **25 orçamentos de Laboratório** (procedimentos com `tipo = 'exame'` / categoria laboratório)
- **25 orçamentos de demais serviços** (consultas, procedimentos, odontologia, enfermagem, etc.)

## Como será feito

1. **Exploração inicial (leitura apenas)**
   - Ler `src/routes/_authenticated/app.orcamentos.tsx` e componentes filhos usados pelo modal "Novo Orçamento" para mapear campos, validações e fluxo de submit.
   - Consultar no banco: pacientes disponíveis, médicos, procedimentos separados por tipo (laboratório vs. demais), formas de pagamento suportadas.

2. **Preparo do ambiente de teste**
   - Selecionar uma clínica ativa e um conjunto variado de pacientes reais já cadastrados (sem criar novos).
   - Montar 50 combinações variando: paciente, profissional, quantidade de itens (1 a 5), quantidade × valor unitário, desconto (0%, %, valor fixo), forma de pagamento (única e mista), validade e observações.

3. **Execução via Playwright (headless)**
   - Script em `/tmp/browser/orcamentos/` que restaura sessão Supabase, navega para `/app/orcamentos`, abre "Novo Orçamento" e preenche/submete cada cenário.
   - Cenários incluem tanto **caminhos felizes** quanto **erros forçados**:
     - Salvar sem paciente
     - Salvar sem itens
     - Quantidade 0 / negativa
     - Valor unitário com vírgula, ponto e caracteres inválidos
     - Desconto maior que subtotal
     - Divisão de formas de pagamento com soma diferente do total
     - Observações muito longas / com `<script>` (XSS)
     - Data de validade no passado
   - Capturar screenshot em cada falha e coletar toast/erros exibidos.

4. **Verificação no banco**
   - Para cada orçamento supostamente salvo, confirmar `orcamentos` + `orcamento_itens` correspondentes, numeração sequencial, `valor_total` correto e `clinica_id` certo.
   - Marcar todos os 50 registros de teste com prefixo em `observacoes` (ex.: `[TESTE-QA]`) para fácil identificação/limpeza depois.

5. **Relatório final** (entregue no chat, sem alterar código)
   - Total: sucesso × falha por categoria (Laboratório / Demais).
   - Lista dos bugs encontrados: passos para reproduzir, mensagem exibida, comportamento esperado × observado, severidade e sugestão de correção.
   - Observações de UX (lentidão, campos confusos, validações ausentes, mensagens em "linguagem de código" que escaparam do `traduzirErro`).

## O que NÃO será feito nesta etapa
- Nenhuma alteração de código, migração ou correção. Este plano é **somente teste + relatório**. As correções vêm em um segundo plano depois que você aprovar quais bugs priorizar (igual ao fluxo que fizemos na aba Clientes e no Fluxo do Paciente).

## Saída esperada
Um relatório em português no chat listando: cenários executados, erros encontrados (com screenshots referenciados quando útil), e recomendações priorizadas de correção.
