
## Diagnóstico — onde o valor "desincroniza" entre o % e a cobrança

Investiguei o caminho de ponta a ponta (cadastro da regra → armazenamento → leitura na Agenda). Encontrei **duas fontes de verdade** para o valor do convênio, e é isso que faz o % cadastrado não bater com o valor cobrado.

### 1) Duas fontes de verdade sendo lidas por telas diferentes

- **Fonte A — regra viva:** tabela `cb_convenio_regras`. É o que você edita no formulário "Regras de preço".
- **Fonte B — cache pré-calculado:** tabela `procedimento_cb_convenio_valores` (colunas `valor_dinheiro` e `valor_outros`), gerada pelo botão **"Reaplicar a todos os serviços"** em `src/components/cartao-beneficios/regras-tab.tsx` (linhas 353–463).

Quem lê o quê:
- **Agenda / cobrança** (`src/routes/_authenticated/app.agenda.tsx` linha 552 em diante) → lê a **regra viva** e calcula na hora.
- **Cadastro de Procedimentos** (`src/routes/_authenticated/app.procedimentos.tsx` linhas 488 e 615) → lê primeiro o **cache**; só cai no cálculo da regra quando o cache está vazio.

Consequência prática: se você altera a regra (ex.: muda de 5% para 10%) e **não** clica em "Reaplicar", a grade do cadastro de Procedimentos continua mostrando o preço antigo, mas a Agenda cobra pelo novo. Se você clica em "Reaplicar" com regra errada e depois conserta a regra sem reaplicar, é o contrário. Esse é o "erro de sincronização" que você está vendo.

### 2) O `applyAcrescimoCartao` legado ainda é aplicado num caminho

O comentário em `src/lib/cb-regras.ts` diz que essa função foi descontinuada em favor do campo "valor cartão/PIX" por-regra. Mas:
- `app.procedimentos.tsx` linha 630 **ainda** aplica `applyAcrescimoCartao` sobre o resultado da regra.
- `app.agenda.tsx` linha 4320 **ainda** aplica um equivalente local `aplicarAcrescimoCartaoAgenda` sobre o resultado da regra.

Rodei auditoria: **nenhum convênio ativo tem `acrescimo_cartao_modo` preenchido**, então hoje o efeito é zero — mas o código está armado para dobrar o valor no dia em que alguém marcar essa configuração no convênio.

### 3) Reaplicar apaga e reescreve o cache — mas em fluxo manual

`reaplicar` (linha 437–444) deleta todas as linhas com `origem = 'regra'` e regrava. Isso significa que o cache é **inteiramente derivado** da regra — não deveria existir como fonte de verdade independente. Ele só existe porque a tela de Procedimentos precisa exibir preços por convênio numa grid grande.

### 4) Efeito colateral no cadastro

No `salvar` (linhas 314–318): se `percentual_cartao` estiver `null`, salva igual ao `percentual`; se estiver preenchido, mantém o valor. Isso significa que uma regra editada uma vez com "% cartão = 8" e depois trocada para "% = 10" fica com `10 / 8` — cartão mais barato que dinheiro, sem o operador perceber. Isso amplifica a sensação de "não bate".

---

## Solução (todas as 3 clínicas)

Vou aplicar em uma sequência que zera o descompasso na origem e ainda deixa rastreabilidade para auditoria futura.

### A) Fonte única = regra viva
- Centralizar todo cálculo em uma nova função `precoFinal({ regra, baseDinheiro, baseCartao, forma })` em `src/lib/cb-regras.ts`, retornando `{ valor, memoria }` onde `memoria` descreve regra + base + operação.
- **Agenda:** trocar `aplicarDescontoPorForma` + `aplicarAcrescimoCartaoAgenda` (`app.agenda.tsx` 340–380 e 4318–4325) por chamadas a essa função.
- **Cadastro de Procedimentos:** parar de ler `procedimento_cb_convenio_valores` como fonte primária. A grid passa a calcular pela regra em tempo real (bases já vêm do próprio procedimento). O cache continua existindo por retrocompatibilidade e para exportações, mas nunca mais é lido em fluxos de cobrança/exibição de preço.

