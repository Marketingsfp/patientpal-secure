
## P1-CAIXA-001 — /app/caixa lento (5.7s) e HTTP 400

**Evidência (Playwright A3):** `/app/caixa` demorou 5762ms com 2× `Failed to load resource: 400`. Rotas vizinhas carregam em 1-2s.

**A investigar:**
- Qual endpoint devolve 400 (verificar Network tab / logs).
- Query bloqueante no mount que puxa dados sem paginação (candidatos: `caixa_movimentos`, `caixa_sessoes`).
- Possível `.order()` sem índice + `select *` amplo.

**Impacto:** Caixa é usada dezenas de vezes por dia pela recepção; 5.7s por abertura = perda direta de produtividade.

**Prioridade:** ALTA (após P1-BUSCA-002).

## P2-MAP-PAINEL — CORRIGIDO ✅

Mapa `/app/painel → "dashboard"` corrigido para `"painel"` em `src/components/app-shell.tsx`. Recepção agora vê o item Dashboard.

## P1-BUSCA-002 — Prontuários/Documentos: `<select>` com 242k pacientes

**Evidência:** `src/routes/_authenticated/app.prontuarios.tsx:39` e `src/routes/_authenticated/app.documentos.tsx:31` fazem `select("id,nome").order("nome")` sem filtro/limite. pg_stat_statements: 620 chamadas × 213ms = 132s totais. Trava o browser ao renderizar select nativo com 242k options.

**Correção proposta:** substituir `<select>` por `PatientSearchInput` (RPC-otimizado, já existe no projeto). Autocomplete server-side com debounce.

**Risco:** baixo. Só afeta essas duas telas. Manter mesma prop de callback.

**Prioridade:** próxima etapa (após A3).
# Auditoria e Agendamento Express

## Escopo em 2 frentes

### 1. Auditoria (leitura, sem mudar código)
Rodo verificações reais nas 3 unidades e entrego um **relatório curto** ao final com o que está OK e o que precisa correção:

- **Login/permissões da usuária**: consultar `profiles`, `user_roles`, `clinica_memberships` e listar módulos visíveis por unidade.
- **Fluxo atual de agendamento**: contar cliques/campos reais em `app.agenda.tsx` e no `PatientSearchInput` hoje, medir tempo de carregamento de horários (query `medico_disponibilidades` + `agendamentos`).
- **Identificação de associado**: rodar `buscar_paciente_contato()` (função criada na última migration) contra pacientes reais da Menino Jesus com contrato ativo em `contratos_assinatura` e confirmar que retorna `associado=true` + convênio.
- **Base importada por unidade**: confirmar flag `base_importada` (Menino Jesus=true, SFP=false, Consulta Hoje=false).

Não vou executar Playwright end-to-end autenticado — nesse projeto a auditoria funcional roda por queries + inspeção de código; sinalizo se algum teste exigir sessão real.

### 2. Implementação — "Agendamento Express"
Uma tela nova, focada em recepção de alto volume:

**Fluxo (4 cliques no caso feliz):**
```
[1] Digitar CPF/telefone/nome (autocomplete instantâneo)
      → badge "Particular" | "Associado — <convênio>" | "Não encontrado" | "Base não importada"
[2] Escolher especialidade (chips, sem dropdown)
[3] Escolher profissional  OU  botão "Próximo horário disponível"
[4] Escolher horário (grid pré-carregado) → confirma
```

**Regras aplicadas no fluxo:**
- Paciente encontrado → **não abre formulário**, só mostra nome+telefone e segue.
- Paciente novo → **mini-cadastro**: nome, telefone, CPF (opcional), data nasc. Sem endereço, sem documentos.
- Associado detectado → aplica regras de `cb_convenio_regras` automaticamente, valor exibido já com desconto, badge verde. Bloqueia cobrança como particular.
- Unidade com `base_importada=false` e paciente não encontrado → banner amarelo "Base desta unidade ainda não importada" + botão "Cadastrar mesmo assim" + botão "Encaminhar para atendente".
- Botões de atalho quando paciente já tem histórico:
  - **"Agendar novamente"** (mesmo médico + mesma especialidade da última consulta)
  - **"Mesmo médico da última consulta"**
  - **"Próximo horário disponível"** (varre `medico_disponibilidades` da especialidade)

**Performance:**
- Horários dos próximos 7 dias pré-carregados em uma única RPC (`get_horarios_disponiveis(clinica_id, especialidade_id, dias)`) já ordenada.
- Autocomplete de paciente com debounce 200ms + índice em `pacientes(cpf, telefone, nome_normalizado)` se faltar.
- React Query com `staleTime` alto na lista de especialidades/profissionais (mudam pouco).

## Arquivos

**Migration (`..._agendamento_express.sql`)**
- RPC `get_horarios_disponiveis(clinica_id uuid, especialidade_id uuid, dias int)` — retorna slots livres já filtrados.
- RPC `get_ultimo_agendamento_paciente(paciente_id uuid)` — para "Agendar novamente".
- Índices que faltarem em `pacientes(cpf)`, `pacientes(telefone)`, `agendamentos(paciente_id, data_hora desc)`.

**Frontend (novos)**
- `src/routes/_authenticated/app.agenda.express.tsx` — a tela nova, rota `/app/agenda/express`.
- `src/components/agenda/ExpressPatientStep.tsx`
- `src/components/agenda/ExpressEspecialidadeStep.tsx`
- `src/components/agenda/ExpressHorarioStep.tsx`
- `src/components/agenda/ExpressConfirmar.tsx`
- `src/lib/agenda-express.functions.ts` — server fns: buscar paciente (reusa `buscar_paciente_contato`), listar especialidades da unidade, buscar horários, criar agendamento, último agendamento.

**Frontend (editados)**
- `src/routes/_authenticated/app.agenda.tsx` — adiciona botão "⚡ Agendamento Express" no topo.
- Menu lateral — link para a nova rota.

**Não vou tocar (fora de escopo aqui)**
- Reescrever o `app.agenda.tsx` atual (fica como agenda "completa" para casos avançados).
- Importar as bases de SFP e Consulta Hoje (operacional).
- Módulos financeiros, prontuário, enfermagem.

## Fora do escopo declarado
- Testes E2E automatizados com login real (Playwright autenticado não está configurado aqui). Entrego os cenários como checklist manual + queries SQL de verificação.

## Confirmações antes de codar
Só duas para não travar o fluxo:
