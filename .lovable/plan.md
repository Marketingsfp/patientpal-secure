# Unificar a voz do Coach com a Voz & Áudio (TTS) do sistema

## O que muda, em linguagem simples

Hoje o Coach tem um motor de voz só dele (servidor local próprio + voz da
plataforma), configurado dentro do painel da gestora e também dentro da tela de
treino. O ClinicaOS já tem a tela **Voz & Áudio (TTS)**, com o servidor de voz
da clínica, catálogo de vozes, velocidade e plano B automático — é o que a Nina
e o painel usam.

Depois da mudança, o Coach passa a falar pelo mesmo caminho do resto do sistema.
No Coach sobra apenas uma escolha: **qual voz do catálogo é o paciente
feminino e qual é o masculino**, na ligação e no WhatsApp.

## Classificação do pedido

Ajuste técnico de integração (remoção de caminho duplicado) + pequeno ajuste de
tela no painel da gestora. Sem regra de negócio nova.

## Arquivos

**Remover**
- `src/routes/api/coach/tts.ts` (endereço de voz exclusivo do Coach)
- `src/lib/coach/local-tts.ts` (servidor local próprio do Coach)
- `src/lib/coach/voz-config.ts` (substituído, ver abaixo)

**Criar**
- `src/lib/coach/voz-sistema.ts` — novo formato da configuração de voz:
  `{ ligacao: { feminino, masculino }, whatsapp: { feminino, masculino } }`,
  cada valor é um id de voz do catálogo do sistema (vazio = padrão da tela
  Voz & Áudio). Inclui a leitura tolerante do formato antigo.

**Alterar**
- `src/lib/tts-service.ts` — expor `speakComVoz(texto, voz, opts)`: mesma
  função de fala já usada pela Nina/painel, aceitando a voz do personagem.
  Reaproveita cache de áudio, velocidade configurada e o plano B existente.
  Nenhuma mudança de comportamento para quem já usa `speak()`.
- `src/components/coach/VozEditor.tsx` — vira um seletor simples: 4 escolhas
  (ligação/WhatsApp × feminino/masculino) alimentadas pelo catálogo do sistema,
  botão "Ouvir amostra" e link para **Voz & Áudio (TTS)**.
- `src/routes/_authenticated/app.coach.roleplay.$nome.tsx` — a fala do paciente
  passa a usar o serviço do sistema; sai o painel de configuração de servidor
  local dentro do treino e o teste próprio. Sequência de falas, cronômetro,
  escuta da atendente e encadeamento ficam iguais.
- `src/lib/coach/config-clinica.ts` — passa a usar o novo formato de
  `voz_config`.

## Banco

Nenhuma migração. O campo `coach_config_clinica.voz_config` continua o mesmo
(JSON); só o conteúdo muda de formato, e valores antigos são convertidos na
leitura: quando a voz antiga do servidor local existir no catálogo do sistema
(ex.: `dii_pt-BR`, `pt_BR-faber-medium`) ela é mantida; senão, cai no padrão da
tela Voz & Áudio. Nada é apagado.

## Riscos

- Se o servidor de voz da clínica estiver fora, o Coach cai no mesmo plano B da
  Nina (voz da plataforma) — antes ele tinha caminhos próprios de reserva.
- As vozes antigas do Coach que não existirem no catálogo do servidor deixam de
  ser oferecidas; a clínica passa a usar a voz padrão até escolher outra.

## Fora do escopo

Nina, painel, totem, OS ZAP, agenda, financeiro, base de conhecimento do Coach,
prova e análise de atendimento (texto, sem voz).

## Validação

`bunx tsgo --noEmit`, suíte `permissoes-rotas`, `bun run build`, e resumo
antes/depois.