### B) Reaplicar automático ao salvar regra
- Após qualquer `insert/update/delete` em `cb_convenio_regras`, rodar automaticamente a mesma rotina do botão "Reaplicar" para aquele convênio, sem depender do clique do operador. Assim, mesmo que alguma tela residual leia o cache, ele sempre está sincronizado.
- O botão manual continua existindo para reprocessamento em massa.

### C) Remover o acréscimo legado dos caminhos
- Apagar `aplicarAcrescimoCartaoAgenda` de `app.agenda.tsx` e a chamada de `applyAcrescimoCartao` em `app.procedimentos.tsx`.
- Manter as colunas `acrescimo_cartao_*` em `cb_convenios` intactas (retrocompatibilidade), mas marcar como não usadas no código. Se algum dia o negócio decidir revê-las, é uma feature nova consciente.

### D) Cadastro de regra sem armadilha de dessincronização
Em `src/components/cartao-beneficios/regras-tab.tsx`:
- Ao editar `percentual`, se `percentual_cartao` estiver igual (ou nulo), continua espelhando; se estiver divergente, avisar com um badge "% cartão fixado em X" e um botão "sincronizar com dinheiro".
- Mesma lógica para `valor` / `valor_cartao`.
- Ao lado dos campos, mostrar em tempo real o R$ resultante para uma base de referência do procedimento selecionado (quando houver serviço), para o operador nunca cadastrar no escuro.

### E) Memória de cálculo no modal de pagamento
- No modal "Forma de pagamento" da Agenda, abaixo de cada linha (Dinheiro / Pix / Débito / Crédito) exibir em texto pequeno: base usada, regra que bateu (nome + prioridade) e a operação: p.ex. `R$ 130 − 10% = R$ 117 (Regra "RM Crânio", prio 10, base cartão)`. Isso encerra o "não bate" no ponto onde ele aparece.

### F) Consertar multi-exame com regra escalar
- No fluxo multi-procedimento (imagem/laboratório) em `app.agenda.tsx` linhas 4269–4325, resolver a regra e o desconto **por procedimento** e somar já com desconto, em vez de aplicar uma única regra ao total. Regras de `valor_fixo` deixam de virar "R$ 80 para 3 exames" e passam a ser R$ 80 × 3.

---

## Validação
- Antes/depois, para 3 casos típicos: (i) regra de % com bases dinheiro/cartão diferentes, (ii) regra de valor_fixo com valor cartão diferente, (iii) multi-exame de imagem com regras diferentes por procedimento.
- Conferir que a grid do cadastro de Procedimentos e o modal da Agenda mostram o mesmo valor final para o mesmo (procedimento × convênio).
- Rodar audit-query nas 3 clínicas confirmando que `cb_convenios.acrescimo_cartao_modo` continua nulo em todos e que nenhum caminho de código ainda o consulta.

## Fora de escopo desta rodada
- Redesenhar a tela de regras.
- Reajustar em massa regras já cadastradas (as regras existentes ficam como estão — o operador continua livre para editar).

## Riscos
- Depois do deploy, o valor exibido na grid do cadastro de Procedimentos passa a **coincidir** com o cobrado na Agenda — ou seja, algumas regras que hoje mostram um valor mas cobram outro **vão passar a mostrar o valor real cobrado**. Recomendo comunicar as clínicas para que revisem as regras antes.
- Remoção do acréscimo legado é segura hoje (nenhum convênio usa), mas se algum operador acabou de habilitar em algum convênio das 3 clínicas, essa configuração para de ter efeito — substituto correto é usar `valor_cartao`/`percentual_cartao` na regra.
