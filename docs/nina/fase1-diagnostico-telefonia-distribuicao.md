# Fase 1 — Diagnóstico: status Online, permissão Telefonia e distribuição automática

Somente leitura. Nenhum handoff, atribuição ou envio real foi executado.

## 1. Fluxo real (etapa → arquivo/função → regra → fonte)

| Etapa | Onde | Regra | Fonte dos dados |
|---|---|---|---|
| Nina decide handoff | `src/lib/whatsapp.server.ts` (tool `solicitar_atendente_humano`) | pedido do paciente / info ausente / confiança baixa | execução da Nina |
| Handoff + protocolo | `src/lib/nina/protocolo-handoff.ts`, `mensagem-handoff.ts` | gera protocolo e mensagem antes de transferir | `atend_conversas`, protocolo |
| Distribuição | RPC `public.atend_auto_assign_conversa` (migration `20260908124419_*`) | único caminho automático oficial | banco |
| Fila pendente | RPC `public.atend_distribuir_fila` (`20260908100840_*`) | busca conversas sem responsável e chama a RPC acima em laço (limite 50) | `atend_conversas` |
| Busca de usuários | RPC acima, linhas 36-60 | presença + permissão + pausa + fila | `atend_agente_presenca`, `perfil_permissoes` |
| Permissão | `has_module_access(user, clinica, 'telefonia', 'read')` | vem de Cadastros → Perfis, **não** de nome de perfil/role/lista fixa | `clinica_memberships.role` → `perfis_acesso` → `perfil_permissoes` |
| Presença | `status='ONLINE' AND aceita_novas AND visto_em > now()-5min` | heartbeat de 60s | `atend_agente_presenca` |
| Pausa | `NOT EXISTS (atend_pausas_log WHERE finalizada_em IS NULL)` | pausa aberta bloqueia | `atend_pausas_log` |
| Admin | `NOT atend_usuario_e_admin(...)` + trigger `fn_atend_bloqueia_admin_responsavel` | admin nunca recebe automaticamente | `clinica_memberships` |
| Carga / escolha | menor nº de conversas `active/in_progress/waiting`; desempate por atribuição mais antiga e depois `user_id` | balanceamento determinístico | `atend_conversas` |
| Persistência | `UPDATE ... WHERE atribuida_user_id IS NULL` dentro de `pg_advisory_xact_lock('atend_assign:'||clinica)` | atômico | banco |

Gatilhos de redistribuição: heartbeat de presença, fim de pausa (`finalizarPausa`), salvar perfil com Telefonia (`app.perfis.tsx`), botão "Distribuir agora".

## 2. Status operacional

- Guardado em `atend_agente_presenca` (`ONLINE|BUSY|AWAY|OFFLINE`, `aceita_novas`, `visto_em`).
- **Online** = heartbeat < 5 min + `ONLINE` + `aceita_novas`. **Pausa** = linha aberta em `atend_pausas_log`. **Offline** = qualquer outro caso, inclusive heartbeat velho.
- Heartbeat só roda com a tela de Atendimento aberta (`AtendimentoExtraTabs.tsx`, 60s; `pagehide` grava OFFLINE).
- **Logado ≠ Online**: são conceitos separados hoje e isso está correto no backend. O que existe de risco de leitura é o canal de presença do chat interno (`app.chat.tsx`, Supabase Presence) — mostra quem está com o chat aberto e não tem nenhuma relação com elegibilidade de atendimento.
- Não há rotina de servidor que expire presença: um navegador que caiu fica `ONLINE` na tabela até o heartbeat envelhecer. O backend ignora corretamente (via `visto_em`), mas qualquer tela que leia só `status` mostra "Online" falso. `statusPresenca()` (frontend) já cruza `visto_em` com a mesma janela de 5 min.

## 3. Inconsistências encontradas

1. **`autoAtribuirRoundRobin` (`src/lib/atendimento.functions.ts:2041-2158`)** — segundo caminho automático que **não** checa presença ONLINE, Telefonia nem admin (só `queue_locked`, `max_simultaneas` e pausa). Sem chamador no frontend hoje, mas continua exposto como server function a qualquer membro autenticado. É a única rota conhecida capaz de produzir "Offline recebendo conversa" ou "Online sem Telefonia recebendo".
2. **`assumirConversa` / `atend_claim_conversa`** — bloqueia admin, mas não exige Telefonia. Como é ação manual, pode ser intencional. Possível regra de negócio — validar com a equipe.
3. **Nenhum perfil tem Telefonia marcada hoje** (`perfil_permissoes` não tem nenhuma linha com `modulo='telefonia'`). Consequência: o pool automático está vazio; todo handoff cai em Não atribuídas. Este é o motivo prático de "Telefonia Online não recebendo".
4. **Admin com 13 conversas ativas atribuídas** na clínica `7570ddde…`. Não vieram do caminho automático (admin é excluído); vieram de atribuição manual/legado anterior ao bloqueio.
5. Sem expiração de presença no servidor (item 2 acima) — status visual pode divergir de qualquer tela que não aplique a janela de 5 min.

## 4. Race conditions

O caminho oficial está protegido: advisory lock por clínica + `SELECT ... FOR UPDATE` da conversa + `UPDATE ... WHERE atribuida_user_id IS NULL`. Chamadas concorrentes (heartbeat, fim de pausa, botão manual) serializam. Dupla atribuição só seria possível pelo `autoAtribuirRoundRobin`, que escreve direto sem lock.

## 5. Foto real do ambiente (produção, leitura)

Presenças registradas: 1 admin ONLINE com heartbeat de ~1h36 (logo, Offline efetivo), 1 recepção ONLINE com heartbeat de ~14h (Offline efetivo), 3 OFFLINE. Conversas não atribuídas no momento: 0.

## 6. Instrumentação

Criado `diagnosticarPoolTelefonia` (`src/lib/atendimento.functions.ts`), server function somente leitura que devolve por candidato: perfil, telefonia, status, aceita_novas, presença recente, pausa, admin, carga e `motivo` da rejeição (`missing_telefonia_permission`, `admin_excluido`, `status_offline`, `nao_aceita_novas`, `presenca_desatualizada`, `em_pausa`). Não atribui nem altera presença.

## 7. Recomendação (Fase 2)

1. Marcar Telefonia nos perfis operacionais em Cadastros → Perfis (sem isso nada distribui).
2. Remover ou blindar `autoAtribuirRoundRobin` (única rota de bypass).
3. Decidir se claim manual exige Telefonia — regra de negócio.
4. Avaliar expiração de presença no servidor e revisão das 13 conversas em admin.
