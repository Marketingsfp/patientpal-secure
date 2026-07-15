
## O que está acontecendo

Você descreveu dois sintomas juntos durante o refresh automático da agenda:
1. A página fica em branco por um instante.
2. Os agendamentos mudam de ordem ou "somem" (ficam invisíveis) e depois voltam.

Analisei o código responsável (`src/routes/_authenticated/app.agenda.tsx` — Agenda principal — e `src/components/agenda-v2/agenda-v2-shell.tsx` — Agenda V2). O comportamento não é aleatório: são **três problemas técnicos combinados**. Todos são de front-end/consulta, não de banco.

## Diagnóstico (linguagem simples)

### Problema 1 — Corrida entre múltiplas cargas ao mesmo tempo (causa principal do "somem")

Na Agenda principal existe uma inscrição de tempo-real (`postgres_changes`) que dispara a função `load()` toda vez que qualquer agendamento da clínica é alterado (por outro operador, pelo caixa, por um pagamento, etc.). Essa função:

- Faz várias consultas em sequência (agendamentos → pacientes → contratos → dependentes → pagamentos → NFS-e).
- **Não tem cancelamento**: se um evento de tempo-real dispara enquanto uma carga anterior ainda não terminou, as duas rodam em paralelo e escrevem no mesmo estado `items`.
- A carga que **termina por último** vence, mesmo quando começou primeiro. Como cada consulta demora um tempo diferente (rede, tamanho da resposta), é normal a resposta mais antiga chegar depois. Resultado: a tela pisca com uma lista incompleta/desatualizada, os cards trocam de posição ou desaparecem por segundos.

Sintoma equivalente que você relatou: "os agendamentos mudam de ordem ou somem".

### Problema 2 — Ordenação sem critério de desempate

A consulta principal ordena só por `inicio` (ASC ou DESC, depende da versão). Quando dois agendamentos têm o mesmo horário — muito comum na agenda de eletrocardiograma, USG, enfermagem, pacotes — o Postgres pode devolver eles em ordem diferente a cada refetch. Isso soma ao efeito de "mudam de ordem" mesmo quando os dados estão certos.

### Problema 3 — Tela em branco no início do refresh

Durante o carregamento inicial após F5 (ou quando o React Query invalida a chave), a Agenda:

- Começa com `items = []` e `loading = false` (a Agenda principal não mostra skeleton até `clinicaAtual` estar disponível).
- Só liga o `loading` **depois** que a `clinicaAtual` chega do contexto — o que leva alguns milissegundos (auth → contexto de clínica → efeito).
- Nessa janela, a UI renderiza o estado "sem agendamentos" (vazio), não o estado "carregando".

Na Agenda V2 o efeito é parecido: quando a chave do React Query muda (clinicaId ou dia), `agsQuery.data` volta a ser `undefined` e a lista renderiza vazia até o novo fetch responder (não há `placeholderData`/`keepPreviousData`).

## Por que só notei agora / por que é intermitente

- Nas conexões rápidas as cargas terminam antes do próximo evento de tempo-real chegar → a corrida quase não acontece.
- Quando a clínica tem muito volume no dia (várias mudanças por minuto no caixa/recepção), a inscrição em tempo-real dispara em rajada e a corrida vira regra.
- Nos horários com muitos agendamentos no mesmo minuto, o desempate ausente amplifica a sensação de "ordem trocada".

## Escopo do que será feito

Ficam dentro do escopo (Agenda, apenas front-end / consultas):

1. **Cancelamento e serialização das cargas em `app.agenda.tsx`** — cada nova `load()` invalida a anterior; respostas que chegam fora de ordem são descartadas.
2. **Debounce ampliado + agrupamento** do canal de tempo-real (`agendamentos`) para evitar refetch em rajada — hoje é 400ms, subir para ~800ms e coalescer eventos.
3. **Estado de carregamento correto no primeiro render** — ligar `loading = true` enquanto `clinicaAtual` não chegou, e manter os `items` anteriores visíveis (não zerar) durante um refetch em segundo plano.
4. **Ordenação estável** — adicionar desempate por `id` na consulta principal (e na V2), para que agendamentos com mesmo `inicio` sempre apareçam na mesma ordem.
5. **Agenda V2** — usar `placeholderData: keepPreviousData` no `agsQuery`, para não voltar a `undefined` durante refetch/troca de dia. Manter o dado anterior visível até o novo chegar.

