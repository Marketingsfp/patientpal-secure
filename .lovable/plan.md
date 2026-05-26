## Mudanças

### 1. Migração — `cb_convenios.termo_inclusao_html`
Adicionar coluna `termo_inclusao_html text NULL` para guardar o HTML do termo (mesmo formato do `informativo_html`).

### 2. `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`
- Tipo `Convenio`: adicionar `termo_inclusao_html: string | null`.
- Novo state `const [termoInclusaoHtml, setTermoInclusaoHtml] = useState("")`.
- `openNew`: resetar para `""`.
- `openEdit`: carregar `c.termo_inclusao_html ?? ""`.
- `save`: incluir `termo_inclusao_html: termoInclusaoHtml.trim() || null` no payload.
- `<TabsList>`: nova `<TabsTrigger value="termo">` com ícone `FileSignature` (ou `ScrollText`).
- Nova `<TabsContent value="termo">` espelhando exatamente a aba **Informativo**:
  - Cabeçalho "Termo de Inclusão" + botão **Imprimir**.
  - `<div id="convenio-termo-print">` envolvendo `<RichEditor value={termoInclusaoHtml} onChange={setTermoInclusaoHtml} clinicaId={clinicaAtual.clinica_id} />`.
  - Bloco `<style>` com regras `@media print` idênticas às do Informativo, mas usando o id `#convenio-termo-print`.

Nada mais é alterado.
