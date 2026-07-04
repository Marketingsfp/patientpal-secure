# P2-AGENDAMENTO-EXAMES

Melhorias no fluxo de agendamento (Agenda e Agenda Express) sem deixar a tela pesada.

## 1. Filtro de exames dentro do agendamento

**Onde:** no seletor de procedimento/exame, tanto na `Agenda` (dialog "Novo agendamento") quanto na `Agenda Express` (Step 2/3, quando a especialidade escolhida for de exames — ex.: Ultrassonografia, Raio-X, Laboratório).

**Comportamento:**
- Campo de busca no topo da lista com debounce 200ms.
- Filtro em memória por nome, sinônimos e código TUSS/AMB (se existir na coluna `procedimentos.codigo`).
- Chips de categoria (Ultrassom, Raio-X, Laboratório, Cardiologia…) derivados de `procedimentos.categoria`/`especialidade`.
- Lista virtualizada quando >100 itens; caso contrário renderização normal.

## 2. Top 10 exames mais solicitados

**Cálculo:** nova RPC `top_procedimentos_agendamento(_clinica_id, _limit=10, _janela_dias=90, _especialidade_id?, _tipo?)`.
- Fonte: `agendamentos` das últimas 90 dias da clínica (ou unidade quando informada), agrupando por `procedimento` (texto) + tentando fazer join com `procedimentos` pelo nome/código para pegar id.
- Se a especialidade for passada (ex.: "Ultrassom"), filtra pelos procedimentos daquela especialidade via `procedimento_especialidades`.
- Retorna: `procedimento_id, nome, categoria, quantidade, ultimo_uso`.
- Ordenação: `quantidade desc, ultimo_uso desc`.
- Fallback: se <10 resultados na janela, completa com procedimentos mais cadastrados (`procedimentos.ativo=true`) da especialidade.

**UI:** faixa "⭐ Mais solicitados" acima da busca, com 10 botões compactos. Um clique preenche o procedimento e avança.

**Cache:** `staleTime` 5 min no cliente (queryKey inclui clinica+especialidade+janela).

## 3. Dados obrigatórios para Nota Fiscal (NFS-e)

Baseado no que a integração `nfse` já exige hoje (validado por `read_query` nos emitentes/tomador):

| Campo | Regra |
|---|---|
| Nome completo | obrigatório |
| CPF | obrigatório e válido |
| Data de nascimento | obrigatório |
| Telefone | obrigatório (regra global do sistema) |
| E-mail | obrigatório se emissão automática por e-mail |
| Endereço (CEP, logradouro, número, bairro, cidade, UF) | obrigatório |

**Regra de UX:** o agendamento **não é bloqueado** por falta desses dados — apenas mostra aviso "⚠ Cadastro incompleto para NFS-e: faltam CPF, endereço" com botão "Completar agora" (abre o painel rápido — item 4). Apenas o telefone é bloqueante para salvar o agendamento (regra global).

## 4. Painel rápido de cadastro incompleto

**Como funciona:**
- Componente `PatientQuickCompleteSheet` (Sheet lateral) reaproveitável em qualquer módulo.
- Ao selecionar um paciente com `cadastro_incompleto=true` (flag já vinda de `buscar_pacientes_global`), mostra badge amarelo "Cadastro incompleto — clique para completar".
- O sheet lista **apenas** os campos faltantes agrupados: Contato (telefone, e-mail), Documentação (CPF, RG, nascimento), Endereço (CEP → autofill via ViaCEP), NFS-e (bloco extra se cliente costuma pedir nota).
- Salva com `update` direto em `pacientes`, dispara `refetch` da busca e fecha o sheet. O agendamento em andamento não é perdido.
- Nova RPC utilitária `paciente_pendencias_cadastro(_paciente_id)` retorna `{ contato_ok, documentacao_ok, endereco_ok, nfse_ok, faltantes: text[] }` para o sheet exibir só o que falta.

## 5. Telefone sempre obrigatório

Já é regra do sistema. Reforçar:
- Validação client-side (Zod) em `cliente-form.tsx`, no mini-cadastro do Express, em Check-in e em qualquer criação/edição de paciente.
- Trigger `pacientes_require_telefone_bi` no banco: `BEFORE INSERT OR UPDATE` — se `telefone` for null/vazio após normalização, `RAISE EXCEPTION 'Telefone é obrigatório'`. Exceção só para pacientes migrados marcados `origem='importacao_legado'` (permite edição gradual).

## 6. Risco da alteração

| Item | Risco | Mitigação |
|---|---|---|
| Trigger telefone obrigatório | Médio — pode quebrar inserts de importação/integrações | Exceção para `origem='importacao_legado'`; testar em dry-run com `select` prévio |
| RPC top_procedimentos | Baixo — leitura agregada | Índice em `agendamentos(clinica_id, inicio, procedimento)` já existe; janela 90 dias limita |
| Sheet de cadastro incompleto | Baixo — só UI/update | Fecha sem perder estado do agendamento |
| Filtro de exames | Muito baixo — client-side | — |
| Validação NFS-e não-bloqueante | Baixo — só avisos | Não altera fluxo atual |

## 7. Telas afetadas

- `src/routes/_authenticated/app.agenda.tsx` — dialog novo agendamento (filtro + top 10 + aviso NFS-e + badge cadastro incompleto)
- `src/routes/_authenticated/app.agenda.express.tsx` — mini-cadastro com telefone obrigatório + Step 3 com filtro/top 10 quando especialidade for de exames
- `src/components/clientes/cliente-form.tsx` — telefone obrigatório
- `src/routes/_authenticated/app.checkin.tsx` — badge cadastro incompleto + acesso ao sheet
- `src/routes/_authenticated/app.caixa.tsx` — aviso NFS-e ao emitir nota (reaproveita mesmo sheet)
- **Novos:**
  - `src/components/patient-quick-complete-sheet.tsx`
  - `src/components/agenda/procedimento-picker.tsx` (busca + top 10 + chips)
  - Migração: RPC `top_procedimentos_agendamento`, RPC `paciente_pendencias_cadastro`, trigger `pacientes_require_telefone_bi`

## 8. Ordem de execução

1. Migração (RPCs + trigger telefone)
2. `PatientQuickCompleteSheet` + `ProcedimentoPicker` (componentes isolados)
3. Integração na Agenda Express (fluxo mais simples, valida primeiro)
4. Integração na Agenda principal
5. Aviso NFS-e no Caixa
6. Teste via Playwright: agendar exame com filtro + top 10 + paciente incompleto + salvar

## 9. Fora de escopo (registrado para depois)

- `P3-BUSCA-HISTORICO` (últimos 20 pacientes pesquisados no dia)
- `P2-CLIENTES-LIST-UNIFY` (unificar lista `/app/clientes` na RPC global)
- Bloqueio de emissão de NFS-e propriamente dito — hoje só avisamos; se você quiser bloquear a emissão até completar, faço em uma etapa separada.

Confirma? Assim que aprovar, sigo pela ordem acima.
