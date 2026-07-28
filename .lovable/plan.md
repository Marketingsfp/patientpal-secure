## Objetivo

Adicionar, na aba **Orçamento** de Odontologia, um botão para excluir um orçamento — ao lado dos botões de editar e imprimir.

## O que muda na tela

- Nova ação em cada linha da tabela: ícone de lixeira (vermelho), depois do lápis e da impressora.
- Ao clicar, abre uma confirmação mostrando o número do orçamento e o nome do paciente ("Excluir o orçamento D-2026-00001 de FULANO? Esta ação não pode ser desfeita.").
- Depois de confirmar: mensagem de sucesso e a lista recarrega automaticamente.

## Regras de segurança (para não quebrar o financeiro)

- **Bloqueado quando o orçamento já tem item pago** (mesma regra usada hoje para bloquear a edição). O botão fica desabilitado com a explicação no tooltip.
- **Bloqueado quando existe agendamento vinculado** ainda não cancelado — o tooltip avisa que é preciso desvincular/cancelar o agendamento antes.
- Orçamentos com situação "convertido/finalizado" continuam protegidos pela trava que já existe no banco: só Administrador ou Gestor conseguem excluir, e tentativas negadas continuam registradas na auditoria. Nada dessa trava é alterado.
- Se o banco recusar, a mensagem de erro é traduzida e exibida ao usuário, sem sumir a linha da tela.

## Detalhes técnicos

- Arquivo único: `src/components/odontologia/orcamento-tab.tsx`.
- Reaproveita o mesmo padrão do módulo de Orçamentos (`app.orcamentos.tsx`): `supabase.from("orcamentos").delete().eq("id", id)` + `mostrarErro` + `toast` + `load()`.
- Confirmação com `AlertDialog` do shadcn (em vez do `confirm()` nativo) para ficar consistente com o restante da tela.
- Os itens (`orcamento_itens`) e vínculos saem junto por cascade do próprio registro; nenhuma migração de banco é necessária.

## Fora do escopo

- Não altero o módulo geral de Orçamentos nem a impressão.
- Não crio "cancelamento" (status cancelado) — o pedido é exclusão.
