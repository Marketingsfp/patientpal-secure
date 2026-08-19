-- ============================================================================
-- Painel de senhas: deixar o visitante não logado ler a configuração de voz.
--
-- SINTOMA — a TV da recepção chamava as senhas com voz MASCULINA e mais
-- rápida, ignorando o que estava salvo em Configurações → Voz & Áudio
-- (Piper "pt_BR-luciana", velocidade 100%).
--
-- CAUSA — o painel roda sem login (/painel/t/<token>, /painel/<clinicaId>),
-- ou seja, no papel `anon`. A migração 20260728135217 restringiu o SELECT de
-- `clinica_tts_config` a `authenticated` + `is_member(...)`, e desde então
-- `fetchClinicaTtsConfig()` (src/lib/tts-service.ts) passou a devolver zero
-- linhas no painel — sem erro, apenas vazio. Sem a voz configurada, o painel
-- chama /api/public/tts SEM o campo `voice`, e o servidor Piper usa a voz
-- padrão dele, que é `pt_BR-faber-medium` — masculina e ~33% mais curta (mais
-- rápida) que a Luciana para o mesmo texto. Pelo mesmo motivo a velocidade e
-- o liga/desliga salvos também nunca chegavam ao painel, e o Realtime (que
-- aplicaria a mudança na hora ao salvar) ficava mudo para o `anon`.
--
-- CORREÇÃO — política de SELECT para `anon`. A tabela guarda apenas
-- preferências de áudio da clínica (velocidade, ligado/desligado, nome da voz)
-- e não contém nenhum dado de paciente nem de saúde; é exatamente o que o
-- painel público precisa saber para falar do jeito certo. A escrita continua
-- restrita a gestores autenticados, como está desde a migração 20260728135217.
--
-- Reversível: o SQL para voltar atrás está comentado no fim do arquivo.
-- ============================================================================

begin;

drop policy if exists tts_config_select_publico on public.clinica_tts_config;

create policy tts_config_select_publico on public.clinica_tts_config
  for select to anon
  using (true);

comment on table public.clinica_tts_config is
  'Preferências de voz do painel de senhas por clínica (velocidade, ligado/desligado, voz do Piper). '
  'Leitura liberada ao visitante não logado de propósito: o painel da TV roda sem login e precisa '
  'destes valores para chamar as senhas com a voz e a velocidade configuradas. Não guarda dado de '
  'paciente. Escrita segue restrita a gestores da clínica.';

commit;

-- Para reverter:
-- drop policy if exists tts_config_select_publico on public.clinica_tts_config;
