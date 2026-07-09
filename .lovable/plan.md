## Objetivo

1. Fazer com que o número da ficha impresso na GR **nunca mais** divirja do sistema.
2. Impedir que dois funcionários abram/operem a mesma ficha ao mesmo tempo — o segundo recebe alerta de que a ficha está em uso pelo colega.

---

## Parte 1 — Ficha congelada no momento da impressão

Hoje o número da ficha é recalculado toda vez (posição do paciente na lista do dia). Basta alguém inserir um agendamento anterior na grade para todo mundo depois "andar uma casa" — foi exatamente o que aconteceu com a Diva.

**Mudanças:**

- Adicionar coluna `ficha_numero` (int) em `agendamentos`.
- Na primeira impressão da GR do paciente, gravar `ficha_numero` calculado naquele instante (posição atual entre os válidos do dia).
- Em impressões seguintes do mesmo agendamento, reutilizar o valor já gravado — nunca recalcular.
- Na Agenda (colunas Ficha 001/002/…): se o agendamento tem `ficha_numero` gravado, mostrar ele; se não, mostrar a posição atual (comportamento atual). Assim, agendamentos ainda não impressos continuam se ajustando; os já impressos ficam "carimbados".
- Guardar também `ficha_numero` como snapshot em `gr_impressoes` para rastreabilidade histórica (auditoria já vai capturar o resto agora que o trigger existe).

Efeito: se a Diva imprimir 010, ela continua 010 no sistema mesmo que alguém encaixe alguém antes dela depois.

---

## Parte 2 — Trava de ficha em uso (presença colaborativa)

Objetivo: quando o Funcionário A abre a ficha nº 010 na agenda, o Funcionário B ao clicar na mesma vê "Esta ficha está sendo usada por SUELLEN ALEXANDRE BATISTA há 12s. Deseja abrir mesmo assim?" (com opção de continuar ou cancelar).

**Modelo escolhido: presença via Supabase Realtime (channel de presença), sem tabela.**

- Cada usuário que abre um agendamento entra num canal `agendamento:<id>` publicando `{ user_id, nome, entrou_em }`.
- Ao sair (fechar drawer, trocar de ficha, fechar aba, refresh) o canal é encerrado e a presença some.
- Ao tentar abrir uma ficha, o cliente lista os presentes do canal. Se já houver **outro** usuário lá:
  - Se for um agendamento "não sensível" (só leitura), mostra apenas um chip discreto "Também aberto por: FULANO".
  - Se for uma ação sensível (fluxo, editar procedimento/horário, imprimir GR, dar baixa, mudar status): abre modal de confirmação "Ficha em uso por FULANO desde HH:MM. Continuar?" com botões *Cancelar* / *Continuar assim mesmo* (registrado em auditoria via update posterior — a auditoria de agendamentos já foi ativada).

Por que presença e não uma tabela `agendamento_locks`:
- Não precisa de heartbeat/limpeza; Realtime já detecta desconexão.
- Não trava permanentemente uma ficha se o usuário fechar o navegador sem sair "direito".
- Sem risco de lock órfão.

**Onde integrar no front (ganchos existentes):**

- `patient-drawer.tsx` (Agenda V2) — entra no canal ao montar, sai ao desmontar.
- `paciente-quick-actions.tsx` / `procedimento-cell.tsx` (Agenda clássica) — mesmo hook antes de abrir ações sensíveis.
- Novo hook `useFichaPresence(agendamentoId)` centralizando `join/leave/quemEsta` para reutilizar.
- Novo componente `<FichaEmUsoAlert />` (modal + chip) usando o design system HHP.

**Habilitação no banco:**

- `ALTER PUBLICATION supabase_realtime ADD TABLE public.agendamentos;` (opcional, só se quisermos também refresh automático em mudanças — recomendo incluir agora para eliminar o "F5" descrito na auditoria da Agenda V2).
- Presença em si não precisa de tabela; só o canal.

---

## Detalhes técnicos

- Migration: `ALTER TABLE public.agendamentos ADD COLUMN ficha_numero smallint;` + `ALTER TABLE public.gr_impressoes ADD COLUMN ficha_numero smallint;` + índice `(clinica_id, inicio) WHERE ficha_numero IS NOT NULL`.
- `src/lib/print-gr.ts`: antes de calcular a ficha, ler `a.ficha_numero`; se null, calcular e fazer `UPDATE agendamentos SET ficha_numero = X WHERE id = ...` na mesma transação da inserção em `gr_impressoes` (server function `imprimirGr`).
- Exibição na grade (Agenda clássica e V2): usar `ficha_numero ?? posicaoCalculada`.
- Presença: `supabase.channel('ficha:'+agendamentoId, { config: { presence: { key: userId }}}).on('presence',{event:'sync'}, ...).track({nome, entrou_em})`.
- Consulta do nome do outro usuário: já disponível via `profiles.nome` no `useAuth`.

---

## Fora do escopo

- Não alterar números de fichas antigas já existentes (fica NULL até a próxima impressão).
- Não bloquear absolutamente a edição — o segundo usuário pode continuar após confirmar. Bloqueio duro só se você pedir depois.
- Não mexer no cálculo de repasse / caixa.

---

## Ordem de execução (build)

1. Migration (colunas `ficha_numero` + habilitar Realtime na tabela `agendamentos`).
2. Ajustar `print-gr.ts` + server function de impressão para gravar/reusar `ficha_numero`.
3. Atualizar exibição da ficha na Agenda clássica e V2.
4. Criar hook `useFichaPresence` + componente `<FichaEmUsoAlert />`.
5. Plugar nos pontos de abertura de ficha (drawer da V2 + ações sensíveis da clássica).
6. Testar com dois usuários (você e a Suellen, por exemplo) simultâneos.
