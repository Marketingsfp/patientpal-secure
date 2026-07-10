## Objetivo

No diálogo "Novo lançamento" (Financeiro → Mov. Caixa), adicionar um campo novo **antes** do "Valor" que controla como a Descrição é preenchida.

## Mudanças

**Arquivo:** `src/routes/_authenticated/app.financeiro.movimento.tsx`

1. **Novo estado** `referenteA: "medico" | "funcionario" | "outros"` (default: `"outros"`) no `form`/`EMPTY`. Ao abrir o diálogo em modo edição, inferir o valor: se a descrição bate com um médico cadastrado → `medico`; se bate com um funcionário → `funcionario`; senão → `outros`.

2. **Carregar listas** ao montar a página (junto dos outros `useEffect` de refs por clínica):
   - `medicos`: `select id, nome from medicos where clinica_id = ... and ativo = true order by nome`
   - `funcionarios`: nomes de `profiles` de `clinica_memberships` com role ≠ `paciente`/`medico` e ativos (mesmo padrão já usado na página Equipe). Ordenar por nome, remover duplicados.

3. **Novo campo no formulário**, inserido logo abaixo do par "Tipo / Data" e acima da Descrição:
   ```
   Label: "Referente a"
   Select com opções: Médico | Funcionário | Outros
   ```
   Ao trocar o valor, limpar `form.descricao`.

4. **Campo Descrição condicional:**
   - `referenteA === "medico"` → `Select` listando `medicos.nome` (grava o nome como string em `form.descricao`). Se a descrição atual não estiver na lista (edição legada), preserva como opção extra, igual ao padrão já usado em "Forma de pagamento".
   - `referenteA === "funcionario"` → `Select` listando funcionários (mesmo padrão).
   - `referenteA === "outros"` → mantém o `<Input>` de texto livre atual.

5. **Sem alterações em lógica de negócio:** o valor salvo em `fin_lancamentos.descricao` continua sendo uma string simples. Nenhum novo campo no banco. Nenhuma alteração em filtros, tabela, export ou permissões.

## Observações

- O campo "Referente a" é apenas auxiliar de UI para escolher entre lista/texto livre; não é persistido.
- Lançamentos existentes continuam a exibir/editar normalmente (fallback para "Outros" quando a descrição não bate com nenhum médico/funcionário conhecido).
