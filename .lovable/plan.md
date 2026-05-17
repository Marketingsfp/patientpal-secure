## Escopo (você confirmou)

- ❌ Vídeos — pulamos.
- ✅ Modelos de prontuário por especialidade.
- ✅ IA no atendimento com: transcrição, anamnese/evolução automática, sugestão de CID + exames + prescrição, resumo do histórico.

A tabela `prontuarios` já existe (SOAP clássico) e a `transcribe.functions.ts` já chama o Lovable AI Gateway. Vou reaproveitar.

---

## 1. Modelos de prontuário por especialidade (Banco)

Nova tabela `prontuario_modelos` (por clínica, opcionalmente "global da clínica" ou ligada a uma especialidade), com campos estruturados em JSON:

```text
prontuario_modelos
  id, clinica_id, especialidade_id (FK opcional), nome, ativo
  secoes jsonb   -- [{ chave: "queixa", titulo, placeholder, tipo: "texto|lista" }, ...]
  prompt_ia text -- prompt extra que será concatenado ao chamar a IA
```

**Seed automático na primeira clínica** com 9 modelos prontos:
Clínica Geral · Pediatria · Ginecologia/Obstetrícia · Cardiologia · Ortopedia · Dermatologia · Psicologia · Nutrição · Odontologia.

Cada modelo já vem com seções típicas da especialidade (ex.: Pediatria → peso/altura/percentil/vacinas; Cardiologia → PA/FC/ausculta/ECG; Nutrição → recordatório 24h/antropometria).

Tela `/app/prontuario-modelos` (CRUD simples) para a clínica editar.

## 2. IA no atendimento — server function

Novo arquivo `src/lib/atendimento-ai.functions.ts` com 3 server functions (todas usando `LOVABLE_API_KEY` + `google/gemini-3-flash-preview`):

- `gerarAnamneseEstruturada({ transcricao, especialidade, modeloId })` → devolve JSON com `{ queixa_principal, historia_doenca, exame_fisico, hipotese_diagnostica, conduta, prescricao }` usando structured output (Zod schema).
- `sugerirCondutaClinica({ queixa, historia, exame, especialidade })` → `{ cids: [{ codigo, descricao }], exames: [], prescricao_sugerida: "..." }`.
- `resumirHistoricoPaciente({ pacienteId })` → busca últimos 10 prontuários + alergias e devolve resumo curto em markdown.

## 3. Tela de Atendimento com IA

Nova rota `/app/atendimento-ia/$agendamentoId`:

```text
┌─────────────────────────────────────────────────────────┐
│ Paciente · Idade · Convênio          [Resumir histórico]│
│ ┌── Resumo IA do paciente (collapse) ──────────────────┐│
│ └──────────────────────────────────────────────────────┘│
│                                                         │
│ Modelo: [Cardiologia ▼]                                 │
│                                                         │
│ ┌── Transcrição ao vivo ───────────┬── Prontuário ────┐│
│ │ [🎙 Gravar conversa] [⏸] [⏹]    │ Queixa principal ││
│ │                                  │ HMA              ││
│ │ "Paciente refere dor torácica…"  │ Exame físico     ││
│ │                                  │ Hipótese         ││
│ │ [Estruturar com IA →]            │ Conduta          ││
│ │                                  │ Prescrição       ││
│ │                                  │ [Sugerir CID/Rx] ││
│ └──────────────────────────────────┴──────────────────┘│
│                              [Salvar prontuário]        │
└─────────────────────────────────────────────────────────┘
```

- **Gravar conversa**: usa o `VoiceInput` existente em modo "loop" (grava trechos de 20–30s e vai colando na caixa de transcrição).
- **Estruturar com IA**: chama `gerarAnamneseEstruturada` e preenche os 6 campos do SOAP.
- **Sugerir CID/Exames/Rx**: chama `sugerirCondutaClinica`, mostra chips de CIDs (clica para adicionar à hipótese) e bloco de prescrição sugerida.
- **Resumir histórico**: collapse no topo, busca anterior do paciente.
- **Salvar prontuário**: grava em `prontuarios` (tabela já existente).

Botão "Atendimento IA" entra no fluxo de chamada de senha / lista de pacientes do dia, ao lado do "Atendimento" tradicional.

## 4. Sidebar

- Novo item "Modelos de Prontuário" dentro de Configurações.
- Botão "Atendimento c/ IA" aparece nos cards de paciente em atendimento.

---

### Detalhes técnicos

- IA: `google/gemini-3-flash-preview` (default da gateway) com `response_format: { type: "json_schema" }` para os endpoints estruturados.
- Transcrição reusa `transcribeAudio` (já feita em `transcribe.functions.ts`).
- Custos: 1 transcrição (Gemini 2.5 flash) + 1 chamada estruturação + opcional sugestão CID por atendimento. Tudo via `LOVABLE_API_KEY` (já configurado).
- Sem nova dependência npm.
- RLS: `prontuario_modelos` herda padrão `is_member`/`can_manage_clinica`.

---

### Não está no escopo desta entrega

- Vídeos (você pediu para pular).
- Sugestão de CID a partir de imagem (só texto por enquanto).
- Integração com receituário digital com assinatura ICP-Brasil (a prescrição é texto livre).