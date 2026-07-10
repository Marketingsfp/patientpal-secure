# Contexto do sistema — ClinicaOS / Health Hub Pro (patientpal-secure)

## O que é o sistema

Sistema de gestão para clínicas médicas (multi-tenant, multi-clínica): agenda, prontuário,
financeiro, caixa, cartão de benefícios, RH, CRM, atendimento via WhatsApp (Nina), etc.

- **Stack:** React 19 + TypeScript 5.8 + Vite 7 + TanStack Start/Router + TanStack Query
- **UI:** Tailwind CSS + shadcn/ui (Radix primitives)
- **Backend:** Supabase (Postgres + Auth + RLS), hospedado no **Lovable Cloud**
- **Deploy/editor:** o projeto é editado tanto localmente (Claude Code) quanto ao vivo pelo
  editor da Lovable (outra pessoa da equipe edita por lá simultaneamente) — o GitHub é a
  fonte de verdade compartilhada entre os dois fluxos.
- **Repo:** `github.com/Marketingsfp/patientpal-secure`, branch `main`
- **Projeto Lovable:** id `9cab2db5-e9b1-4209-b352-fc7a438da482`, app publicado em
  `https://patientpal-secure.lovable.app`
- **Banco:** Supabase project ref `odllhxwadsrnhphzoevl`

## Particularidade importante do fluxo de trabalho

Como o editor da Lovable sincroniza automaticamente com o GitHub (commits do tipo
`gpt-engineer-app[bot]` / mensagens genéricas `"Changes"`), **o remoto avança
constantemente enquanto se trabalha localmente**. Qualquer push precisa de
`git fetch` + `git merge origin/main` antes, em loop até não haver rejeição — já
aconteceu mais de uma vez o remoto avançar centenas de commits no meio de uma sessão.

## Arquivo principal do bug atual

`src/routes/_authenticated/app.agenda.tsx` — rota `/app/agenda`, arquivo com ~5.300+
linhas, tela principal de agendamentos da clínica (lista tabular com colunas: Ficha,
Dia, Data, Intervalo, Profissional, Cliente, Serviço, Alertas, Ações). Tem paginação
(rodapé "Total: 797", páginas 1-5+) e filtros (Profissional, Agenda, Data, Dia da
semana, Cliente, Nº Ficha, Atend. Múltiplo, Especialidade, Situação).

Confirmado que **não existe** um "agenda-v2" concorrente sendo exibido aqui — é
sempre este mesmo arquivo (havia uma suspeita inicial de estar vendo outra versão,
descartada: a barra de ferramentas rica com "Turno OFF", "Lista/Por médico",
"Criar/gerar horários" etc. pertence a este mesmo arquivo, só não tinha aparecido
nos prints anteriores por estar fora do recorte da tela).

## O bug: numeração da coluna "Ficha" duplicada/errada

### Requisito confirmado com o usuário (não é suposição)
A coluna "Ficha" deve ser **um contador único por dia, para a clínica inteira**
(como senha de padaria): TODOS os profissionais dividem a MESMA sequência
001, 002, 003... na ordem cronológica do campo `inicio`, sem reiniciar por
médico/agenda, sem pular e **sem repetir nenhum número na lista**.

### Histórico de tentativas nesta sessão (por ordem)
1ª tentativa: a ficha usava um `ficha_numero` gravado no banco (fixado na 1ª
impressão da guia) quando existia, senão calculava a posição. Isso causava
números fora de ordem (ex.: `…011, 012, 001, 014…`) porque o `ficha_numero`
gravado contava só pacientes reais (ignorando slots livres) enquanto a lista
contava todos os slots — duas réguas diferentes colidindo.

2ª tentativa: numeração posicional pura, mas agrupada por `agenda_id`. Ainda
duplicava porque **um mesmo médico pode ter vários `agenda_id` diferentes no
mesmo dia** (slots gerados por modelos/templates diferentes) — quando um
agendamento real caía num `agenda_id` diferente dos slots livres ao redor, o
contador reiniciava no meio da lista.

3ª tentativa: trocada a chave de agrupamento para `medico_id` (profissional) em
vez de `agenda_id`. Resolvia a sequência ao filtrar por 1 médico, mas na
**lista geral sem filtro** cada profissional reiniciava em 001, o que o usuário
apontou como "duplicado" (ex.: Enfermagem 001-004, Dr. Paulo 001, Enfermagem
005, Dr. Paulo 002...).

4ª tentativa (**estado atual do código, já commitado e enviado**): removida
toda a partição — o contador agora é **só por dia** (`Map` chaveado pela data,
sem `medico_id` nem `agenda_id`), aplicado nos 3 lugares que calculam esse
número:

- `src/routes/_authenticated/app.agenda.tsx`, função `fichaPorId` (por volta da
  linha 1832) — usado pela lista da agenda (render por volta da linha 4815, via
  `fichaPorId.get(a.id)`)
- `src/lib/print-gr.ts`, função `printGuiaAtendimentoCore` — fallback de
  recálculo da ficha na guia impressa individual (por volta da linha 440-465)
- `src/lib/print-gr.ts`, função `printGuiaAtendimentoAgrupadaCore` — mesmo
  fallback para a guia agrupada (Atendimento Múltiplo), por volta da linha 920-940

De brinde, essa 4ª correção também adicionou um `.eq("clinica_id", clinicaId)`
que faltava nas duas queries de fallback do `print-gr.ts` (bug latente: sem
esse filtro, o recálculo podia contar agendamentos de outras clínicas na mesma
janela de horário).

