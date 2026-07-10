
# Vincular laudo (individual e em lote)

Arquivo único: `src/routes/_authenticated/app.financeiro.atendimentos.tsx`.

## 1. Botão da linha na coluna "Laudo"

- Trocar o texto do botão de **"Pagar"** para **"Vincular"**.
- Comportamento **mantido**: continua abrindo o dialog `openLaudo(a)` que já seleciona o médico laudador e calcula o valor automaticamente pela regra de repasse (fluxo confirmado pelo usuário).
- Título do dialog atualizado para "Vincular laudo" (o restante do fluxo `emitirLaudo` fica igual).

## 2. Nova opção no menu "Opções": Vincular vários

Adicionar um novo `DropdownMenuItem` (nos dois menus de Opções — desktop e mobile: linhas ~1698 e ~2322) com o rótulo:

> **Vincular vários laudos**  ({n} selecionados)

Regras de habilitação:
- Fica desabilitado se não houver nenhum atendimento selecionado que precise de laudo e ainda não tenha laudo emitido (usa a mesma lógica de `exigeLaudo` + `laudo_status !== "emitido"` já existente).

Ao clicar abre um novo dialog **Vincular laudos em lote** com:

1. Contagem de atendimentos elegíveis selecionados.
2. Campo **Médico laudador** — dropdown com busca (mesmo Select já usado no dialog individual, reaproveitando a lista de médicos da clínica).
3. Botões **Cancelar** e **Vincular (N)**.

Ao confirmar:

- Para cada atendimento elegível, aplica a regra de repasse do médico da agenda contra o laudador escolhido (mesmo `calcularSugestao`), calcula `valor_laudo`, faz `UPDATE` em `fin_lancamentos` ou `fin_atendimentos` (conforme `origem`) setando:
  - `medico_laudador_id`
  - `valor_laudo`
  - `laudo_status = 'emitido'`
  - `laudo_emitido_em = now()`
- Se algum atendimento não tiver regra cadastrada para aquele laudador, ele é ignorado e listado no toast final (ex.: "8 vinculados, 2 sem regra de repasse").
- Ao final chama `load()` para atualizar a tela. Não abre comprovante em lote nesta versão (evita popup em cadeia).

## Detalhes técnicos

- Novo estado local: `laudoLoteOpen`, `laudoLoteLaudadorId`, `laudoLoteSaving`.
- Nova função `abrirLaudoLote()` (valida seleção) e `vincularLaudoLote()` (executa updates em paralelo com `Promise.all`, agrega resultados).
- Reutiliza a lista de médicos já carregada em `medicos` (state existente) para o dropdown.
- Sem alterações de schema; usa apenas colunas já existentes em `fin_lancamentos` / `fin_atendimentos`.

## Fora de escopo

- Nenhuma mudança em RLS, migrations, ou em outros arquivos.
- O botão "Pagar repasse" médico (do topo da lista) continua como está — a mudança é só na coluna **Laudo**.
