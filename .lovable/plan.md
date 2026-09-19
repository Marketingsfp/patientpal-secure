# Coach WhatsApp — Etapa 1: correções funcionais

Escopo: somente o módulo Coach (`src/components/coach`, `src/lib/coach`, rotas
`app.coach.*`), mais dois pontos pedidos no menu (`app-shell.tsx`) e uma migração
de banco restrita a objetos `coach_*`. Nada de agenda, financeiro, Nina ou OS ZAP.

Aviso de volume: são 7 frentes grandes num pedido só. Vou executar na ordem
abaixo, que agrupa o que depende de banco primeiro. Se preferir, dá para parar
depois do bloco A e conferir antes de seguir.

## Bloco A — Banco (migração)

- `coach_pode_gerir(_clinica_id)` passa a ser
  `has_module_access(auth.uid(), _clinica_id, 'coach', 'write')`; recriada com
  `CREATE OR REPLACE` para as policies existentes continuarem valendo.
- `coach_registrar_tempo_estudo` vira `SECURITY DEFINER` com
  `SET search_path = public`, validando que `_atendente` é o nome do perfil de
  `auth.uid()` ou que quem chama é gestor. Passa a gravar `user_id`.
- Policy de insert de `coach_eventos_seguranca`: só o próprio usuário.
- Coluna nova `simulacao_gestor boolean not null default false` em
  `coach_roleplay_sessions` e `coach_provas`.
- Tabela nova `coach_variedade` (clinica_id, user_id, tipo, valor, criado_em)
  para os últimos temas/nomes por atendente, com GRANT + RLS por clínica.
- Nada é apagado; o histórico migrado com `user_id` nulo permanece.

## Bloco B — Identidade por usuário (item 1)

- `PainelGestora`: campo "atendente" vira `Select` obrigatório de
  `useAtendentesCoach`; grava `user_id` da atendente escolhida e `atendente` com
  o nome do perfil.
- Todas as gravações `coach_*` novas passam `user_id` da pessoa avaliada.
- `AtendenteGuard` compara `ctx.userId` quando o registro tem `user_id`; nome só
  como fallback do histórico antigo.
- Helper único de filtro (`filtroDoAtendente`) aplicado em roleplay boot, prova
  `carregar`, `HistoricoAtendente`, `EvolucaoAtendente`, `MinhaMeta`:
  `user_id = ctx.userId` OU (`user_id is null` E `atendente = nome`).

## Bloco C — Uma só regra de progresso (item 2)

- `calcularProgresso(sessoes, provas, tempos, regras)` em `treinamento-plano.ts`,
  devolvendo bloco **diário** (X ligações + Y WhatsApp com nota ≥ 6 + 1h) e
  bloco **acumulado** (trilha/certificado: sessões válidas + prova aprovada).
- Consumido por TraineeHome, roleplay, prova, CourseView, GestaoDesempenho,
  PainelAcoes e Certificado. Constantes ficam só em `treinamento-plano.ts`
  (saem as cópias de `TraineeHome`).
- Certificado passa a depender do acumulado, então não reaparece a cada dia.

## Bloco D — Gestor não é aluno (item 4)

- `PainelGestora` deixa de cronometrar quando `ctx.gestor`.
- Roleplay/prova de outra pessoa abertos por gestor gravam
  `simulacao_gestor = true`; essas linhas saem de metas, ranking e histórico da
  atendente.

## Bloco E — Cenários da base real (item 5)

- Saem `TEMAS_SERVICO` e `NOMES_PACIENTES`.
- Tema sorteado da base gerada (consultas, mais procurados, exames); variedade
  passa a viver em `coach_variedade` no lugar do `localStorage`.
- UI e escolha de voz usam o `nome_paciente` vindo da IA; `baseDoAssunto` recorta
  a base pelo tema sorteado.

## Bloco F — Base gerada no servidor (item 6)

- Server function `gerarBaseConhecimento(clinicaId)` (gestor autenticado) faz a
  leitura pesada e grava o cache.
- Botão "Atualizar do sistema" e a regeneração automática por vencimento só
  disparam para quem tem permissão de gestor; atendente apenas lê.

## Bloco G — Pequenos (item 7)

- `salvar()` do `config-clinica` com debounce e patch parcial sobre a última
  versão (sem closure velha).
- `send()` do roleplay unificado com `sendWithText` (envia `dificuldade`).
- Spinner no boot do roleplay.
- m4a/ogg corretos em `analyze.functions.ts`; remoção do ternário morto de
  `model`.
- Confirmação antes de excluir análise via `lib/confirm.tsx`.
- Hub: cartão "Coach WhatsApp" oculto para quem não tem o módulo
  (`portaisOcultos`) e Coach incluído em `ambientesRapidos`.
- `SUBSYSTEMS.coach.groups` só com seções existentes no menu.
- `localStorage` do Coach com chave `${clinicaId}:${userId}`.

## Validação

`bunx tsgo --noEmit`, testes do Coach (novos testes de `calcularProgresso`) e
`bun run build`. Ao final: resumo antes/depois e a lista do que eu não fizer,
com o motivo.
