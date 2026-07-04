# P4-AGENDAMENTO-FLUXO (revisado)

Fluxo de agendamento para recepção de alto volume. Foco: teclado > mouse, menos cliques, sem quebrar regra de negócio.

## Escopo consolidado

### 1. Modo Recepção Turbo (teclado-first)

Ativação: toggle "Modo Turbo" na barra superior da Agenda + persistência em `localStorage`. Quando ativo, aplica atalhos globais e comportamento "Enter avança / Shift+Enter volta" em todos os diálogos de agendamento/caixa.

Atalhos globais (via `KeyboardShortcuts` estendido):

| Tecla | Ação | Onde |
|---|---|---|
| F2 | Buscar paciente (foca `[data-quick-search]`) | Global |
| F3 | Novo agendamento (encaixe) | Agenda / Express |
| F4 | Repetir último agendamento do paciente selecionado | Agenda / Express |
| F5 | Atualizar agenda (invalida query) | Agenda |
| F6 | Próximo horário disponível | Diálogo agendamento |
| F7 | Ir para Agenda Express | Global |
| F8 | Ir para Agenda | Global |
| F9 | Ir para Caixa | Global |
| Ctrl+F | Buscar paciente | Global (não conflita com find nativo dentro de input) |
| Ctrl+S | Salvar (dispara `[data-primary]`) | Diálogos |
| Ctrl+Enter | Salvar + Receber | Diálogo agendamento |
| Ctrl+Shift+Enter | Salvar + Receber + Emitir NFS-e | Diálogo agendamento |
| Esc | Fechar diálogo (nativo) | Global |
| Enter | Avança para o próximo campo `[data-turbo-field]` | Formulários |
| Shift+Enter | Volta para o campo anterior | Formulários |

Viabilidade: F5 do browser será interceptada só quando a Agenda estiver em foco e não houver input focado — em qualquer input, deixamos o F5 do navegador funcionar (evita quebrar o F5 que o usuário usa hoje para validar). Ctrl+F: interceptado só fora de input; dentro de input o find nativo prevalece.

### 2. Barra de Resumo do Paciente (`PacienteResumoBar`)

Componente único que aparece no topo do diálogo de agendamento assim que um paciente é selecionado. Nenhuma navegação necessária.

Dados exibidos em uma linha compacta (com badges e ícones):

- Tipo: Particular / Associado (cor)
- Convênio (se houver) + Empresa
- Última consulta (data + médico + especialidade)
- Último exame (nome + data)
- Pendência financeira (badge vermelho com valor em aberto)
- Cadastro incompleto (badge amarelo → abre `PatientQuickCompleteSheet`)
- WhatsApp válido (ícone verde/cinza)
- Idade + telefone principal (clique = copia)

Fonte: nova RPC `paciente_resumo_recepcao(_paciente_id, _clinica_id)` que junta `pacientes`, `agendamentos`, `contratos_assinatura`, `cb_convenios`, `fin_atendimentos` (saldo em aberto) em uma única chamada — evita cascata de queries. `staleTime` 60s.

### 3. Agendamento Inteligente (sugestões automáticas)

Baseado em `paciente_resumo_recepcao` + `top_procedimentos_agendamento`:

- **Médico sugerido**: se ≥2 dos últimos 5 atendimentos do paciente foram com o mesmo médico ativo, pré-seleciona esse médico. Badge "Sugerido pelo histórico".
- **Procedimento auto**: se o médico selecionado tem apenas 1 procedimento em `medico_procedimentos` (ativo), preenche sozinho.
- **Horário auto**: se, no dia/turno escolhido, existir apenas 1 slot livre em `medico_disponibilidades`, sugere e pré-seleciona.
- Todas as sugestões são reversíveis (nunca bloqueiam) e mostram "por quê" ao passar o mouse.

### 4. Agendamento de Exames

Já entregue como base (`ProcedimentoPicker`). Extensões:

- Chips de categoria persistentes (Ultrassom, Raio-X, Laboratório, Cardio, Imagem, Endo, etc.) — derivados de `procedimentos.categoria`.
- Seleção múltipla ("Adicionar mais um exame") reaproveitando `agendamento_orcamento_itens` — o agendamento vira multi-exame na mesma janela.
- Filtro inteligente: match por nome, sinônimo, código TUSS e também por categoria digitada (ex.: "US abd" → Ultrassom Abdome).

### 5. Cadastro e NFS-e

- Telefone permanece obrigatório (trigger já em produção).
- Ao clicar em "Salvar + Emitir Nota" (Ctrl+Shift+Enter), verifica `paciente_pendencias_cadastro`. Se faltar CPF, CEP, logradouro, número, bairro, cidade ou UF → abre `PatientQuickCompleteSheet` automaticamente com foco no primeiro campo faltante. Ao completar, retoma a emissão sem perder o estado do agendamento.
- Aviso amarelo permanente no diálogo quando `nfse_ok=false`, com CTA "Completar agora".

### 6. Limpeza da Recepção (esconder botões < 5%)

Análise dos botões atuais no diálogo "Novo agendamento" e barra da Agenda. Serão movidos para um menu "⋯ Mais opções":

- "Reagendar em lote"
- "Duplicar agendamento" (raro)
- "Bloquear horário" (usado por médico, não recepção)
- "Exportar agenda"
- "Configurar coluna"
- Campo "Nº do orçamento" (some do formulário principal; volta em Mais opções)
- Campo "Observações internas" (colapsado por padrão)
- "Status" no diálogo de criação (novo sempre = "Agendado")

