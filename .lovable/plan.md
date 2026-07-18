## Objetivo

Adicionar uma 4ª aba **"Histórico"** ao lado de Resumo / Dados / Contrato, mostrando uma linha do tempo unificada com tudo que aconteceu no contrato — exceto agendamentos.

## O que aparecerá na aba

Uma timeline única, em ordem cronológica decrescente (mais recente no topo), com os seguintes tipos de eventos:

1. **Criação do contrato** — data/hora, quem criou, convênio, nº de pessoas, valor mensal, taxa de adesão, período (início → fim).
2. **Renovações** (tabela `contrato_renovacoes`) — data/hora, quem renovou, tipo (extensão / troca de plano), convênio anterior → novo, valor anterior → novo, período gerado, dependentes incluídos no ato da renovação.
3. **Encerramento / cancelamento** — quando `status` mudar para `cancelado` ou `encerrado`, com data/hora e usuário.
4. **Dependentes** — inclusão e exclusão, com data, hora, nome do dependente, parentesco e quem fez a ação.
5. **Alterações manuais nos dados do contrato** — mudanças em campos como valor mensal, taxa de adesão, dia de vencimento, data início / fim, faixa, isenção de carência, "apenas titular financeiro", nº de renovações etc. Cada linha mostra "campo: valor antigo → valor novo", data/hora e usuário.
6. **Alterações manuais em mensalidades** — mudança de vencimento, valor, competência ou "pago em" feita pela tela (não geradas por RPC de criação/renovação em massa). Mesma estrutura: campo, antes → depois, quem, quando.

Filtros no topo da aba: por tipo de evento (checkboxes: Contrato, Renovação, Dependentes, Mensalidades) e por intervalo de datas. Busca por nome (útil para achar rapidamente eventos de um dependente específico).

Cada linha exibe: ícone + rótulo do tipo, título, detalhes, badge do usuário responsável (nome + e-mail) e timestamp relativo ("há 3 dias") com tooltip mostrando data/hora completa.

## De onde virão os dados

Já existem hoje:
- `contratos_assinatura` — auditado em `audit_log` (dados_antes / dados_depois).
- `contrato_mensalidades` — auditado em `audit_log`.
- `contrato_renovacoes` — tabela própria com `usuario_id`, `created_at`, snapshot dos dependentes.

**Falta hoje:** `contrato_dependentes` **não** tem trigger de auditoria. A tabela guarda `incluido_em` e `excluido_em` (só data, sem hora, sem usuário) — insuficiente para atender "datas, horários e quem fez a ação".

## Detalhes técnicos

### Backend (1 migração)

- Adicionar trigger `trg_audit_contrato_dependentes` usando a função `fn_audit_trigger` já existente (mesmo padrão de `contratos_assinatura` / `contrato_mensalidades`).
- Criar RPC `contrato_historico(_contrato_id uuid)` que devolve um JSON com a linha do tempo já normalizada — junta `audit_log` (filtrado por `record_id` do contrato + IDs de dependentes/mensalidades daquele contrato), `contrato_renovacoes` e enriquece com o nome do usuário via `profiles`. Segurança: exige `is_member(auth.uid(), clinica_id)`.
  - Vantagem de centralizar: o front recebe uma lista pronta, sem múltiplas queries, e a diff de campos é calculada uma vez.
- Filtrar campos "ruído" na diff (ex.: `updated_at`, `numero`) para a timeline não ficar poluída.

### Frontend

- `src/components/pages/contratos-page.tsx`: acrescentar a aba **"Histórico"** ao `Tabs` existente (hoje: Resumo / Dados / Contrato).
- Novo componente `src/components/contratos/historico-contrato-tab.tsx` que consome a RPC via `useQuery`, mostra os filtros e renderiza a timeline.
- Dicionário de rótulos amigáveis: mapear nome técnico de coluna → rótulo em português (ex.: `valor_mensalidade` → "Valor mensal", `sem_carencia` → "Isenção de carência").
- Formatação de valores: dinheiro, datas, booleans ("Sim/Não"), enums ("ativo" → "Ativo").

### Escopo excluído

- Agendamentos (explicitamente fora, conforme pedido).
- Auditoria retroativa: dependentes já incluídos/excluídos **antes** da nova trigger não terão registro completo. Para esses, a timeline usará como fallback `incluido_em` / `excluido_em` da própria linha, sem usuário ("Origem: registro anterior à auditoria").
- Sem edição / exclusão de eventos.

## Riscos / Validação

- Trigger nova em `contrato_dependentes` gera 1 linha em `audit_log` por operação — impacto pequeno.
- RPC roda com `security definer` para conseguir ler `audit_log` (que é restrito a gestores) mesmo quando o usuário é atendente, mas retornando somente os registros do contrato em questão da própria clínica.
- Testar em um contrato com renovação (ex.: #20260619 ou #20261894) para conferir que renovação, dependentes e alterações manuais aparecem corretamente ordenados.
