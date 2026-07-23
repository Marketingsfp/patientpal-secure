## O que muda

Hoje, quando você informa o nº de um orçamento na tela de agendamento, o sistema pega **todos os itens que ainda não foram agendados** e junta num único agendamento (foi por isso que apareceu "Marcando 2 exames em uma única ficha" com BLOCO DE CERAMICA + COROA EM PORCELANA).

Vamos passar a abrir um **pop-up de seleção de itens** sempre que o orçamento for da especialidade **Odontologia**. O usuário marca com checkbox quais itens quer usar naquele agendamento. Os itens não marcados permanecem disponíveis e o mesmo orçamento pode ser usado várias vezes até esgotar os itens ou até o orçamento expirar/ser cancelado.

Aplicação: **as 3 clínicas** (SFP, Menino Jesus, Policlínica).

## Fluxo novo (Odontologia)

1. Usuário digita o nº do orçamento e clica em buscar.
2. Sistema carrega os itens restantes (já filtra o que foi consumido por agendamentos ativos, como hoje).
3. Se o orçamento for de Odontologia e tiver mais de 1 item restante → abre pop-up **"Escolher itens do orçamento"** com:
   - Cabeçalho: nº orçamento, paciente, quantos itens já foram agendados (ex: "2 de 5 já agendados").
   - Lista de itens restantes com checkbox, descrição, dente(s) FDI (quando houver) e valor.
   - Botões "Marcar todos" / "Limpar".
   - Rodapé com contagem e "Confirmar seleção".
4. Ao confirmar, o agendamento é preenchido só com os itens marcados e vincula apenas eles em `agendamento_orcamento_itens`.
5. Se sobrar 1 item apenas ou o usuário marcar tudo, o comportamento final é o mesmo de hoje.

Nada muda para orçamentos de outras especialidades (laboratório, imagem, consulta, misto entre grupos etc.) — o fluxo atual segue igual.

## Regra de expiração / esgotamento

- Orçamento cancelado ou expirado (`status = 'cancelado'` ou `validade < hoje`) → bloqueia com mensagem clara, como já faz para cancelado hoje. Passa a checar validade também.
- Todos os itens já agendados → mensagem "Todos os itens deste orçamento já foram agendados" (comportamento atual mantido).

## Onde mexer (técnico)

- `src/routes/_authenticated/app.agenda.tsx` — função `buscarOrcamento`: detectar se o orçamento é de Odontologia (via `procedimentos.grupo`/`especialidade` dos itens ou `orcamentos.especialidade_id`) e, se sim, abrir o novo dialog em vez de auto-vincular tudo.
- Novo componente `src/components/agenda/selecionar-itens-orcamento-dialog.tsx` — pop-up com checkbox, semelhante em estilo ao `DividirOrcamentoDialog` existente.
- Ao confirmar, reutiliza o caminho existente: `setPendingOrcItemIds(idsSelecionados)` + preenche `form.procedimento`, `orcamento_id`, `orcamento_numero` com base só nos itens marcados. Nenhuma mudança de schema.
- Validação de `validade` do orçamento adicionada no `buscarOrcamento` (a coluna `validade`/`data_validade` já existe em `orcamentos`; confirmo no momento da implementação).

## Antes x Depois

- **Antes:** informar o nº do orçamento na agenda enfia todos os itens pendentes numa única ficha, sem opção de escolher.
- **Depois:** para Odontologia, você escolhe no pop-up quais itens entram naquele agendamento e reutiliza o mesmo orçamento em vários agendamentos até esgotar.

## Fora do escopo

- Fluxo de outras especialidades.
- Mudança na conversão do orçamento pelo drawer da Odontologia (`ConversaoOrcamentoDialog`) — continua como está.
- Alterações no odontograma ou na impressão do orçamento.
