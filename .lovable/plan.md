## Objetivo

Substituir o formulário estático da aba **Configuração** por uma integração real com a **WhatsApp Cloud API (Meta)**, com modo **híbrido**: Nina responde fora do horário de atendimento; dentro do horário, mensagens caem na fila de "Conversas WhatsApp" para atendimento humano.

## 1. Banco de dados

### Tabela `whatsapp_configs` (uma linha por clínica)
- `clinica_id` (PK)
- `phone_number_id` (texto, ID do número na Meta)
- `waba_id` (texto, WhatsApp Business Account ID)
- `display_phone_number` (preenchido após o teste de conexão)
- `display_name` (nome exibido, ex.: "Clínica — Nina")
- `access_token` (token permanente da Meta) — server-only
- `app_secret` (segredo do App Meta, usado para validar assinatura do webhook) — server-only
- `verify_token` (gerado pelo sistema, único por clínica)
- `welcome_message` (texto)
- `horario_inicio` / `horario_fim` (atendimento humano)
- `ativo` (bool)
- `ultimo_teste_em`, `ultimo_teste_ok` (status do "Testar conexão")

**RLS**: apenas admin/gestor da clínica leem/escrevem (via `can_manage_clinica`). O service role (server) lê tudo no webhook.

### Tabela `whatsapp_mensagens` (histórico de mensagens)
- `clinica_id`, `wa_message_id` (único), `direction` (`in`/`out`), `from_number`, `to_number`, `body`, `tipo` (text/image/audio), `status`, `enviada_por` (`nina`/`humano`/`paciente`), `raw` (jsonb), `recebida_em`.

**RLS**: membros da clínica leem; só server (admin) insere via webhook.

## 2. Server functions (`src/lib/whatsapp.functions.ts`)

- `obterWhatsappConfig({ clinicaId })` — retorna config (sem expor `access_token` / `app_secret` no retorno: devolve apenas se está preenchido).
- `salvarWhatsappConfig({ clinicaId, ...campos })` — upsert. Gera `verify_token` se ainda não existir.
- `testarConexaoWhatsapp({ clinicaId })` — chama `GET https://graph.facebook.com/v22.0/{phone_number_id}` com o `access_token`, salva `display_phone_number`, marca `ultimo_teste_ok`.
- `enviarMensagemWhatsapp({ clinicaId, to, text })` — `POST /v22.0/{phone_number_id}/messages`. Registra em `whatsapp_mensagens` direction=out.

Todas com `requireSupabaseAuth` + checagem de `can_manage_clinica`.

## 3. Server route público (webhook da Meta)

`src/routes/api/public/whatsapp/$clinicaId.ts`

- **GET** (verificação): lê `hub.mode`, `hub.verify_token`, `hub.challenge`. Compara `verify_token` com o salvo da clínica → retorna o challenge.
- **POST** (eventos):
  1. Lê body como texto.
  2. Calcula `sha256` HMAC com `app_secret` da clínica e compara (`timingSafeEqual`) com header `x-hub-signature-256`. Rejeita 401 se inválido.
  3. Para cada `messages[]`: salva em `whatsapp_mensagens` (direction=in).
  4. **Lógica híbrida**: se horário atual (timezone da clínica) **fora** do intervalo `horario_inicio`–`horario_fim`, chama `chatNina` internamente e envia a resposta via Graph API (`enviarMensagemWhatsapp`). Dentro do horário: não responde — fica para o painel humano em "Conversas WhatsApp".

## 4. UI da aba Configuração (`app.nina.tsx`)

Substituir o card estático por:

- **Status da conexão**: badge verde "Conectado a +55 11 …" ou amarelo "Não testado" / vermelho "Falha".
- **Webhook URL** (read-only, com botão Copiar):
  `https://patientpal-secure.lovable.app/api/public/whatsapp/{clinicaId}`
- **Verify Token** gerado (read-only, botão Copiar).
- **Campos editáveis**:
  - Phone Number ID
  - WhatsApp Business Account ID
  - Access Token permanente (campo password com toggle olho)
  - App Secret (campo password com toggle olho)
  - Nome de exibição
  - Mensagem de boas-vindas
  - Horário de atendimento humano (início / fim)
- **Botões**: "Salvar configurações" e "Testar conexão".
- Bloco de **passos** colapsável ("Como configurar na Meta: cole esta URL e este Verify Token em Configuration > Webhooks; assine o campo `messages`").

## 5. Conexão com a aba Conversas WhatsApp

A aba "Conversas WhatsApp" (já existente como mock) passa a ler de `whatsapp_mensagens` agrupado por `from_number`, mostrando histórico real. Botão "Responder" usa `enviarMensagemWhatsapp`.
> Para manter escopo enxuto, **esta tarefa entrega só o pipeline** (recebe, salva, Nina responde fora do horário). A renderização real da aba Conversas com lista dinâmica fica como passo seguinte se você quiser — me confirma se devo já incluir.

## 6. Atualização automática (memória de permissões)

Adicionar entrada no catálogo de permissões (`app.perfis.tsx` + tabela `perfil_permissoes`) para o novo módulo **"WhatsApp — Configuração"** (none/read/write), conforme a regra de sincronização de permissões já registrada.

## Fora de escopo
- Templates de mensagem aprovados pela Meta (HSM).
- Mídia (imagem/áudio/documento) inbound — só texto nesta entrega.
- Múltiplos números por clínica.

## Confirmar
1. Posso seguir só com **texto** inbound/outbound nesta primeira versão (mídia depois)?
2. A aba "Conversas WhatsApp" também deve passar a usar dados reais agora, ou em uma próxima iteração?