Ficam **fora do escopo** desta correção (para não misturar assuntos):
- Não vou mexer em regra de negócio (cobrança, NFS-e, reagendamento, etc.).
- Não vou refatorar `load()` inteiro — só adicionar cancelamento, debounce e ordenação.
- Não vou trocar o modelo de estado (continua `useState` na Agenda principal e React Query na V2).
- Não vou alterar RLS, tabelas nem edge functions.

## Detalhes técnicos (para revisão do time)

Arquivos e trechos que serão alterados:

- `src/routes/_authenticated/app.agenda.tsx`
  - Adicionar `loadSeqRef = useRef(0)` e `abortRef = useRef<AbortController | null>(null)`. No início de `load()`, incrementar `seq`, abortar o controller anterior e criar um novo. Antes de cada `setItems/setPagos/setNfse/...`, checar `if (seq !== loadSeqRef.current) return` para descartar respostas obsoletas.
  - Trocar o debounce do canal realtime (linha ~1990) de 400ms para 800ms e agrupar múltiplos eventos numa única chamada.
  - Trocar `.order("inicio", { ascending: false })` para `.order("inicio", { ascending: false }).order("id", { ascending: true })`.
  - Ligar `setLoading(true)` também quando `clinicaAtual` ainda é `null` no primeiro render (ou usar `useClinica().loading` para exibir skeleton).
  - Não zerar `items` no início do refetch — deixar a lista anterior visível até a nova chegar (mantém a tela "não em branco").

- `src/components/agenda-v2/agenda-v2-shell.tsx`
  - No `useQuery` das linhas 302–318 e no prefetch das linhas 337–351: adicionar `.order("id", { ascending: true })` como desempate.
  - Adicionar `placeholderData: keepPreviousData` (import de `@tanstack/react-query`) no `agsQuery` para manter dados anteriores durante refetch/troca de dia.

## Antes e depois (validação)

- **Antes:** F5 ou evento de tempo-real deixa a Agenda em branco por 300–1500ms e/ou reordena/some com os cards.
- **Depois:** F5 mostra skeleton até a resposta chegar; refetch de tempo-real não pisca (a lista anterior fica visível e é substituída atomicamente); ordem de agendamentos com o mesmo horário fica estável entre refetches.
- **Como vou validar:**
  - Abrir a Agenda principal, disparar uma alteração de agendamento em outra aba (mudança de status) e conferir que a lista NÃO some/pisca.
  - Trocar de dia na Agenda V2 e confirmar que a lista anterior permanece até a nova chegar (sem tela vazia).
  - Refresh (F5) mostrando skeleton em vez de "sem agendamentos".
  - Verificar via console/network que só há UMA request `agendamentos` ativa por vez após rajada de eventos.

## Pendências / riscos

- **Risco baixo, área crítica (agenda):** As mudanças são apenas de fluxo de UI e ordenação — não alteram cálculos, cobrança nem status. Ainda assim vou preservar o comportamento atual dos filtros/data/paginação.
- **Regra de negócio:** nada aqui é regra de negócio; caso o time queira mudar a política de refetch (ex.: só recarregar quando a mudança for de outro usuário), isso é uma decisão separada e não está incluída.
- **Se após esta correção o refresh ainda parecer "estranho"**, o próximo passo (fora deste escopo) seria trocar o `load()` monolítico da Agenda principal por queries do React Query com `keepPreviousData`, igualando a V2.

Se aprovar, aplico exatamente estes cinco pontos e reporto o antes/depois com testes rápidos.