### Situação AGORA — o mistério a resolver
O código local e o `origin/main` no GitHub **estão idênticos e corretos**
(confirmado via `git show origin/main:...` lendo a função inteira). O projeto
no Lovable Cloud também reporta `latest_commit_sha` **igual ao HEAD local**
(`bc85c42f...`), status `ready`, `agentFinished: true`.

**Mesmo assim, o preview ao vivo no editor da Lovable continua mostrando a
numeração ANTIGA (por profissional, com "001" repetido várias vezes)** — ou
seja, o comportamento observado no navegador não bate com o código-fonte que
está confirmadamente no commit apontado como "latest" pelo próprio projeto.

**Já verificado e DESCARTADO como causa:** existe de fato um toggle de
visualização (`viewMode`, estado local `"dia" | "medico"`, botões "Lista" /
"Por médico" por volta da linha 3460-3475) com dois blocos de renderização
condicionais (`{viewMode === "dia" && (...)}` na linha ~4756, e
`{viewMode === "medico" && (...)}` na linha ~5203). **Confirmado que "Lista" =
`viewMode "dia"`**, que é exatamente o bloco que usa `fichaPorId.get(a.id)`
(linha ~4815) — e no print do bug o botão "Lista" estava selecionado (destacado
em azul). Ou seja, **o usuário estava no caminho de código correto**, não numa
visualização alternativa com lógica própria. Essa hipótese está descartada.

O padrão exato observado no print (Enfermagem 001-004, Dr. Paulo 001,
Enfermagem 005, Dr. Paulo 002...) é **idêntico ao comportamento da 3ª
tentativa** (agrupamento por `medico_id`), não ao da 4ª (contador global só por
dia). Isso é uma pista forte: bate exatamente com código ANTIGO rodando, não
com um bug de lógica novo.

Hipóteses ainda não verificadas, em ordem de suspeita:
1. **[MAIS PROVÁVEL] Bundle desatualizado sendo servido no preview** — o
   `latest_commit_sha` da API do Lovable bate com o HEAD do git, mas isso é só
   metadado; não necessariamente prova que o bundle JS servido ao iframe/app
   publicado foi de fato reconstruído a partir desse commit. Testar: hard
   refresh (Ctrl+Shift+R) na aba do app publicado
   (`patientpal-secure.lovable.app`, fora do editor), abrir o DevTools →
   Network → verificar o hash/nome do arquivo JS carregado, e/ou testar
   direto em `localhost` rodando `npm run dev` neste repo local (bypassa
   qualquer cache do Lovable) para confirmar se o bug reproduz com o código-
   fonte atual ou não.
2. Menos provável, mas testar em seguida: imprimir no console do navegador
   `items.map(a => ({id: a.id, inicio: a.inicio, medico_id: a.medico_id}))`
   logo antes do `useMemo` de `fichaPorId`, para garantir que não há alguma
   duplicata de item no array `items` (ex.: o mesmo agendamento entrando duas
   vezes por causa de algum `useEffect` de carregamento rodando 2x) que
   coincidentemente produza esse padrão.
3. Menos provável ainda: edição concorrente do bot da Lovable revertendo o
   arquivo depois do nosso último `git fetch` — mas o `latest_commit_sha`
   reportado bate com nosso HEAD no momento da checagem. Vale um novo
   `git fetch` antes de qualquer nova investigação, pois o remoto muda com
   frequência.

### Onde olhar primeiro (recomendação para o Codex)
Como a hipótese de "caminho de renderização alternativo" já foi descartada
com evidência concreta (label do botão + linha do `viewMode`), **o próximo
passo não é mais ler o código-fonte** (ele já está confirmado correto) — é
**confirmar se o app rodando no navegador realmente carregou esse código**.
Rodar `npm run dev` localmente neste repo e reproduzir o cenário do print
(agenda sem filtro de profissional, mesma data) é o teste mais direto e
elimina de vez a variável "cache/build desatualizado do Lovable".

## Print de referência do bug (descrição, sem anexo)
Tela `/app/agenda`, sem filtro de profissional, "Total: 797", ordenado por
horário. Sequência observada: Enfermagem 001, 002, 003, 004 → Dr. Paulo
Guilherme 001 → Enfermagem 005 → Dr. Paulo 002 → Enfermagem 006 → Dr. Paulo
003 → Dr. Jorge Antonio 001 → Dra. Daiane Helena 001 → MAPA 001 → ECG 001 →
Dr(a). Raio-X 001 → Dr(a). Laboratório 001 → ... (cada profissional reiniciando
em 001, quando deveria ser uma sequência única 001, 002, 003... crescente sem
repetir, cruzando todos os profissionais).

## Regras de commit/push neste projeto
- Sempre `git fetch origin` antes de qualquer push.
- Sempre `git merge origin/main --no-edit` (nunca `--force`, nunca
  sobrescrever o trabalho feito via Lovable).
- Conferir conflitos reais (`git status --short | grep -E '^(UU|AA|DD)'`) antes
  de resolver — na maioria das vezes o merge é automático e limpo porque as
  edições concorrentes tocam arquivos/trechos diferentes.
- Rodar `npx tsc --noEmit` (typecheck) nos arquivos tocados antes de comitar.
- Repetir fetch→merge→push em loop até o push aceitar (o remoto pode avançar
  de novo entre o merge e o push, já aconteceu nesta sessão).
