## Problema observado

Na tela da Agenda (Novo/Editar agendamento), o campo "Nº do orçamento" só aceita dígitos: qualquer letra ou traço digitado é apagado na hora (`replace(/\D/g, "")`). Os orçamentos de Odontologia são exibidos no formato **D-2026-00001**, então o usuário digita esse código e o campo não aceita — e se digitar só "1" ou "00001", a busca não encontra nada, porque no banco o número gravado é `202600001`.

Confirmado no banco: existe 1 orçamento com série "D" e número `202600001`; os demais (sem série) usam a mesma faixa numérica.

Classificação: erro de experiência do usuário / busca (não é regra de negócio nova, não altera valores nem financeiro).

## Escopo

Somente o campo de busca de orçamento dentro da tela da Agenda (`src/routes/_authenticated/app.agenda.tsx`). Nada de mudança em preços, regras de convênio, pagamento, impressão ou banco de dados.

## O que será feito

1. **Campo passa a aceitar o código completo**: permitir letras, traços e espaços na digitação (ex.: `D-2026-00001`, `d 2026 00001`, `D202600001`), além do número puro atual.
2. **Interpretação inteligente do que foi digitado** antes de consultar:
   - Se vier no formato `LETRA-ANO-SEQUÊNCIA`, monta o número interno (ano + 5 dígitos) e busca também pela série.
   - Se vier só o número longo (`202600001`), busca como hoje.
   - Se vier um número curto (`1`, `87`, `00001`), busca primeiro pelo número exato e, se não achar, tenta como sequência do ano corrente (ex.: `1` → `202600001`), cobrindo tanto orçamentos sem série quanto os da série D.
3. **Placeholder e texto de ajuda atualizados** para indicar os dois formatos aceitos (ex.: `123` ou `D-2026-00001`).
4. **Mensagem de erro mais clara** quando não encontrar: mostra o código exatamente como o usuário digitou.
5. **Confirmação de vínculo** passa a exibir o número formatado (usando o helper já existente `formatNumeroOrcamento`), em vez do número cru.

O restante do fluxo já existente continua igual: orçamento odontológico segue abrindo o pop-up de seleção de itens, exigindo dentista da especialidade Odontologia e respeitando itens já pagos, validade e cancelamento.

## Detalhes técnicos

- Ajuste no `onChange` do input de orçamento e na função `buscarOrcamento` em `app.agenda.tsx`.
- Nova função utilitária de parsing (reaproveitando `src/lib/orcamento-numero.ts`, adicionando o inverso `parseNumeroOrcamento`) para converter texto digitado em `{ serie, numero }`.
- A consulta continua filtrada por `clinica_id`; quando houver série detectada, adiciona `.eq("serie", serie)`.
- Sem migração de banco.

## Pendência a confirmar

Em qual(is) clínica(s) essa mudança deve valer? Como é apenas correção de comportamento do campo de busca (sem regra de negócio), a proposta é aplicar **globalmente às 3 clínicas** — confirme se concorda ou se prefere restringir a uma clínica via feature flag.
