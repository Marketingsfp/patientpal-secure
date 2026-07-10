
# Remover menu "Laudos ECG" do Financeiro

- Remover o item **Laudos ECG** do subnav em `src/routes/_authenticated/app.financeiro.tsx` (linha do array `subnav`).
- Excluir o arquivo de rota `src/routes/_authenticated/app.financeiro.laudos-ecg.tsx` (o `routeTree.gen.ts` se regenera).
- Atualizar o texto de ajuda no `MedicoFormDialog.tsx` (linha 1493) para orientar o usuário a filtrar pelo nome do médico em **Financeiro → Atendimentos**.

Sem outras mudanças.
