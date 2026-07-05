---
name: Arquitetura de plataforma (config-first)
description: Diretrizes permanentes para toda nova feature do ClinicaOS — motor de regras, motor de fluxo, separação de status e padrão de entrega
type: preference
---
ClinicaOS é uma **plataforma** de gestão para saúde, não um sistema single-tenant. Toda nova feature deve nascer preparada para múltiplas clínicas, unidades, especialidades e serviços, evoluindo por **configuração**, não por código.

## 1. Perguntas obrigatórias antes de codar
1. Pode ser configurável (parametrizável por clínica/unidade/procedimento)?
2. Pode ser reutilizada por outras clínicas/unidades?
3. Evita criar `if`/`switch` por tipo/nome de procedimento no código?
4. Aproveita componentes, RPCs, tabelas e regras já existentes?

Config > código. Se a resposta a 1–3 for "não", justificar por escrito.

## 2. Separação definitiva de status
- **status_operacional** (fluxo do atendimento): `pendente | aguardando_agendamento | agendado | em_atendimento | concluido | cancelado | nao_aplicavel`
- **status_financeiro** (fluxo do pagamento): `pendente | pago | estornado | isento | nao_aplicavel`
- **status do orçamento** (fluxo geral): `aberto | em_andamento | finalizado | cancelado`. **"Convertido" é evento, não estado permanente** — vira `em_andamento` enquanto há itens em execução e `finalizado` quando todos os itens resolvem (op + fin).

## 3. Motor de Regras (única fonte de verdade)
Toda decisão sobre um procedimento vem de `fn_regras_procedimento(procedimento_id, unidade_id)` (merge base + override por unidade). **Nenhum módulo** pode ter regra hard-coded por tipo de procedimento (consulta/MAPA/US/lab). Novo procedimento = novo registro + configuração, sem deploy.

## 4. Motor de Fluxo
Módulos **perguntam** ao motor, não decidem sozinhos:
- Agenda: "exige agenda? exige médico/sala/equipamento?"
- Caixa: "permite venda direta? permite venda pós-agenda?"
- NFS-e: "modo de emissão da clínica é agrupado ou por item?"
- Orçamento: "como converter este item?"

## 5. Padrão de entrega (checklist obrigatório)
Toda alteração declara: Impacto Financeiro, Operacional, Experiência do Paciente, Técnico, Riscos, Plano de Rollback, Testes executados.

## 6. Auditoria
Toda alteração sensível grava: usuário, timestamp, campo, valor anterior, valor novo, motivo (quando aplicável), IP e User-Agent quando disponíveis. Usar `audit_log` + `log_action`.

## 7. Performance / anti-duplicação
Antes de criar RPC/consulta/componente novo: buscar se já existe algo equivalente. Duplicar lógica entre módulos é bug arquitetural.

## 8. Interface por perfil
Recepção = velocidade (menos cliques). Gestor = informação (dashboards, drill-down). Não adicionar campo/botão sem definir para quem serve.

## 9. KPIs que a arquitetura precisa suportar (queries diretas nas colunas de status)
- Procedimentos pagos aguardando agendamento (`status_financeiro='pago' AND status_operacional IN ('pendente','aguardando_agendamento')`).
- Procedimentos agendados aguardando pagamento (`status_operacional='agendado' AND status_financeiro='pendente'`).
- Atendimentos concluídos sem faturamento (`status_operacional='concluido' AND status_financeiro='pendente'`).
- Cancelamentos após pagamento (`status_operacional='cancelado' AND status_financeiro='pago'`).
- Tempo médio entre orçamento → pagamento → agendamento → conclusão (timestamps por transição).

**Why:** o usuário deixou explícito que quer plataforma, não sistema fechado; cada decisão de arquitetura precisa suportar crescimento por anos sem refatoração.
**How to apply:** aplicar em qualquer nova feature, migration, RPC ou tela — antes de qualquer código, validar os 9 pontos acima junto com o framework dos 4 eixos (`mem://preferences/governanca`).