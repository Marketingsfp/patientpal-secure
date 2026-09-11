# Telefonia VoIP no sistema — levantamento e plano faseado

Somente levantamento. Nenhum código, banco ou configuração foi alterado.

## A) O que já existe e pode ser reaproveitado

### 1. Perfil TELEFONIA, presença, fila e distribuição
- Perfil oficial: papel real da pessoa na clínica (`clinica_memberships.role = 'telefonia'`), conforme `docs/nina/telefonia-relatorio-final.md`. Não é módulo de permissão.
- Regra de elegibilidade espelhada em código puro: `src/lib/nina/telefonia-elegibilidade.ts` (+ testes). Critérios: perfil Telefonia, Online, aceita novas, presença recente (5 min), sem pausa, não admin, setor compatível, abaixo do limite simultâneo.
- Presença: tabela `atend_agente_presenca` (status, aceita_novas, visto_em) + consolidação de abas em `src/lib/atendimento/presenca-abas.ts`; pausas em `atend_pausas_log`.
- Distribuição e travas: funções de banco `atend_auto_assign_conversa` (advisory lock por clínica + lock da conversa + gravação condicional), `atend_distribuir_fila`, `atend_claim_conversa`, `atend_espera_por_conversa`. Server functions em `src/lib/atendimento.functions.ts` (inclui `diagnosticarPoolTelefonia`).
- Reaproveitável tal e qual: perfil, presença, pausa, batimento, critério de elegibilidade e a ideia de trava por clínica.
- Precisa ser generalizado: hoje o alvo da atribuição é sempre uma linha de `atend_conversas`. Para ligações, ou (a) a ligação vira uma linha de `atend_conversas` com `canal = 'voz'` (menor esforço, reusa tudo), ou (b) cria-se uma tabela própria e uma função irmã de atribuição. A coluna `canal` já existe em `atend_conversas` e em `atend_routing_rules`.
- Diferença de natureza a resolver: conversa espera minutos, ligação espera segundos e precisa de "ringing/atendida/perdida" e timeout de toque — isso não existe hoje.

### 2. Central de Atenção
- `src/components/nina/CentralAtencao.tsx` + regras puras em `src/lib/atendimento/central-atencao.ts` (categorias `nao_atribuida`, `critica`, `aguardando`), alimentada pela mesma fila humana e pelo mapa de espera. Aparece só no portal OS ZAP (`src/components/app-shell.tsx`).
- Comporta bem um segundo tipo de item, desde que se acrescente uma categoria/tipo e um ordenamento próprio para ligação (prioridade máxima, janela em segundos). A abertura hoje é via evento `nina:abrir-conversa` — para ligação seria preciso um evento equivalente.

### 3. Tabelas `atend_*`
- Genéricas o bastante para receber canal "voz": `atend_conversas` (tem `canal`), `atend_conversa_eventos`, `atend_transferencias`, `atend_departamentos`/`atend_departamento_membros`, `atend_routing_rules`, `atend_agente_presenca`, `atend_pausas_log`, `atend_avaliacoes`, `atend_leituras`, protocolo (`protocolo_atendimento`).
- Amarradas a WhatsApp: `whatsapp_mensagens` (corpo/mídia/status de entrega), `atend_msg_fora_horario`, `atend_numeros_autorizados`, `atend_macros`/`atend_respostas_rapidas`, `atend_handoff_resumos` (resumo textual do diálogo — para voz dependeria de transcrição), `atend_kb`/bot configs.

### 4. Áudio/TTS já pronto
- `src/routes/api/nina-voz.ts` — TTS Gemini em SSE (streaming).
- `src/routes/api/nina-fala.ts` — texto em streaming + primeira frase já em áudio (latência ~1 s). É a base mais próxima de uma URA.
- `src/routes/api/public/tts.ts` e `tts-voices.ts` — Piper local com fallback no gateway; `src/lib/tts-service.ts`, `src/hooks/use-tts.ts`, `/app/configuracoes/voz`.
- `src/lib/nina-audio.server.ts` — Nina respondendo em áudio no WhatsApp.
- O que falta para URA: STT (transcrição de fala em tempo real), controle de turno/barge-in e ponte com o áudio da chamada. Não existe nada de STT hoje.

### 5. Ficha do paciente / agenda
- Botão de ligar: `src/components/agenda/paciente-quick-actions.tsx` (já tem ícone de telefone e telefone do paciente) e a ficha em `src/routes/_authenticated/app.clientes.$pacienteId.visualizar.tsx` (`src/components/clientes/cliente-form.tsx`, que já tem abas incluindo Histórico).
- Histórico de ligações: nova aba na mesma ficha, ao lado de Histórico.

### 6. Busca por telefone (quem está ligando)
- Já existe e é reusável: RPC `buscar_paciente_contato` (usada em `src/lib/whatsapp.server.ts`), colunas normalizadas `pacientes.telefone_norm` / `telefone2_norm` e `atend_conversas.contato_telefone_norm`, regra única em `src/lib/atendimento/telefone.ts` espelhando `public.normalizar_telefone`, além de `src/lib/atendimento/vinculo-contato.server.ts`.

## B) Lacunas

