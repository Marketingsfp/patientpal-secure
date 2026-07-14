## Problema

No comprovante de repasse (impressão e reimpressão), o print sai cortado à esquerda e "empurra" o comprovante para a página 2 com uma folha em branco antes (a foto do preview mostra "2 folhas de papel", conteúdo deslocado e recortado).

## Causa

Bloco `@media print` atual em `src/routes/_authenticated/app.financeiro.atendimentos.tsx` (linhas ~2994–3035) usa uma estratégia frágil:

1. Esconde o resto da página com `visibility: hidden`, o que **preserva o layout** — todos os elementos (sidebar, cabeçalho, listas de atendimento) continuam ocupando espaço e empurram o comprovante para baixo, gerando a página 1 em branco.
2. Neutraliza `position/transform` só no `[role="dialog"]`, mas o Radix envolve o dialog em um Portal com wrappers próprios (`data-radix-*`) que continuam com `position: fixed` / transformações. Como `.print-area` é `position: absolute` com `left: 0`, ela se ancora a um desses ancestrais transformados → deslocamento horizontal → corte à esquerda.

## Correção proposta (mudança localizada só no CSS de impressão)

Substituir o bloco `@media print` do diálogo do comprovante por uma abordagem mais robusta, sem tocar em nada da lógica de dados / botões / geração do comprovante:

1. **Esconder de verdade** o restante da página com `display: none` no `body > *` que **não** contém o `.print-area` (usando seletor `:has(.print-area)` — suportado em todos os browsers modernos que os usuários da clínica utilizam para imprimir). Assim, sidebar, listas e demais elementos não ocupam mais espaço e a página 1 deixa de ficar vazia.
2. **Achatar todos os wrappers** do Radix Portal / Dialog (`[data-radix-portal]`, `[data-radix-dialog-overlay]`, `[role="dialog"]` e seus containers): forçar `position: static`, `transform: none`, `inset: auto`, `max-width: none`, `overflow: visible`. Isso remove o "containing block" transformado que estava deslocando o `.print-area`.
3. **Colocar o `.print-area` em fluxo estático** (não mais `position: absolute`), ocupando `width: 100%` da área imprimível do `@page A4 portrait; margin: 12mm`. Sem ancoragem absoluta, não há como o conteúdo vazar para a esquerda da folha.
4. Manter (sem alteração) os ajustes tipográficos existentes: `font-size: 10pt`, paddings da tabela, `break-inside: avoid` nas linhas, quebra de página entre múltiplos médicos, e o modo "Imprimir resumo (médico)".

## Escopo

**Dentro do escopo (só o bloco `<style>` do diálogo do comprovante):**
- Reescrita do `@media print` nas linhas ~2994–3035 de `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.

**Fora do escopo (não será tocado):**
- Estrutura JSX do comprovante, cálculo de valores, ordem dos itens, layout na tela (fora de impressão).
- Lógica de reimpressão / 2ª via (o rótulo vermelho continua igual).
- Outros comprovantes/relatórios do sistema.
- Regras de negócio, banco, RLS.

## Validação

- Build/typecheck automáticos.
- Instruções para o usuário testar: abrir um comprovante existente (repasse já pago), clicar "Imprimir" → verificar que o preview do navegador mostra **1 folha A4** com todos os dados (cabeçalho da clínica, resumo médico/data/forma/conta/atendimentos/total, tabela e linhas de assinatura) sem corte lateral.
- Testar também a 2ª via (reimpressão) a partir do mesmo item.
- Se o comprovante tiver muitos itens e ocupar >1 página, verificar que as linhas da tabela não são cortadas no meio.

## Riscos

- Baixo. A mudança é puramente CSS `@media print`, escopada ao diálogo do comprovante de repasse. Nenhum dado é alterado.
- Único ponto de atenção: o seletor `:has()` — suportado em Chrome/Edge/Safari/Firefox atuais (versões usadas em produção clínica). Se algum totem/estação usar browser muito antigo, um fallback pode ser adicionado; me avise se for o caso.

## Confirmação

Posso implementar dessa forma? Ou você prefere que eu também revise os outros comprovantes/relatórios impressos (não faz parte deste pedido, mas se quiser, listo primeiro os que existem)?