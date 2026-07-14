Tipo de pedido: erro visual/experiência do usuário no comprovante de repasse médico. Não é regra de negócio nem alteração de dados financeiros.

Plano de correção:

1. Trocar a estratégia de impressão atual
   - Hoje o sistema tenta imprimir o comprovante de dentro do modal usando CSS `@media print`.
   - Isso é frágil porque o modal usa camadas centralizadas, posição fixa e transformações; no print preview do navegador, isso pode deslocar o conteúdo e cortar a lateral.
   - Vou parar de depender do layout da tela/modal para imprimir.

2. Criar impressão isolada do comprovante
   - Ao clicar em “Imprimir” ou “Imprimir resumo (médico)”, o sistema vai copiar somente o conteúdo do comprovante para uma área/documento de impressão isolado.
   - Essa impressão terá CSS próprio de A4, sem sidebar, sem fundo da tela, sem modal, sem transformações e sem dependência do restante do aplicativo.
   - Resultado esperado: todos os dados devem aparecer alinhados dentro da folha, sem corte lateral.

3. Manter exatamente os mesmos dados
   - Não vou alterar cálculo de repasse, baixa de pagamento, reimpressão, dados do médico, paciente, serviço, conta ou total.
   - A mudança será apenas na forma de preparar o conteúdo para impressão.

4. Ajustar o layout impresso para caber melhor
   - Definir largura segura para A4.
   - Reduzir espaçamentos da tabela na impressão.
   - Permitir quebra de texto em nomes longos de pacientes, médicos e serviços.
   - Manter valores e datas sem quebra indevida.
   - Garantir que múltiplos médicos/comprovantes quebrem em páginas separadas corretamente.

5. Remover/neutralizar o CSS de impressão anterior desse modal
   - O bloco atual de `@media print` será substituído ou reduzido para não interferir.
   - Isso evita que regras antigas continuem causando deslocamento ou corte.

6. Validação
   - Abrir o comprovante de repasse e acionar a impressão.
   - Verificar que o conteúdo começa dentro da margem esquerda da folha e que a tabela não fica cortada.
   - Verificar também o botão “Imprimir resumo (médico)”.

Arquivos afetados:
- `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

Fora do escopo:
- Não mexer em banco de dados.
- Não mexer em regras de pagamento/repasse.
- Não alterar outros relatórios ou comprovantes fora desta tela.