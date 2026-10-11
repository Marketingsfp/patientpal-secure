---
description: Regras de Git e sincronização com Lovable — aplicam-se a todo o repositório
paths:
  - "**"
---

# Regras — Git e sincronização com Lovable

Este repositório está sincronizado com o GitHub (`github.com/Marketingsfp/patientpal-secure`) e com o editor Lovable, que faz sync bidirecional com esse mesmo remoto. Mudanças aqui têm caminho real até produção.

1. **Verifique branch e `git status` antes de começar qualquer alteração.** Nunca presuma que a árvore está limpa ou em qual branch você está — confirme sempre no início da tarefa.

2. **Não trabalhe diretamente na `main` sem autorização explícita.** Prefira criar/usar uma branch dedicada para a tarefa. Se o usuário pedir explicitamente para trabalhar na `main`, confirme antes de commitar.

3. **Não sobrescreva mudanças de outros colaboradores.** Este repositório já tem branches remotas de trabalho em andamento (`qa/ui-functional-fixes`, `security/audit-fixes`) além da `main` — antes de criar uma branch nova ou alterar algo relacionado, verifique se já não há trabalho equivalente em uma dessas.

4. **Proibido**: `git reset --hard`, `git clean -f`, `git push --force` (para qualquer branch, especialmente `main`), e `git rebase` destrutivo — a menos que o usuário peça explicitamente e você tenha confirmado que não há trabalho não salvo em risco.

5. **Faça alterações pequenas.** Prefira commits/diffs pequenos e revisáveis a uma mudança grande de uma vez, especialmente em áreas que tocam RLS, autenticação, financeiro ou prontuário.

6. **Nunca faça `commit`, `push`, `merge` ou deploy sem pedido explícito do usuário na mensagem atual.** Uma autorização anterior não vale para a próxima ação — confirme escopo a cada vez.

7. **Informe como a alteração chega ao Lovable.** Depois de qualquer mudança de código, explique que o caminho é: commit local → push para `origin` (branch de trabalho ou `main`, conforme autorizado) → Lovable sincroniza automaticamente e reconstrói o preview/produção. Deixe claro que você não usa o editor Lovable diretamente — não há ferramenta de escrita de arquivo dentro do Lovable disponível nesta sessão, só leitura (`read_file`, `get_diff`, `list_edits`) e o `send_message` (que delega a edição ao próprio agente do Lovable, consumindo créditos do usuário).

8. **Antes de alterar, confirme se a branch local está atualizada com a remota correspondente** (`git status -sb` mostra "up to date" ou "ahead/behind"). Se estiver desatualizada, avise o usuário antes de prosseguir — não faça `pull`/`fetch` destrutivo por conta própria sem avisar o que vai trazer.

9. Ao final de uma tarefa, informe exatamente **quais arquivos foram modificados**, se algo foi commitado (e onde), e se algo ainda está pendente de push/aprovação.
