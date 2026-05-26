## Objetivo

Transformar a aba **"Contrato"** (em `Cartão de Benefícios → Convênios`) num editor rico igual ao da aba "Informativo", e adicionar um seletor de **variáveis** que insere placeholders como `{{PACIENTE_NOME}}` na posição do cursor.

## Mudanças

### 1. `src/components/cartao-beneficios/rich-editor.tsx`
- Adicionar nova prop opcional `variables?: { label: string; token: string }[]`.
- Quando a prop existir, renderizar na barra de ferramentas um `Select` "Inserir variável" que, ao escolher um item, executa `editor.chain().focus().insertContent('{{TOKEN}}').run()` e reseta o valor do select.
- Nenhuma outra alteração de comportamento — formatação, tabelas (com redimensionamento + cor), upload de imagens, impressão continuam iguais.

### 2. `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
- Na aba `contrato` (linhas ~683–701):
  - Substituir o `<Textarea>` pelo `<RichEditor value={modeloContrato} onChange={setModeloContrato} clinicaId={clinicaAtual.clinica_id} variables={CONTRATO_VARIAVEIS} />`.
  - Adicionar o botão **Imprimir** (mesmo padrão da aba Informativo) envolvendo o editor num `<div id="convenio-contrato-print">` e replicando o bloco `@media print` para esse id.
  - Manter o texto de ajuda explicando o uso das variáveis (agora também acessíveis pelo dropdown).
- Definir uma constante `CONTRATO_VARIAVEIS` no mesmo arquivo com os tokens já suportados pela renderização de contratos (alinhados a `src/lib/print-contrato.ts`):
  - `CLINICA_NOME`, `CLINICA_CNPJ`, `CLINICA_ENDERECO`, `CIDADE`
  - `PACIENTE_NOME`, `PACIENTE_CPF`, `PACIENTE_NASCIMENTO`, `PACIENTE_ENDERECO`, `PACIENTE_TELEFONE`, `PACIENTE_EMAIL`
  - `VALOR_MENSAL`, `TAXA_ADESAO`, `NUM_PARCELAS`, `VIGENCIA_MESES`, `FIDELIDADE_MESES`
  - `DATA_HOJE`, `DEPENDENTES`

## Observações técnicas

- O campo `modelo_contrato` é `text` no banco — passa a guardar HTML (mesmo formato do Informativo). Sem migração.
- A substituição de `{{VAR}}` em `src/lib/print-contrato.ts` continua funcionando (regex `\{\{(\w+)\}\}` atua sobre o texto, independentemente de tags HTML em volta).
- Não altero o template de `planos_assinatura.template_contrato` (`src/routes/_authenticated/app.planos.tsx`) — fora do escopo pedido.
