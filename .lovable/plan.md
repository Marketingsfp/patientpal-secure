## Objetivo
Transformar a aba **Informativo do Convênio** num editor rich-text completo: formatação de fonte (família/tamanho/cor/negrito/itálico/sublinhado), listas, alinhamento, tabelas (inserir/+linha/+coluna/excluir), upload de imagens e impressão em A4.

## Mudanças

### 1. Banco de dados (migração)
- Adicionar coluna `informativo_html text` em `cb_convenios`.
- Criar bucket de Storage `cb-informativos` (público para leitura, escrita restrita).
- Policies em `storage.objects`:
  - SELECT público para `bucket_id = 'cb-informativos'`.
  - INSERT/UPDATE/DELETE apenas para membros da clínica (validar via `is_member(auth.uid(), ...)` usando o primeiro segmento do path como `clinica_id`).

### 2. Novo componente: editor rich-text
`src/components/cartao-beneficios/rich-editor.tsx` baseado em **TipTap** com:
- StarterKit, Underline, TextStyle + Color, FontFamily, TextAlign, Link
- Table + TableRow + TableHeader + TableCell (resizable)
- Image (com upload para o bucket `cb-informativos`)
- Toolbar com: desfazer/refazer · família e tamanho de fonte · N I S U · cor · alinhamento · listas · H1-H3 · tabela (inserir, +linha, +coluna, excluir linha/coluna/tabela) · inserir imagem · link
- Editor renderizado dentro de um container A4 (210mm) com classes `prose`
- Props: `value: string`, `onChange: (html) => void`, `clinicaId: string` (usado no path do upload)

### 3. Rota de convênios
`src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`:
- Estado novo: `informativoHtml`.
- `openEdit`: carregar `c.informativo_html`; se vazio e o nome casar com CARTÃO CONSULTA + SEGUROS, usar o HTML do componente atual como seed inicial.
- `openNew`: limpar estado.
- `save`: incluir `informativo_html: informativoHtml || null` no payload.
- Substituir o conteúdo da `<TabsContent value="informativo">` pelo `<RichEditor value={informativoHtml} onChange={setInformativoHtml} clinicaId={clinicaAtual.clinica_id} />`.
- Manter o botão **Imprimir** e o CSS `@page size: A4` (escondendo o resto da UI durante a impressão e mostrando só o `#convenio-informativo-print`).

### 4. Seed do informativo "CARTÃO CONSULTA + SEGUROS"
Mover o conteúdo do componente fixo `informativo-cartao-consulta-seguros.tsx` para uma constante HTML usada apenas como ponto de partida quando o convênio não tem `informativo_html` salvo ainda. Após o primeiro salvamento, prevalece sempre o que estiver no banco.

### 5. Dependências
`@tiptap/react`, `@tiptap/pm`, `@tiptap/starter-kit`, `@tiptap/extension-color`, `@tiptap/extension-text-style`, `@tiptap/extension-font-family`, `@tiptap/extension-underline`, `@tiptap/extension-text-align`, `@tiptap/extension-table`, `@tiptap/extension-table-row`, `@tiptap/extension-table-cell`, `@tiptap/extension-table-header`, `@tiptap/extension-image`, `@tiptap/extension-link`.

## Fora de escopo
- Versionamento/histórico do informativo
- Editor colaborativo em tempo real
- Conversão direta de DOCX → HTML dentro do app (continua-se podendo colar do Word; formatação básica é preservada pelo TipTap)
