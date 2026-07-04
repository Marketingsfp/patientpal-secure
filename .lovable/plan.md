# Documentação de Regras de Negócio — Plano

## Objetivo
Extrair e documentar TODA a regra de negócio do sistema, cruzando: código (routes, components, functions), banco (tabelas, RPCs, policies, triggers), migrations e histórico de prompts. Nada será inventado — o que não estiver 100% no código vira **PRECISA VALIDAR**.

## Entregáveis
1. `docs/regras-negocio.md` — documento único, navegável por âncoras, com:
   - Visão geral do sistema
   - Índice de módulos
   - Ficha por módulo (13 seções fixas: objetivo, usuários, telas, tabelas, campos, fluxo, regras, validações, status, permissões, exceções, integrações, pontos incompletos)
   - Seções finais: Regras confirmadas / Inferidas / Incompletas / Conflitantes / A validar
2. `docs/regras-negocio.csv` — tabela mestre com colunas:
   `id, modulo, regra, quando_aplicada, entrada, resultado, tela, tabela_campo, fonte, confianca, duvida_para_clinica`
3. `docs/regras-negocio.CHANGELOG.md` — o que foi coberto em cada rodada, o que falta.

## Método
Investigação read-only usando subagents em paralelo, sem alterar código. Fontes por ordem de prioridade:
1. Migrations SQL (`supabase/migrations/*`) — verdade estrutural
2. RPCs `security definer` (buscar_pacientes_global, paciente_resumo_recepcao, has_role, etc.)
3. Componentes de fluxo (`src/routes/_authenticated/app.*`, `src/components/agenda|clientes|financeiro|nfse|cartao-beneficios|...`)
4. Helpers (`src/lib/*.ts`, ex.: `print-gr.ts`, `cb-regras.ts`, `pagamento-status.ts`, `permissoes-presets.ts`)
5. Memórias (`mem://features/*`)
6. Histórico de prompts (via `chat_search`) — sempre marcar como "inferido"

## Escopo — 15 módulos (rodadas)
Cada rodada = 2-3 módulos, ficha completa + linhas do CSV. Sequência:

- **R1 — Fundação:** Multi-clínica & Membership, Permissões/Perfis, Autenticação
- **R2 — Cadastro:** Pacientes (particular/associado), Duplicados, Dependentes, LGPD
- **R3 — Agenda:** Agenda principal, Agenda Express, Disponibilidades, Encerramento de expediente
- **R4 — Recepção:** Recepção, Check-in, Fluxo do paciente, Painel de senhas, Totem
- **R5 — Caixa & Pagamentos:** Caixa, Sessões, Splits, Estornos, Boletos
- **R6 — Financeiro:** Lançamentos, Contas, Categorias, Empresas, Atendimentos, Notas paciente, Regras IA, Alertas
- **R7 — NFS-e:** Emitentes, Emissão, Retentativa, Webhook FocusNFE, Bloqueios de dados obrigatórios
- **R8 — Cartão Benefícios:** Convênios, Regras (carência, gratuito, faixas), Contratos, Mensalidades, Dependentes, Repasse (mem cartão-consulta)
- **R9 — Orçamentos & Contratos:** Orçamentos, Itens, Divisão, Contratos de assinatura
- **R10 — Clínico:** Prontuários, Anamneses, Modelos, Odontologia, Exames-resultados
- **R11 — Médicos & Prestadores:** Médicos, Especialidades, Convênios, Procedimentos, Agendas, Repasses, Prestadores
- **R12 — Enfermagem:** Triagem, Alertas, Recursos, Disponibilidades
- **R13 — Comunicação:** WhatsApp (config, mensagens, templates, bots), Chat interno, Atendimento IA, Nina
- **R14 — Marketing & CRM:** Leads, Campanhas, Envios, Landing, Segmentos, CRM/oportunidades
- **R15 — Gestão de Pessoas:** RH (ponto, contratos, férias, holerites, banco horas), LMS (cursos, trilhas, certificados), Cargos, Setores
- **R16 — Transversal:** Auditoria, Documentos emitidos, Integrações/secrets, Estoque, Relatórios/BI, Modo Turbo/atalhos

Total esperado: **250-400 regras** no CSV.

## Convenções da tabela
- **id:** `MOD-000` (ex.: `AGE-014`, `NFS-007`)
- **fonte:** `codigo` | `banco` | `migration` | `prompt` | `mem` | `inferencia`
- **confianca:** `alto` (código + banco concordam) | `medio` (só código OU só banco) | `baixo` (só prompt/inferência)
- Qualquer regra com confiança `baixo` ou `medio` recebe texto em `duvida_para_clinica`

## Separação obrigatória no final do MD
- ✅ **Confirmadas pelo código** (código + migration coincidem)
- 🟡 **Inferidas do histórico de prompts** (não visível no código atual)
- 🟠 **Incompletas** (regra existe mas fluxo/UI não fecha — ex.: PatientQuickCompleteSheet, `paciente_pendencias_cadastro`)
- 🔴 **Conflitantes** (código diz A, prompt/mem diz B — ex.: telefone obrigatório vs. cadastro rápido)
- ❓ **A validar com a clínica** (regras de negócio "de vida real" não representadas em código)

## Riscos & limites
- Chat history é grande — usarei `chat_search` cirúrgico, não sweep completo.
- Não altero código, migrations, tipos, `.env`, `client.ts` — é auditoria pura.
- RPCs `security definer` serão inspecionadas por `supabase.read_query` no `pg_proc` quando necessário.
- Cada rodada gera 1 commit lógico de docs; posso pausar/retomar entre rodadas.

## Execução proposta
Ao aprovar:
1. Rodada 1 (Fundação) + esqueleto do MD/CSV + Visão geral — entrego para revisão
2. Você valida o formato antes de eu prosseguir com R2-R16
3. Depois avanço 2-3 rodadas por turno

Nenhuma linha de código de aplicação será tocada. Só criação de arquivos em `docs/`.