### Não existe hoje
- Tabelas: chamadas (`tel_chamadas`: direção, número, ramal, paciente, atendente, status, tempos, id externo do PABX), eventos de chamada, gravações (`tel_gravacoes`: caminho no storage, duração, consentimento) e transcrições. Configuração de tronco/ramal por clínica.
- Rotas: webhook do PABX em `src/routes/api/public/...` (com verificação de assinatura), endpoint para emitir credenciais efêmeras do softphone, endpoint de clicar-para-ligar.
- Telas: barra/softphone persistente, tela de ligações, aba de ligações na ficha, configuração de telefonia.
- Permissões: uso do perfil `telefonia` para o softphone; regra de quem ouve gravação (provavelmente admin/gestor + quem atendeu).
- Jobs: reconciliação de chamadas (CDR) e transcrição assíncrona.

### Restrições da stack
- Runtime serverless (Cloudflare Workers, ver `wrangler.jsonc`): não há processo longo, nem servidor WebSocket próprio, nem mídia RTP no nosso backend. Ou seja, o áudio NÃO pode passar pelo nosso servidor — precisa ir direto do navegador ao provedor (SIP over WSS / WebRTC).
- Sem `child_process`, sem ffmpeg no servidor: mixagem/conversão de gravação tem que ser do provedor.
- Tempo real hoje: Supabase Realtime (`src/hooks/use-realtime-atendimento.ts`, `use-realtime-refresh.ts`) + server functions. Serve bem para sinalizar "chamada tocando/atendida" na interface; não serve para transportar áudio.

### Gravação
- Buckets existentes: `chat-anexos`, `pacientes-fotos`, `cb-informativos`; upload usado em `src/lib/odonto-imagens.ts`, `app.chat.tsx`, `backup-diario.ts`.
- Caminho recomendado: bucket privado novo (`gravacoes-chamadas`), gravação feita pelo provedor e trazida por job para o bucket, acesso só por URL assinada de curta duração, RLS por clínica e por papel.

## C) Plano faseado

- **Fase 0 — Decisões e prova de conceito (sem código no sistema)**: escolher provedor/PABX e validar SIP over WSS no navegador contra o tronco atual. Entrega: viabilidade confirmada. Risco: baixo.
- **Fase 1 — Registro de chamadas (primeira que já dá valor sozinha)**: webhook do PABX + tabelas de chamadas, identificação do paciente por telefone (reusando `buscar_paciente_contato`), aba "Ligações" na ficha e tela de ligações. Toca: rota pública nova, ficha do paciente, menu. Banco: tabelas novas + RLS/GRANT. Risco: baixo, não afeta WhatsApp.
- **Fase 2 — Clicar-para-ligar**: botão na ficha/agenda/conversa disparando originação no PABX (o telefone físico/ramal toca). Banco: nada novo além do registro. Risco: baixo.
- **Fase 3 — Softphone no navegador**: barra de chamada com WebRTC/SIP, credenciais efêmeras por servidor, pop-up da ficha do paciente ao atender. Risco: médio (áudio, permissões de microfone, rede).
- **Fase 4 — Gravação + transcrição**: bucket privado, job de ingestão, transcrição assíncrona, exibição no histórico com controle de acesso. Risco: médio-alto (LGPD, custo, volume).
- **Fase 5 — Distribuição de ligações pela regra Telefonia**: reusar presença/elegibilidade para tocar só em quem está Online, com timeout de toque e fila. Risco: alto (concorrência em segundos).
- **Fase 6 — URA com voz da Nina**: STT + a base de streaming de `api/nina-fala.ts`, com transferência para humano usando o handoff existente. Risco: alto.

## D) Decisões que travam a implementação

1. **Provedor/PABX**: manter o PABX atual e só usar SIP over WSS, ou adotar CPaaS (Twilio/Telnyx/Zenvia) mantendo o tronco. Recomendação: CPaaS para as fases 3-6 e webhook do PABX atual para as fases 1-2 — o serverless não sustenta sinalização própria.
2. **Caminho do áudio**: recomendação, nunca pelo nosso servidor (navegador ↔ provedor). Motivo: Workers não transportam mídia.
3. **Onde grava**: gravação no provedor e cópia para bucket privado nosso, com retenção definida. Motivo: controle e histórico no prontuário sem depender do provedor.
4. **LGPD/consentimento**: aviso automático no início da chamada, base legal e prazo de retenção definidos, acesso à gravação restrito e auditado. Precisa de decisão do time.
5. **Ramal por pessoa**: cada atendente tem ramal próprio? Sem isso não há distribuição individual.
6. **Transcrição**: provedor externo x gateway de IA; custo por minuto e se transcreve tudo ou só chamadas marcadas.
7. **Escopo por clínica**: configuração de tronco/ramais por `clinica_id` (regra do projeto), inclusive numeração distinta por unidade.

## E) Riscos e o que não mexer

- Não alterar `atend_auto_assign_conversa`, `atend_distribuir_fila`, `atend_claim_conversa`, presença, pausas nem o handoff da Nina enquanto voz não estiver estável. Se a ligação entrar em `atend_conversas`, todo filtro de Inbox/fila/contadores precisa excluir `canal='voz'` explicitamente — este é o maior risco de regressão no WhatsApp.
- Não sobrecarregar a Central de Atenção a ponto de mudar o comportamento atual das conversas.
- Não reaproveitar `whatsapp_mensagens` para eventos de voz.
- Gravação e transcrição são dado sensível: bucket privado, sem URL pública, sem log de conteúdo.
- Nada de publicação, envio real ou teste transacional sem confirmação de ambiente e clínica.
