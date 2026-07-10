## Diagnóstico

O contrato existe e está ativo:

- **ID**: `9cf00f18-…986f`
- **Nº**: `20261306`
- **Paciente**: ROBERTA SAMPAIO DA SILVA
- **Clínica**: POLICLINICA MENINO JESUS (mesma da sessão)
- **Status**: `ativo` — não está cancelado, nem em outra clínica
- **Criado em**: 11/06/2026

Ou seja, o alerta vermelho "Já possui contrato #20261306" está correto — o dado está lá.

### Por que a busca em "Vendas" não acha

Em `src/components/pages/contratos-page.tsx` (função `load`, linha ~156), a listagem faz:

```ts
supabase
  .from("contratos_assinatura")
  .select("*")
  .eq("clinica_id", clinicaAtual.clinica_id)
  .order("created_at", { ascending: false })
  .limit(500)
```

E o filtro do campo de busca é feito **no cliente**, em cima do que já veio (`list.filter(...)`).

A clínica POLICLINICA MENINO JESUS tem **1878 contratos**. Como só carregamos os 500 mais recentes, o contrato da Roberta (11/06/2026) ficou fora da janela → a busca local retorna "Nenhum contrato", mesmo o registro existindo.

Isso vai acontecer com qualquer contrato antigo de qualquer clínica com >500 registros.

## Correção proposta

Trocar a busca por uma consulta server-side quando há termo digitado, mantendo a listagem inicial paginada.

### Alterações em `src/components/pages/contratos-page.tsx`

1. **Debounce do termo `q`** (~300ms) para não bater no banco a cada tecla.
2. **Novo efeito** que, quando `q` tem ≥ 2 caracteres, refaz o `load` com filtro no banco:
   - `.eq("clinica_id", …)`
   - `.or("paciente_nome.ilike.%<q>%,numero.eq.<q_se_numerico>")` — usar `numero.eq` só quando `q` for numérico; senão só o `ilike` do nome.
   - Manter `.order("created_at", desc)` e `.limit(200)`.
3. **Sem termo** → mantém o comportamento atual (500 mais recentes).
4. Manter o `filtered` local para ordenação por paciente (`sortPaciente`) e como fallback exato — mas sem descartar resultados.
5. Pequeno indicador "Buscando…" enquanto a query roda (reaproveitar `loading`).

Nenhuma mudança de schema, RLS ou lógica de negócio; puramente na camada de leitura da tela de Contratos → Vendas.

## Como validar

1. Abrir Cartão Benefícios → Vendas, buscar por "ROBERTA SAMPAIO DA SILVA" → deve aparecer o contrato #20261306.
2. Buscar por `20261306` → mesmo resultado.
3. Buscar por um paciente com contrato recente (já dentro dos 500) → continua aparecendo, sem regressão.
4. Limpar a busca → volta a listar os 500 mais recentes.
