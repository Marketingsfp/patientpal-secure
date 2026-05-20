
# Plano — Expansão para Sistema de Gestão de Clínica completo

Escopo enorme. Vamos por **fases sequenciais**, cada uma aprovada antes da próxima. Nada do que já existe (agenda, financeiro, médicos, equipe, prontuários, cartão benefícios, CRM, Nina, etc.) será removido. Apenas **adicionado e alinhado**.

## Mapeamento com o que já existe

| Spec novo | Já existe no projeto | Decisão |
|---|---|---|
| `clinics`, `user_clinics` | `clinicas`, `clinica_memberships` | Reusar (manter PT-BR). |
| `profiles` | `profiles` | Reusar. |
| `user_roles` separado | role em `clinica_memberships` | **Criar `user_roles` novo** + manter coluna antiga para compat; migrar gradualmente. |
| `has_role()` | já existe `has_role(user_id, clinica_id, role)` | Adicionar overload `has_role(user_id, role_global)` para roles cross-clínica. |
| `audit_logs` | `audit_log` + `fn_audit_trigger` | Reusar tabela existente; criar hook `useCrud` que dispara via trigger. |
| Perfil de Médico | `medicos` | Estender com CRM, CBO, %comissão, `service_class` ('consulta'/'exame'/'ambos'), vínculo `company_entities`. |
| Perfil de Funcionário | `equipe` (provavelmente) | Estender com RG, endereço, documentos, score, feedbacks. |
| ClinicSwitcher "Todas" | seletor atual em `app-shell.tsx` | Adicionar opção "Todas" agregada. |
| PatientSearchInput | buscas avulsas em telas | Criar componente único e adotar nas telas novas. |
| Branding por clínica | `corDaClinica()` hardcoded | Migrar para `ClinicContext` lendo de `clinicas.branding jsonb`. |

## Fases

### Fase 0 — Fundação (primeira a executar)

Sem isso, os módulos viram silos.

1. **Migration: `user_roles`**
   - enum `app_role_global` (`admin`, `tesouraria`, `medico`, `enfermagem`, `recepcao`, `marketing`, `rh`).
   - tabela `user_roles (user_id, clinica_id nullable, role)`.
   - função `has_role_global(uid, role)` SECURITY DEFINER.
2. **Migration: `audit_logs` helpers** — view + função `log_action()` p/ uso manual nas Edge/server fns.
3. **Migration: `clinicas.branding jsonb`** (logo_url, primary, accent).
4. **`ClinicContext`** novo: provê branding + lista de clínicas + modo "Todas".
5. **`ClinicSwitcher`** com "Todas" agregada (afeta queries via filtro condicional).
6. **`PatientSearchInput`** componente reutilizável.
7. **`date-utils.ts`** com formatters UTC para datas puras.
8. **Hook `useCrud`** que padroniza CRUD + auditoria + toasts.

### Fase 1 — Administração

- Telas: Usuários, Cargos (`cargos`), Setores (`setores`), Unidades, Perfis de Permissão.
- Sistema de permissões hierárquicas via tabela `permissions (code, parent_code)` e `role_permissions`.
- Edge Function `admin-reset-password` (service-role).
- Página LGPD: consentimento + "Meus Dados" (export).
- Guard: ações admin exigem `funcionario` vinculado.

### Fase 2 — RH / Gestão de Ponto

- Tabelas `hr_contratos`, `hr_pontos`, `hr_holerites`, `hr_escalas`, `hr_banco_horas`, `hr_ferias`.
- `getSequenceForContract()` (CLT 4 batidas, PJ 2, estagiário 2, etc.).
- Tela bater ponto com geolocalização opcional.
- Holerites em PDF.

### Fase 3 — Perfil de Funcionário + Perfil de Médico

- `funcionarios` (estender `equipe`): RG, CPF, endereço, contatos JSONB, documentos (storage bucket `funcionario-docs`).
- `funcionario_feedbacks` (360), `funcionario_scores` (base 50, ±10).
- Mural interno (`mural_posts`).
- `medicos`: + `crm`, `cbo`, `comissao_pct`, `service_class`, vínculo `company_entities` (N:N).
- Dashboard individual do médico.

