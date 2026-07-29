## Problema

A tela de Contratos carrega no máximo **500 registros** de uma vez (`.limit(500)` na consulta) e faz filtro, ordenação e paginação em memória. A clínica tem **1.776 contratos**, então 1.276 nunca aparecem — a paginação de 50 em 50 só percorre os 500 baixados.

## Objetivo

Mostrar todos os contratos, mantendo 50 por página, com contagem real ("Mostrando 51–100 de 1.776").

## O que muda

**1. Consulta paginada no servidor**
- Trocar `.limit(500)` por `.range(inicio, fim)` com `count: "exact"`, buscando apenas a página atual.
- Guardar o total retornado pelo banco e usá-lo para "Mostrando X–Y de N" e para o número de páginas.
- Recarregar ao trocar de página (a página deixa de ser um recorte local).

**2. Filtros passam a ser aplicados no banco**
Hoje são aplicados em memória; migram para a própria consulta, para que filtrem o conjunto inteiro e não só a página:
- Status, Convênio, Vendedor (`criado_por`), Valor mensal (faixas), Início e Término (intervalos de data).
- Ordenação por paciente (A–Z / Z–A) passa a ser `.order("paciente_nome")` no banco; sem ordenação continua por `created_at` desc.

**3. Filtros de Situação e Parcelas**
Dependem da agregação de mensalidades, que hoje é calculada no cliente. Para funcionarem sobre a base toda, serão resolvidos por uma consulta de apoio que devolve os IDs de contratos que atendem ao critério (em dia / pendente / sem pagamento / em andamento / quitadas), e esses IDs entram na consulta principal com `.in("id", ...)`. Assim a paginação continua correta.

**4. Agregação de mensalidades só da página**
Com 50 contratos por página, o cálculo de parcelas pagas/atrasadas passa a ser feito apenas para os contratos exibidos — mais rápido que hoje e sem risco de truncamento.

**5. Busca por nome/CPF/prontuário**
Continua no servidor como já é, mas também paginada (hoje corta em 200 resultados).

## Detalhes técnicos

- Arquivo principal: `src/components/pages/contratos-page.tsx` (função `load`, memo `filtered`, bloco de paginação).
- `load` passa a depender de `pagina`, filtros e ordenação; a lista local deixa de ser filtrada/fatiada no cliente.
- As opções dinâmicas de Vendedor e Status (hoje derivadas dos registros carregados) passarão a vir de uma consulta própria, para não sumirem opções ao mudar de página.
- Se a consulta de apoio para Situação/Parcelas ficar pesada, ela será substituída por uma função no banco (RPC) que devolve os IDs já filtrados.
