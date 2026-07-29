## Problema (confirmado)

O seletor "Clínica de origem" do diálogo de atendimento externo é montado a partir de `memberships` — as clínicas em que o **usuário logado** tem vínculo — excluindo a clínica atual. Usuários como Luan e Elizabete têm vínculo em apenas uma unidade, então a lista fica vazia e só sobra "Outra clínica (digitar)".

Além disso, a tabela `clinicas` só permite leitura para membros (política `clinicas_member_select` com `is_member(auth.uid(), id)`), então simplesmente buscar todas as clínicas do banco também retornaria vazio para esses usuários.

## Solução

1. **Banco**: criar uma função `listar_unidades_basico()` (SECURITY DEFINER, `STABLE`), acessível a usuários autenticados, que devolve apenas dados não sensíveis das unidades ativas: `id`, `nome`, `cidade`, `estado`. Sem CNPJ, telefone, geolocalização ou tokens. Isso mantém a política de RLS atual intacta e expõe só o mínimo necessário para o seletor.

2. **Frontend** (`src/components/agenda/atendimento-externo-dialog.tsx`): ao abrir o diálogo, carregar as unidades por essa função em vez de `memberships`, continuando a esconder a clínica atual e mantendo a opção "Outra clínica (digitar)". Enquanto carrega, mostrar estado de carregamento; se a chamada falhar, cair no comportamento atual (lista de `memberships`) para não travar o registro.

3. Nada muda no cálculo de repasse, na gravação do atendimento externo ou na GR — apenas a origem da lista de unidades.

## Detalhes técnicos

- Migração com `CREATE OR REPLACE FUNCTION public.listar_unidades_basico()` + `REVOKE ALL ... FROM public` + `GRANT EXECUTE ... TO authenticated`, `search_path = public`.
- No componente, substituir o `unidades` derivado de `memberships` por estado carregado via `supabase.rpc("listar_unidades_basico")`, ordenado por nome em pt-BR.