### Fase 4 — Odontologia

- `odonto_prontuarios`, `odonto_dentes (paciente_id, dente, face, status)`.
- Componente Odontograma SVG (32 dentes, faces V/M/D/L/O).
- Trigger: ao concluir procedimento → agenda retorno em 30 dias.

### Fase 5 — Chat Interno

- `chat_conversas`, `chat_membros`, `chat_mensagens`, `chat_leituras`.
- Realtime publication.
- Presence via `supabase.channel().track()`.
- UI tipo WhatsApp-lite com background customizável.

### Fase 6 — Treinamentos / LMS

- `lms_cursos`, `lms_modulos`, `lms_licoes (tipo: video|texto|quiz)`, `lms_quizzes`, `lms_progresso`, `lms_certificados`.
- Geração de certificado PDF (jsPDF) com QR de verificação.
- Trilhas por cargo (`lms_trilhas_cargo`).

### Fase 7 — Marketing

- Recall: cron diário (server route `/api/public/cron/recall` + pg_cron) detecta pacientes sem retorno em N dias.
- Rádio interna: `marketing_playlists` + player.
- Painéis digitais: rota pública `/painel-tv/:clinicaId` com RLS anon read.
- Site Editor DnD: `website_sections` com 10 tipos de seção, drag-drop com `@dnd-kit`.
- Google Reviews via Places API v1 (Edge Function com `X-Goog-FieldMask`).
- DomainRouter para domínios personalizados.

### Fase 8 — Transversais finais

- Check-in (facial já existe parcial; QR e OCR adicionais).
- Telemedicina LiveKit + transcrição Gemini.
- Impressão térmica 80mm (CSS print + Inter, DOB obrigatório).
- `integration_secrets` (tabela DB) com prioridade sobre env vars.
- Capacitor (mobile/TV) e Electron (desktop) — config-only neste momento.

## Integrações externas — secrets a provisionar

Vou pedir conforme cada fase chegar (não pedir tudo de uma vez):

| Fase | Secrets |
|---|---|
| 1 (Admin) | nenhum extra |
| 4 (Odonto) | nenhum |
| 5 (Chat) | nenhum (Realtime nativo) |
| 6 (LMS) | nenhum (jsPDF local) |
| 7 (Marketing) | `GOOGLE_PLACES_API_KEY` |
| 8 (Telemed) | `LIVEKIT_API_KEY`, `LIVEKIT_API_SECRET`, `LIVEKIT_URL` |
| 8 (OCR/Facial) | já temos face local; OCR via Gemini (já temos `LOVABLE_API_KEY`) |

Capacitor/Electron: builds locais, sem secret server-side.

## Regras técnicas que vou seguir em tudo

- Toda nova tabela: `clinica_id`, RLS via `is_member(auth.uid(), clinica_id)`, trigger de auditoria.
- Funções DB com `SET search_path = public`.
- Validações via trigger (não CHECK) p/ regras temporais.
- Tokens HSL no `styles.css` — proibido cor hardcoded.
- Server-side em `createServerFn` (não Edge Function), exceto webhooks externos e cron público.
- IA via Lovable AI Gateway, modelo padrão `google/gemini-2.5-flash`.
- Realtime: `ALTER PUBLICATION supabase_realtime ADD TABLE`.

## Próximo passo

Aprovando este plano, **executo a Fase 0 inteira** (migration + ClinicContext + ClinicSwitcher "Todas" + PatientSearchInput + useCrud + date-utils). Depois apresento a Fase 1 antes de prosseguir.

## Fora do escopo deste plano

- Não vou refatorar telas existentes que já funcionam (agenda, financeiro, prontuários) para o novo padrão de uma vez — só conforme cada módulo novo as tocar.
- Não vou remover a coluna `role` de `clinica_memberships` agora — migração gradual.
- Não vou implementar Capacitor/Electron builds neste ciclo, só preparar a estrutura.
