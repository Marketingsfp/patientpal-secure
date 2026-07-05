
# A2 / UB — Busca Universal — Plano técnico

Escopo: unificar Ctrl+K + barra de busca do topo em **um único módulo** capaz de localizar entidades, telas e ações. Sem convênios externos — só Particular, Associado, Cartão de Benefícios, Regras do Cartão e Empresas associadas.

## 1. Entidades pesquisáveis (v1)

| Entidade                | Fonte              | Campos indexados na busca                                         | Rota destino                                    |
|-------------------------|--------------------|-------------------------------------------------------------------|-------------------------------------------------|
| Paciente                | `pacientes`        | nome, cpf, telefone, email, data_nascimento, numero_pasta         | `/app/clientes/$id` (ou drawer de edição)       |
| Orçamento               | `orcamentos`       | numero, paciente (join), status, valor_total, created_at          | `/app/orcamentos?abrir=$id`                     |
| Agendamento             | `agendamentos`     | paciente (join), medico (join), inicio, status                    | `/app/agenda?ag=$id`                            |
| Atendimento financeiro  | `fin_atendimentos` | numero, paciente (join), valor, status                            | `/app/financeiro/atendimentos?abrir=$id`        |
| NFS-e                   | `nfse`             | numero, rps, tomador, valor, status                               | `/app/nfse?abrir=$id`                           |
| Cartão de Benefícios    | `cb_convenios`     | nome do plano/entidade, ativo                                     | `/app/cartao-beneficios/convenios/$id`          |
| Associado (contrato)    | `contratos_assinatura` + `contrato_dependentes` | titular, dependentes, numero_contrato, status | `/app/cartao-beneficios/contratos/$id` |
| Regras do Cartão        | `cb_convenio_regras` | descricao, procedimento (join), plano (join)                    | `/app/cartao-beneficios/beneficios/$id`         |
| Empresas associadas     | `cb_convenios` (subset "entidade juridica") | razão social / cnpj                        | `/app/cartao-beneficios/convenios/$id`          |
| Médico                  | `medicos`          | nome, cpf, conselho, especialidades (join)                        | `/app/medicos/$id`                              |
| Procedimento            | `procedimentos`    | nome, codigo_tuss, grupo                                          | `/app/procedimentos?abrir=$id`                  |
| Tela                    | rota estática      | label, keywords                                                   | rota                                            |
| Ação rápida             | comando estático   | label, contexto atual (paciente selecionado, caixa aberto, etc.)  | executa handler                                 |

Fora do escopo v1 (para v2): boletos, exames-resultados, prontuários, salas, senhas.

## 2. RPCs

### Reutilizadas
- `buscar_pacientes_global(_clinica_ids, _termo, _limite)` — já retorna ranqueado por `match_score`. Continua sendo a fonte de pacientes.

### Novas — 1 única RPC agregadora
- `buscar_universal(_clinica_ids uuid[], _termo text, _tipos text[] DEFAULT NULL, _limite int DEFAULT 24)` — SECURITY DEFINER, `SET search_path=public`.
  - Retorna: `tipo`, `id`, `titulo`, `subtitulo`, `hint`, `payload jsonb`, `score numeric`, `criado_em timestamptz`.
  - Só devolve linhas de clínicas às quais o usuário pertence (checado via `clinica_memberships`).
  - Para cada `_tipos` (default = todos), dispara uma CTE dedicada com `LIMIT ceil(_limite/n_tipos * 2)` e faz `UNION ALL` + `ORDER BY score DESC, criado_em DESC LIMIT _limite`.
  - Fontes por tipo:
    - `paciente` → chama `buscar_pacientes_global` internamente
    - `orcamento` → `orcamentos` + join `pacientes`
    - `agendamento` → `agendamentos` + joins
    - `financeiro` → `fin_atendimentos`
    - `nfse` → `nfse`
    - `cartao_convenio` / `empresa_associada` → `cb_convenios` (flag na tabela distingue plano vs entidade jurídica)
    - `contrato_associado` → `contratos_assinatura` + `contrato_dependentes`
    - `regra_cartao` → `cb_convenio_regras`
    - `medico` → `medicos`
    - `procedimento` → `procedimentos`
- Índices adicionais (aditivos, `CREATE INDEX IF NOT EXISTS`, todos com `WHERE ativo` onde faz sentido):
  - `orcamentos(clinica_id, numero)`
  - trigram `gin` em `orcamentos(pacientes_denorm_nome)` só se necessário na v2 (v1 usa o join já indexado)
  - `nfse(clinica_id, numero)`, `nfse(clinica_id, rps)`
  - `cb_convenios(clinica_id, lower(nome))`
  - `contratos_assinatura(clinica_id, numero_contrato)`
  - `medicos(clinica_id, lower(nome))`
  - `procedimentos(clinica_id, lower(nome))`
- Nenhuma alteração em RLS. A RPC é `SECURITY DEFINER` e valida `is_member(_clinica_id)` linha a linha para cada CTE.

## 3. Ranking

`score` calculado no SQL, escala 0–100:

- +50 se match exato em campo-chave (numero, cpf, telefone)
- +30 se prefixo de nome/título
- +20 se substring
- +10 se match em campo secundário (email, especialidade, grupo)
- +5 por recência (últimos 30 dias)
- ×0.7 quando entidade está `ativo=false` / `cancelado`
- Ação e Tela recebem score fixo 90 quando keyword do label bate; senão 40

Ordenação final: `score DESC, criado_em DESC, titulo ASC`.

## 4. Permissões por perfil

- A UB **filtra entradas** conforme `usePermissoes()` (mesmo Set que o menu já usa).
- Mapa `tipo → moduloRequerido`:
  - paciente → `clientes`
  - orcamento → `orcamentos`
  - agendamento → `agenda`
  - financeiro/nfse → `financeiro` / `nfse`
  - cartao_convenio / empresa_associada / regra_cartao / contrato_associado → `cartao-beneficios`
  - medico → `medicos`
  - procedimento → `procedimentos`
  - tela → módulo próprio da tela (já sabido pela entrada)
  - acao → módulo da ação
- No servidor a RPC também respeita `is_member`; no cliente filtramos por módulo permitido antes de renderizar. Perfil `medico` recebe só paciente + agenda + prontuário-relacionadas; `caixa` recebe caixa/financeiro/paciente/nfse; `recepcao` recebe tudo exceto RH/relatórios; `admin`/`gestor` recebem todos.

## 5. UX / superfície

- **1 componente** `UniversalBar` em 3 superfícies:
  1. Input compacto no header (desktop ≥ md) — abre modal ao focar.
  2. Modal Ctrl/⌘+K (já implementado no A1).
  3. Full-screen em mobile.
- Debounce 200 ms, `AbortController`, cache LRU de 30 termos.
- Agrupamento por tipo, com atalhos:
  - `p:` só pacientes · `o:` só orçamentos · `a:` só agenda · `n:` só NFS-e · `c:` só cartão · `>` só ações · `?` só telas.
- Últimas 8 buscas salvas em `profiles.preferencias_ui.ub.recents` (aditivo à coluna já aprovada em A7).

## 6. Performance esperada

- p50 ≤ 120 ms, p95 ≤ 350 ms na clínica de referência (~40k pacientes).
- Cada CTE limita cedo (`LIMIT 24`), evitando full scan.
- Índices trigram em `pacientes` já existem (via `buscar_pacientes_global`); os demais são `lower(campo)` ou `(clinica_id, numero)`, todos B-tree pequenos.
- Response payload ≤ 8 KB (24 linhas × ~300 B).
- No cliente: virtualização não é necessária (24 itens), lista simples.

## 7. Feature flag

Flag: `ub_v1` em `profiles.preferencias_ui.flags.ub_v1` (default `false`) + override global via variável de ambiente `VITE_UB_DEFAULT=on` (opcional). Enquanto `false`:
- Header segue como está (sem input de busca).
- Ctrl+K continua abrindo o palette do A1 com apenas telas + ações (sem entidades).

Ativação por usuário na tela `/app/perfil` (toggle "Busca Universal (beta)"). Admin pode ativar em massa depois via SQL.

## 8. Fallback / erros

- Falha na RPC → toast discreto ("Busca temporariamente indisponível") e o palette continua funcionando com telas + ações (nunca quebra a UI).
- Timeout do lado cliente: 4 s. Ao expirar, mostra "resultado parcial" com o que já veio.
- Erros são logados via `console.error("[ub]", …)` + `audit_log` apenas em erro (não em cada busca, para não inflar).

## 9. Rollback

