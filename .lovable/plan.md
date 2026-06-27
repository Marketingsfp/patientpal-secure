## Diagnóstico

Quando você gera o contrato pelo **Cartão Benefícios → Convênios**, o sistema salva em `contratos_assinatura` com `convenio_id` preenchido e `plano_id = null`. Porém, `src/lib/print-contrato.ts` só busca o texto do modelo na tabela `planos_assinatura` (via `plano_id`). Resultado: o corpo do contrato sai vazio na impressão — por isso só aparece o cabeçalho da clínica e a linha de assinatura (1 folha só, igual à foto).

Além disso, o modelo salvo no convênio é **HTML** (vem do editor rich-text), mas a impressão atual envolve o conteúdo em `<pre>` e faz `escape` de tudo — então mesmo se o template fosse carregado, as tags HTML apareceriam como texto literal.

## Mudanças

Arquivo único: `src/lib/print-contrato.ts`

1. **Carregar o modelo do convênio quando `plano_id` não existir**
   - Manter o `select` em `planos_assinatura` quando houver `plano_id`.
   - Adicionar um `select` em `cb_convenios` (colunas `modelo_contrato`, `num_parcelas`, `vigencia_meses`, `fidelidade_meses` se existirem) quando o contrato tiver `convenio_id`.
   - Usar `_pl.template_contrato` se vier do plano; senão, usar `_conv.modelo_contrato`.

2. **Renderizar HTML quando o modelo for HTML (caso do convênio)**
   - Detectar HTML pela presença de tags (`/<[a-z][\s\S]*>/i`) ou simplesmente assumir HTML quando vier do convênio.
   - No HTML de impressão, trocar `<pre class="body">${esc(corpo)}</pre>` por `<div class="body">${corpo}</div>` quando o conteúdo for HTML; manter `<pre>` + escape quando for texto puro (planos legados).
   - Atualizar o CSS: `.body { font-size: 11pt; line-height: 1.45; } .body p { margin: 0 0 6pt; }` para impressão consistente.

3. **Garantir que `applyTemplate` continue funcionando com HTML**
   - A função já está correta: blocos condicionais `{{#KEY}}...{{/KEY}}` e substituição `{{KEY}}` operam sobre a string bruta. Os valores das variáveis continuam escapados via `esc()`, evitando XSS quando vêm do banco.
   - Nenhuma mudança em `applyTemplate`.

4. **Fallback de campos do plano**
   - `VIGENCIA_MESES` e `FIDELIDADE_MESES`: usar `_pl?.vigencia_meses ?? _conv?.vigencia_meses ?? 12` (mesma ideia para fidelidade).

## Validação manual

- Reimprimir o contrato Nº 20261878 (NICOLY KIDMAN, "CARTÃO CONSULTA + SEGUROS"): o corpo agora deve ocupar várias páginas e os blocos `{{#DEPENDENTE_2}}...{{/DEPENDENTE_2}}` etc. devem sumir quando não houver dependente.
- Reimprimir um contrato antigo que ainda usa `plano_id` (planos legados em texto puro): deve continuar imprimindo igual a antes.

## Fora de escopo

- Não mexer em `applyTemplate`, no editor de convênios, no banco, nem nos modelos salvos.
- Não alterar a tela de venda nem o fluxo de assinatura pública (`/p/contrato/:token`) — o problema relatado é só na impressão A4 a partir do app.
