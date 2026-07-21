## Problema

Na 2ª via do "Comprovante de pagamento de repasse", no preview dentro do modal, as colunas **Data** e **Paciente** aparecem coladas (sem espaçamento). No modo impressão sai correto — o preview é que está sem estilo.

## Causa

Em `src/components/financeiro/comprovantes-tab.tsx`:
- O preview usa `dangerouslySetInnerHTML` com o HTML retornado por `renderComprovanteHtml(...)`.
- Todo o CSS da tabela (padding, larguras fixas por coluna, `border-collapse`) fica dentro do `<style>` do iframe de impressão (linhas ~297–321). No dialog esse CSS não existe, então `<td>` sai sem padding e as colunas ficam grudadas.

## Plano

Alteração escopada apenas ao arquivo `src/components/financeiro/comprovantes-tab.tsx`, clínica-alvo: todas (é correção visual de renderização, sem regra de negócio). Se preferir aplicar só à Menino Jesus, me avise antes.

1. Em `renderComprovanteHtml`, prefixar o HTML retornado com um bloco `<style>` escopado (ex.: seletor `.repasse-preview` no wrapper) contendo as mesmas regras já usadas na impressão para: `.header`, `.reimp`, `.resumo`, `table`, `th/td`, larguras `nth-child`, `.sig`, `.mut`, `.tot`.
2. Envolver o conteúdo em `<div class="repasse-preview">…</div>` para não vazar estilos para o restante do dialog.
3. Manter o `<style>` do iframe de impressão como está (redundância inofensiva; o preview continua idêntico ao impresso).

## Antes / Depois esperado

- **Antes:** no preview, "13/07/2026PRISCILA DIAS CRUZ" sai colado.
- **Depois:** colunas com padding, bordas leves e largura fixa (Data 18mm, Paciente 42mm, Serviço auto, Valor 24mm à direita), iguais à versão impressa.

## Validação

- Abrir Financeiro → Comprovantes → visualizar um repasse com múltiplos pacientes e conferir separação das colunas.
- Clicar "Imprimir" e "Imprimir resumo" para garantir que a impressão continua igual.
