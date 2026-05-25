## Mudança solicitada

Na tela de **cadastro/edição de Convênio** (`/app/cartao-beneficios/convenios`), adicionar **duas novas abas** ao formulário, além das já existentes ("Informações" e "Faixas de Preço"):

1. **Contrato** — exibirá o modelo de contrato (texto fixo) que será preenchido com dados das novas vendas. O modelo será enviado por você depois.
2. **Informativo** — exibirá um conteúdo informativo (texto/imagem) somente para visualização e impressão. O modelo virá em Word e será apenas renderizado em tela.

## Como vai funcionar

### Aba "Contrato"
- Mostrará uma área de texto/preview com o **modelo do contrato** (placeholder por enquanto, até você enviar o modelo).
- Reutilizará o campo `modelo_contrato` que já existe na tabela `cb_convenios` (atualmente está oculto da UI).
- Aceitará variáveis como `{{VALOR_MENSAL}}`, `{{PACIENTE_NOME}}`, `{{DEPENDENTES}}`, `{{CLINICA_NOME}}` para preenchimento automático nas vendas.
- Quando você me enviar o modelo, eu colo o texto como valor padrão fixo.

### Aba "Informativo"
- Exibirá o **conteúdo informativo** do convênio (somente leitura na tela).
- Terá um botão **"Imprimir"** para gerar a versão impressa (`window.print()` com layout dedicado).
- Quando você enviar o `.docx`, eu converto o conteúdo para HTML/JSX e deixo fixo na tela.
- Precisará de um novo campo no banco (`informativo` TEXT) — ou, se for sempre o mesmo modelo para todos os convênios, pode ficar hardcoded no componente sem mexer no banco.

## Decisão pendente

Aguardo você enviar:
1. **Modelo do contrato** (texto) — para colocar como padrão na aba "Contrato".
2. **Modelo do informativo** (`.docx`) — para converter e exibir na aba "Informativo".

Enquanto isso, vou apenas criar as duas abas vazias com placeholder ("Aguardando modelo…") e o botão de imprimir na aba Informativo.

## Arquivo afetado

- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — adicionar 2 novos `<TabsTrigger>` + 2 `<TabsContent>` no `<Tabs>` do formulário.

## Detalhes técnicos

- Adicionar ícones `FileText` (Contrato) e `Info` (Informativo) do `lucide-react`.
- Aba "Contrato": `<Textarea>` ligada ao state `modeloContrato` (já existe), com altura maior (`rows={15}`).
- Aba "Informativo": `<div>` com conteúdo placeholder + `<Button onClick={() => window.print()}>Imprimir</Button>`. Adicionar regras `@media print` em `src/styles.css` para esconder navegação/sidebar ao imprimir, se necessário.
- Nenhuma migração de banco por enquanto (o `modelo_contrato` já existe; o informativo entra hardcoded depois).