Tudo permanece funcional — só sai da área de foco visual da recepção.

### 7. Métricas ANTES/DEPOIS

Cada fase termina com uma tabela medida em Playwright (script `/tmp/browser/agenda-metrics/`):

| Métrica | Como medimos |
|---|---|
| Tempo de abertura do diálogo | `performance.now()` antes/depois do clique em "Novo" |
| Tempo de busca (paciente) | `t0` = keydown, `t1` = resultado renderizado |
| Tempo para salvar | `t0` = Ctrl+S, `t1` = toast de sucesso |
| Cliques por agendamento | contador manual sobre um cenário-referência: paciente conhecido, especialidade padrão, horário livre |

Cenário-referência (paciente MICHELLE, clínica Menino Jesus, consulta comum): baseline atual = 10-11 cliques, ~23s. Meta Fase 1: 5-6 cliques, ≤12s. Meta Fase 3: 3-4 cliques, ≤8s.

## Fases

### Fase 1 — Turbo + Resumo + Sugestões básicas (executar agora)

1. RPC `paciente_resumo_recepcao` (leitura, security definer, escopo por clínica).
2. Estender `KeyboardShortcuts` com F2-F9, Ctrl+S, Ctrl+Enter, Ctrl+Shift+Enter, Enter/Shift+Enter em `[data-turbo-field]`.
3. Toggle "Modo Turbo" na barra da Agenda (persiste em `localStorage`).
4. `PacienteResumoBar` (componente novo) — integrado no diálogo da Agenda e Agenda Express.
5. Integrar `PatientQuickCompleteSheet` no diálogo da Agenda principal (hoje só está no Express).
6. "Próximo horário disponível" (F6) usando `medico_disponibilidades`.
7. "Auto-select procedimento único" (quando médico tem 1 só).
8. Esconder botões < 5% em "Mais opções".
9. Script Playwright de métricas + tabela ANTES/DEPOIS.

### Fase 2 — Repetir + Médico sugerido + Multi-exame

1. F4 "Repetir último agendamento" (reusa último `agendamentos` do paciente).
2. Médico sugerido (regra dos ≥2/5 últimos).
3. Seleção múltipla de exames no mesmo agendamento (via `agendamento_orcamento_itens`).
4. Chips de categoria no `ProcedimentoPicker`.
5. Ctrl+Enter "Salvar + Receber" (abre Caixa pré-preenchido).

### Fase 3 — NFS-e automática + limpeza fina

1. Ctrl+Shift+Enter "Salvar + Receber + Emitir NFS-e" com auto-abertura do `PatientQuickCompleteSheet` quando faltar dado obrigatório.
2. Aviso NFS-e no Caixa antes de emissão.
3. Ajustes finos de layout do diálogo com base nas métricas medidas.

## Riscos e mitigações

| Risco | Mitigação |
|---|---|
| F5 interceptado quebra reflexo do usuário | Só intercepta quando não há input focado e a Agenda está no viewport |
| Ctrl+F conflita com find nativo | Só fora de input; dentro de input, browser vence |
| Sugestão de médico "errada" | Nunca bloqueia; sempre reversível; badge explica motivo |
| Auto-select de procedimento único | Só quando `medico_procedimentos` tem exatamente 1 ativo |
| RPC `paciente_resumo_recepcao` pesada | Índices já existem em `agendamentos(paciente_id, inicio)` e `fin_atendimentos(paciente_id)`; janela: últimos 12 meses |
| Modo Turbo ativo por engano | Toggle visível + tour de 3 passos na primeira ativação |
| Esconder botões atuais | Não removidos — só movidos para "Mais opções"; nada perde função |

## Regras de negócio preservadas

- Telefone obrigatório (trigger `pacientes_require_telefone_bi`) mantido.
- Busca unificada `buscar_pacientes_global` — não muda.
- Convênios / particulares / associados — leitura apenas.
- NFS-e — regras atuais mantidas; só facilitamos o preenchimento.
- Permissões e escopo por `clinica_id` — todas as RPCs `security definer` filtram por `has_clinica_access(auth.uid(), _clinica_id)`.
- Agenda Express, Caixa, Check-in, Orçamentos, Prontuários, Documentos, Pacientes: fluxos atuais intactos; apenas Turbo + PacienteResumoBar são adicionados onde faz sentido.

## Telas afetadas na Fase 1

- `src/components/keyboard-shortcuts.tsx` (extensão)
- `src/routes/_authenticated/app.agenda.tsx` (Modo Turbo + Resumo + Sheet + Mais opções)
- `src/routes/_authenticated/app.agenda.express.tsx` (Resumo + Enter/Shift+Enter)
- Novos:
  - `src/components/agenda/paciente-resumo-bar.tsx`
  - `src/components/agenda/turbo-mode-toggle.tsx`
  - `src/lib/turbo-mode.ts` (state + hook)
  - Migração: RPC `paciente_resumo_recepcao`

## Fora de escopo (futuro)

- Histórico de buscas por usuário/dia (`P3-BUSCA-HISTORICO`).
- Unificar `/app/clientes` na RPC global (`P2-CLIENTES-LIST-UNIFY`).
- Bloqueio duro de emissão NFS-e (hoje só avisamos).

Iniciando Fase 1 assim que aprovar.
