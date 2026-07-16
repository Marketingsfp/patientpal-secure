## Problema

Na página **Cartão Benefícios → Contratos**, a tabela mostra apenas ~10-12 contratos e a barra de paginação (Anterior / Próxima) fica cortada no rodapé.

## Causa

O componente `Table` está com `containerClassName="max-h-[70vh]"` (linha 516 de `src/components/pages/contratos-page.tsx`). Isso limita a altura do container da tabela a 70% da viewport (~447px em telas de ~640px de altura), forçando um scroll **interno** que:

1. Corta as linhas além das ~12 primeiras (as outras 38 da página só aparecem rolando dentro da tabela — pouco intuitivo).
2. Deixa a barra de paginação (que está fora do scroll interno, logo abaixo da tabela) empurrada para fora da viewport.

Como já existe paginação de 50 em 50, esse scroll interno é redundante.

## Correção

Remover o `max-h-[70vh]` do `Table`, deixando o scroll da página cuidar da rolagem. O cabeçalho continua `sticky top-0` e a barra de paginação fica logo abaixo dos 50 registros, visível junto do restante do conteúdo.

### Arquivo afetado
- `src/components/pages/contratos-page.tsx` — linha 516: trocar `<Table containerClassName="max-h-[70vh]" ...>` por `<Table className="max-lg:table max-lg:overflow-visible">` (sem `containerClassName`).

## Antes x Depois
- **Antes:** só ~12 linhas visíveis, scroll interno confuso, paginação cortada.
- **Depois:** todas as 50 linhas da página renderizadas na sequência; paginação "Anterior / Página X de Y / Próxima" visível logo abaixo.

## Fora do escopo
- Não altero a lógica de busca (`.limit(500)`), filtros, nem o tamanho de página (50).
- Não mexo em outras telas que usam o mesmo componente `Table`.