- Nível 1 (usuário): desligar flag `ub_v1` no perfil.
- Nível 2 (global): `UPDATE profiles SET preferencias_ui = jsonb_set(coalesce(preferencias_ui,'{}'), '{flags,ub_v1}', 'false')`.
- Nível 3 (código): remover `<UniversalBar>` do header e voltar `useDefaultScreenEntries` no palette. Componentes A1 permanecem.
- Nível 4 (banco): a RPC nova e os índices são **aditivos**. Podem ser removidos com `DROP FUNCTION buscar_universal(…)` + `DROP INDEX IF EXISTS …` sem impacto.

Nenhuma tabela, coluna ou RPC existente é alterada. Nenhuma RLS é tocada.

## 10. Testes Playwright

Rota isolada `/app/dev-list-shell` (já existente, admin-only) ganha painel de teste da UB. Cenários:

1. **T1 — Abrir Ctrl+K** e ver telas + ações (sem entidades) quando flag off.
2. **T2 — Ativar flag** via UI de perfil e reabrir: buscar "silva" → aparecem pacientes reais no grupo "Pacientes".
3. **T3 — Prefixos**: `p:silva` só pacientes; `o:2024` só orçamentos; `c:` só Cartão de Benefícios / Empresas associadas.
4. **T4 — Terminologia**: digitar "convên" retorna resultados de "Cartão de Benefícios" / "Empresas associadas" / "Regras do Cartão" — nunca a palavra "Convênio" aparece nos labels.
5. **T5 — Permissões**: logar como perfil `caixa`: buscar "silva" mostra paciente; buscar "med" NÃO mostra grupo "Médicos"; buscar "unida" NÃO mostra grupo "Unidades".
6. **T6 — Latência**: medir p50 em 30 buscas repetidas; falha se > 500 ms.
7. **T7 — Fallback**: mockar `.rpc` para lançar erro; palette continua abrindo com telas + ações e toast aparece.
8. **T8 — Zero regressão**: navegar Agenda, Caixa, Orçamentos, NFS-e, Recepção com flag ON e OFF; nenhum erro de console, layout idêntico.

Todos os screenshots salvos em `/tmp/browser/a2/screenshots/` e anexados ao relatório final.

## 11. Riscos

| Risco                                   | Mitigação                                              |
|-----------------------------------------|--------------------------------------------------------|
| RPC agregadora ficar lenta em produção  | Cada CTE tem `LIMIT` cedo + índices dedicados; feature flag permite rollback imediato. |
| Vazamento de dados entre clínicas       | `is_member` obrigatório dentro da RPC; testes T5.      |
| "Convênio" aparecendo em algum lugar    | Grep na PR + T4 automatizado; string proibida.         |
| Ctrl+K conflitar com atalho de navegador| `e.preventDefault()` já no A1; testado.                |
| Header ficar apertado em mobile         | Colapsa para ícone < 768px, abre modal full-screen.    |
| Cache do cliente devolver dado stale    | LRU expira por termo; TTL 60 s; invalidado ao trocar clínica. |

## 12. Entregáveis do sprint A2

1. Migração: `buscar_universal` RPC + índices aditivos + GRANT EXECUTE para `authenticated`.
2. Server fn `buscar_universal.functions.ts` (usa `requireSupabaseAuth`, chama a RPC).
3. Componente `UniversalBar` (header input + integra com CommandPalette já existente).
4. Hook `useUniversalSearch(term, tipos?)` — cache, debounce, abort, fallback.
5. Toggle de flag em `/app/perfil`.
6. Atualização do `CommandPalette` para aceitar `asyncSearch` (já existe o slot no A1).
7. Painel de teste em `/app/dev-list-shell` para os cenários T1–T8.
8. Relatório final: componentes, RPCs, screenshots, testes, risco, confirmação de zero regressão em produção.

## 13. Nomenclatura — proibições explícitas

Em nenhum label, placeholder, grupo, chip, tipo (`tipo` do payload) ou keyword pode aparecer:
- "Convênio", "Convênios", "convenio"

Substitutos oficiais:
- Plano/entidade do cartão → "Cartão de Benefícios"
- Entidade jurídica → "Empresas associadas"
- Titular + dependentes → "Associados"
- Regras do plano → "Regras do Cartão"

Nota técnica: as tabelas legadas `cb_convenios` / `cb_convenio_regras` mantêm o nome no banco (migração de nome é outro sprint), mas nunca vazam para a UI.
