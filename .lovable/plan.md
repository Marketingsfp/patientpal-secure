## Estornar check-in (desfazer "Presente na clínica")

Adicionar no menu de ações (`⋯`) da agenda um item **"Estornar check-in"** que reverte o paciente de `triagem` para `aguardando_recepcao`, útil quando a recepção clicou por engano em "Presente na clínica".

## Regras

- Item aparece **apenas quando** `fluxo_etapa === "triagem"` (paciente já com check-in confirmado, mas ainda não seguiu adiante).
- **Não aparece** se o paciente já passou para etapas seguintes (`em_atendimento`, `laudo`, `finalizado`) — para evitar corrupção do fluxo. Nesses casos usar o cancelamento/reagendamento normal.
- Não aparece em slots livres nem em agendamentos `realizado`.
- Requer confirmação (`window.confirm`) antes de executar, para evitar clique acidental.

## Implementação

Arquivo único: `src/routes/_authenticated/app.agenda.tsx`.

1. Nova função `estornarCheckin(a: Agendamento)`:
   - `confirm("Desfazer check-in deste paciente? Ele voltará para 'aguardando recepção'.")`
   - `UPDATE agendamentos SET fluxo_etapa='aguardando_recepcao', fluxo_atualizado_em=now() WHERE id=a.id`
   - Atualiza `etapaMap` localmente para refletir na UI sem reload.
   - Toast: "Check-in estornado".

2. Novo `DropdownMenuItem` logo abaixo de "Presente na clínica" no dropdown de ações (linha ~5104):
   - Condição: `etapaMap.get(a.id) === "triagem" && !isSlotLivre(a.paciente_nome) && a.status !== "realizado"`
   - Ícone: `Undo2` (já importado do lucide-react) em cor âmbar.
   - Label: **"Estornar check-in"**.

## Verificação

1. Confirmar presença de um paciente pela agenda (badge verde aparece).
2. Abrir o menu `⋯` da mesma linha — deve aparecer "Estornar check-in".
3. Clicar → confirmar no diálogo → paciente volta a mostrar o botão de check-in verde vazado (pendente).
4. Confirmar que a opção some se o paciente já foi para atendimento/finalizado.