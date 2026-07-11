## Objetivo
Exibir na aba **Cartão Benefícios → Contratos** o nome de quem realizou a venda (usuário que criou o contrato).

## Como funciona hoje
- A tabela `contratos_assinatura` já tem a coluna `criado_por` (uuid → `auth.users`).
- Contratos criados pelo formulário atual **já salvam** `criado_por` com o usuário logado (linha 581 de `contratos-page.tsx`).
- Contratos históricos (1876 de 1880) têm `criado_por` nulo — para esses vai aparecer "—".
- Hoje a lista não busca nem mostra esse campo.

## Mudanças

### 1. Nova coluna "Vendedor" na tabela de contratos
Adicionar a coluna entre **Pagamento** e **Status** no cabeçalho da lista (`src/components/pages/contratos-page.tsx`):

```text
Nº | Titular/Convênio | Início | Mensal | Pagamento | Vendedor | Status | Assinado |
```

Na célula:
- Se o contrato tem `criado_por` → mostrar o nome do usuário (da tabela `profiles`).
- Se for nulo → mostrar "—" em cinza claro.

### 2. Buscar nomes dos vendedores no `load()`
Após buscar os contratos, coletar os `criado_por` únicos e fazer uma segunda query em `profiles` para trazer `id, nome`. Guardar em um `Map<uuid, nome>` no state para renderizar rapidamente.

### 3. Mostrar também no detalhe do contrato (opcional)
Na aba de detalhe do contrato aberto, incluir uma linha "Venda realizada por: NOME" próximo dos dados de criação (`created_at`). Se preferir manter o escopo mínimo, deixamos só na listagem — me diga na aprovação.

## Fora do escopo
- **Backfill histórico**: os 1876 contratos antigos permanecem sem vendedor identificado (não há como recuperar quem criou). Se quiser, podemos depois adicionar uma tela administrativa para editar o vendedor de contratos antigos manualmente.
- Nenhuma migração de schema é necessária — a coluna já existe.

## Detalhes técnicos
- Arquivos alterados: apenas `src/components/pages/contratos-page.tsx`.
- Query nova: `supabase.from("profiles").select("id,nome").in("id", idsUnicos)`.
- Sem alteração de RLS (a policy atual de `profiles` já permite leitura pelos membros da clínica).