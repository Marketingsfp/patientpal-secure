## Objetivo
Corrigir a página **Recursos Humanos → Contratos**, para que o clique em **+ Novo funcionário** e no **lápis de editar** realmente abra a tela do formulário (rota `/app/hr-contratos/novo` e `/app/hr-contratos/<id>`).

## Causa do problema
Hoje existem dois arquivos de rota:

- `src/routes/_authenticated/app.hr-contratos.tsx` (lista de funcionários)
- `src/routes/_authenticated/app.hr-contratos.$id.tsx` (formulário de novo/editar)

Pelas regras do TanStack Router, o primeiro vira **rota-pai (layout)** do segundo. Uma rota-pai só mostra o conteúdo da rota-filha se o componente da pai renderizar um `<Outlet />`. O componente atual da lista não tem `<Outlet />`, então:

- A URL muda para `/app/hr-contratos/novo` ou `/app/hr-contratos/<id>`.
- O formulário casa a rota, mas não tem onde ser desenhado.
- Na tela continua aparecendo a lista, dando a impressão de que "não abriu".

## Correção proposta (apenas estrutura de rotas — nada de regra de negócio)
Transformar a lista em um **leaf** próprio, para que a rota `/hr-contratos/<id>` deixe de ser filha da lista:

1. Renomear `src/routes/_authenticated/app.hr-contratos.tsx` para `src/routes/_authenticated/app.hr-contratos.index.tsx`.
2. Atualizar dentro desse arquivo a chamada `createFileRoute("/_authenticated/app/hr-contratos")` para `createFileRoute("/_authenticated/app/hr-contratos/")` (novo caminho gerado pelo plugin do TanStack).
3. Não alterar o arquivo do formulário (`app.hr-contratos.$id.tsx`); ele continua responsável por `/hr-contratos/novo` e `/hr-contratos/<id>`.
4. Deixar o `routeTree.gen.ts` ser regenerado automaticamente pelo plugin — não editar à mão.

Com isso, `/hr-contratos` continua abrindo a lista, e `/hr-contratos/novo` / `/hr-contratos/<id>` passam a abrir o formulário normalmente.

## Fora do escopo
- Não mexer em lógica de salvar, permissões, campos do formulário, RLS, banco, ou em qualquer outra tela.
- Não alterar o design ou o comportamento do botão de excluir, do buscar, do redirecionamento vindo da aba Equipe.

## Validação
- Abrir `/app/hr-contratos` e confirmar que a lista continua igual.
- Clicar em **+ Novo funcionário** → deve abrir a tela "Novo funcionário" com o botão "← Voltar para funcionários".
- Clicar no **lápis** em uma linha → deve abrir "Editar funcionário — <nome>".
- Clicar em **Voltar** → deve retornar para a lista.
- Fluxo vindo da aba Equipe (parâmetro `editUserId`) deve continuar redirecionando para a tela de edição.

## Clínica-alvo
Correção puramente técnica de roteamento (bug de código). Vale para todas as clínicas — não há regra de negócio envolvida. Confirmar antes de aplicar se quer que eu suba a correção global.