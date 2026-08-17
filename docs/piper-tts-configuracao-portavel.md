# Configuração do TTS (Piper) — guia para portar a outro projeto Lovable

Documento de transferência: reúne tudo o que é necessário para reproduzir a
síntese de voz (Piper + fallback de IA) em outro sistema.

**Tipo:** documentação (nenhum código deste projeto foi alterado).

---

## 1. Visão geral

```
navegador → POST /api/public/tts (proxy do próprio app)
                 ├── 1ª tentativa: servidor Piper (rede privada/Tailscale) → WAV
                 └── se falhar: Lovable AI Gateway (voz "alloy")        → WAV
```

O proxy existe porque o servidor Piper fica em rede privada e não libera CORS.
A URL do Piper e a chave de IA nunca vão para o bundle do navegador.

---

## 2. Pré-requisito fora do sistema

Servidor Piper acessível pelo backend, expondo:

- `POST /api/tts`
- corpo: `{ "text": "...", "voice": "faber" }` (`voice` opcional)
- resposta: **áudio WAV** no corpo

Padrão usado hoje: `https://server-mj.tailec426c.ts.net/api/tts` (Tailscale).

---

## 3. Segredos (painel de Secrets do novo projeto)

| Chave | Obrigatória | Uso |
|---|---|---|
| `TTS_UPSTREAM_URL` | opcional | Sobrescreve a URL do Piper. Sem ela, usa o padrão do código. |
| `LOVABLE_API_KEY` | recomendada | Fallback de voz quando o Piper está fora do ar. Sem ela, o proxy devolve 503. |

Nenhuma delas pode ter prefixo `VITE_` — são lidas só no servidor.

---

## 4. Rota de proxy (copiar)

Arquivo: `src/routes/api/public/tts.ts` (TanStack Start).

Regras já embutidas:

- texto máximo **4.000 caracteres** (é truncado, não rejeitado);
- corpo máximo **64 KB** (acima disso, HTTP 413);
- `voice` aceita apenas `^[a-z0-9_-]{1,32}$`; fora do padrão é ignorada;
- CORS liberado (`*`) apenas para `POST`/`OPTIONS`;
- fallback: `https://ai.gateway.lovable.dev/v1/audio/speech`, modelo
  `openai/gpt-4o-mini-tts`, voz `alloy`, formato `wav`.

Copie o arquivo inteiro deste projeto — ele não depende de mais nada do app.
Por estar em `/api/public/*`, funciona também no site publicado sem auth.

---

## 5. Serviço no cliente (copiar)

Arquivo: `src/lib/tts-service.ts`.

Constantes de comportamento:

| Constante | Valor | Significado |
|---|---|---|
| `DEFAULT_TTS_RATE` | `0.55` | velocidade quando o áudio vem do Piper (`playbackRate`) |
| `DEFAULT_NATIVE_TTS_RATE` | `0.85` | velocidade da voz nativa do navegador (Web Speech API) |
| `MIN_TTS_RATE` / `MAX_TTS_RATE` | `0.3` / `1.5` | limites do slider |
| `TTS_VOICE_AUTO` | `"auto"` | escolhe sozinho (Piper onde habilitado, senão voz do navegador) |
| `TTS_VOICE_PIPER` | `"piper"` | força o servidor Piper |

A velocidade é aplicada com `preservesPitch = true` (não deixa a voz grave).

Preferências locais (localStorage, por navegador):

- `tts:enabled` — `"1"` liga, `"0"` desliga
- `tts:rate` — número entre 0.3 e 1.5
- `tts:voice` — `auto`, `piper` ou o `voiceURI` de uma voz instalada

Se o novo projeto não usar Supabase, remova de `tts-service.ts` as funções
`fetchClinicaTtsConfig`, `saveClinicaTtsConfig`, `applyClinicaTtsConfig` e
`subscribeClinicaTtsConfig` — o resto funciona só com localStorage.

---

## 6. Banco de dados (opcional — config compartilhada por clínica)

Serve para o painel/TV receber a mudança em tempo real ao salvar em outro
dispositivo. Se o novo sistema não tiver multi-clínica, pule esta seção.

```sql
CREATE TABLE public.clinica_tts_config (
  clinica_id  uuid PRIMARY KEY REFERENCES public.clinicas(id) ON DELETE CASCADE,
  enabled     boolean NOT NULL DEFAULT true,
  rate        numeric NOT NULL DEFAULT 0.55,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE ON public.clinica_tts_config TO authenticated;
GRANT SELECT ON public.clinica_tts_config TO anon;  -- painel público (TV/totem)
GRANT ALL ON public.clinica_tts_config TO service_role;

ALTER TABLE public.clinica_tts_config ENABLE ROW LEVEL SECURITY;

CREATE POLICY "leitura da config de voz"
  ON public.clinica_tts_config FOR SELECT
  USING (true);   -- ajuste ao modelo de acesso do novo sistema

CREATE POLICY "membros gravam a config de voz"
  ON public.clinica_tts_config FOR ALL TO authenticated
  USING (public.is_member(clinica_id))
  WITH CHECK (public.is_member(clinica_id));
```

Ative a tabela na publicação de Realtime para o painel receber os updates.

> A **voz escolhida** propositalmente **não** é salva no banco: a lista de vozes
> depende do sistema operacional de cada máquina, então fica só no navegador.

---

## 7. Telas e componentes (copiar se quiser a UI pronta)

| Arquivo | O que é |
|---|---|
| `src/routes/_authenticated/app.configuracoes.voz.tsx` | tela de configuração: ligar/desligar, velocidade, voz, frase de teste e teste direto do servidor Piper |
| `src/hooks/use-tts.ts` | hook com o gate de habilitação e o `speak()` |
| `src/components/tts/tts-toggle.tsx` | botão 🔊 no cabeçalho |

**Atenção ao portar `use-tts.ts`:** hoje ele habilita o TTS apenas para clínicas
cujo nome contém `"menino jesus"` (rollout controlado). No novo sistema,
substitua essa checagem pela regra desejada — ou por `return true` se a voz
deve valer para todos.

---

## 8. Teste rápido depois de instalar

```bash
curl -X POST https://SEU-APP.lovable.app/api/public/tts \
  -H "Content-Type: application/json" \
  -d '{"text":"Senha número 27, guichê 3.","voice":"faber"}' \
  --output teste.wav
```

- WAV com som → Piper (ou fallback) funcionando.
- HTTP 503 → Piper fora do ar **e** `LOVABLE_API_KEY` ausente.
- HTTP 400 → corpo sem `text`.
- HTTP 413 → corpo acima de 64 KB.

---

## 9. Checklist de portabilidade

1. [ ] Servidor Piper acessível pela internet (ou Tailscale) respondendo em `/api/tts`.
2. [ ] Secrets `TTS_UPSTREAM_URL` (se a URL for outra) e `LOVABLE_API_KEY`.
3. [ ] Copiar `src/routes/api/public/tts.ts`.
4. [ ] Copiar `src/lib/tts-service.ts` (remover as partes de banco se não houver Supabase).
5. [ ] Criar a tabela `clinica_tts_config` + Realtime (opcional).
6. [ ] Copiar a tela de configuração, o hook e o botão 🔊.
7. [ ] Ajustar o gate de habilitação em `use-tts.ts`.
8. [ ] Rodar o `curl` de teste e ouvir o WAV.
