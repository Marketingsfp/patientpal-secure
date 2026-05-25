## Objetivo

Unificar as abas "Contato" e "Endereço" dentro da aba "Dados" no cadastro do médico, mantendo a mesma estrutura visual em blocos (como já é feito com RQE/Especialidades/Procedimentos).

## Mudanças em `src/components/medicos/MedicoFormDialog.tsx`

1. **TabsList**: remover `TabsTrigger` de "Contato" e "Endereço". Ajustar grid de `grid-cols-7` para `grid-cols-5`.

2. **Aba "Dados"**: ao final do conteúdo atual (após os campos pessoais), adicionar dois novos blocos visualmente separados (com título/subseção e divisor) reutilizando o mesmo markup hoje presente em "Contato" e "Endereço":
   - **Bloco "Contato"** — campos atuais (telefone, e-mail, etc.)
   - **Bloco "Endereço"** — campos atuais (CEP, rua, número, etc.)

3. **Remover** os `TabsContent value="contato"` e `TabsContent value="endereco"` (o conteúdo migra para dentro de "Dados").

4. **Ajuste textual**: na aba "Acesso", as referências "também na aba Contato" / "informado na aba Contato" passam a apontar para a seção Contato dentro da aba Dados.

## Fora de escopo

- Nenhuma mudança em lógica de submit, estado do form, validações, RLS, banco de dados ou demais abas (Especialidades, Banco, Repasse, Acesso).
