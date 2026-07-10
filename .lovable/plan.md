## Objetivo

No diálogo **"Marcar laudo emitido"** (Financeiro › Atendimentos), após escolher o **Médico laudador**, o campo **Valor do laudo (R$)** passa a ser preenchido automaticamente a partir do cadastro feito na aba **Repasse** do médico dono da agenda (ex.: Eletrocardiograma).

## Fonte dos dados

Tabela `medico_repasse_laudo` — já é onde a aba "Repasse › Laudo Terceiro" grava as regras.

Chave da busca:
- `clinica_id` = clínica atual
- `agenda_medico_id` = `laudoTarget.medico_id` (a agenda do exame, ex.: Eletrocardiograma)
- `laudador_medico_id` = médico escolhido no dropdown
- `ativo = true`

Cálculo do sugerido:
- `tipo_repasse = "valor"` → usa `valor` diretamente.
- `tipo_repasse = "percentual"` → `laudoTarget.valor_total * percentual / 100`.

## Alterações em `src/routes/_authenticated/app.financeiro.atendimentos.tsx`

1. **Limitar o dropdown "Médico laudador"** aos laudadores cadastrados para a agenda daquele atendimento (`medico_repasse_laudo.laudador_medico_id`), buscando quando o diálogo abrir. Se não houver nenhum cadastrado, mostra a lista atual como fallback e um aviso curto no diálogo.

2. **Ao abrir o diálogo (`openLaudo`)**: se o atendimento já tem `medico_laudador_id`, buscar a regra correspondente e sugerir o valor (se ainda não houver `valor_laudo` gravado).

3. **Ao trocar o médico laudador no `Select`**: disparar a busca da regra `(agenda_medico_id, laudador_medico_id)` e:
   - preencher `laudoForm.valor_laudo` com o sugerido;
   - manter o campo editável (usuário pode sobrescrever);
   - se não existir regra cadastrada, zerar o campo e mostrar um texto discreto: *"Sem regra cadastrada para este laudador — informe o valor manualmente."*

4. **Sem mudanças no `emitirLaudo`**: a gravação continua igual (`valor_laudo` já vem do form).

## Fora de escopo

- Não altera o cadastro em `MedicoFormDialog` nem a página `Laudos ECG`.
- Não muda a estrutura da tabela `medico_repasse_laudo`.
- Não altera o botão "Confirmar laudo emitido".
