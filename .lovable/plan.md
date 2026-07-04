## P1-BUSCA-UNIFICADA — Busca de pacientes única em todo o sistema

Objetivo: toda tela do sistema usar o mesmo componente e a mesma RPC de busca, com regras de relevância, ordenação e apresentação padronizadas. Nenhum módulo terá lógica própria.

---

### 1. Backend — RPC única `buscar_pacientes_global`

Substitui/estende `buscar_pacientes_agenda`. Assinatura:

```
buscar_pacientes_global(
  _clinica_id uuid,
  _termo text,
  _unidade_id uuid default null,
  _limit int default 20
) returns table (...)
```

**Aceita automaticamente (detecção por regex):**
- CPF com ou sem máscara → normaliza para dígitos e compara com `regexp_replace(cpf,'\D','')`
- Telefone com ou sem máscara → idem em `telefone` e `telefone_secundario`
- Data (`DD/MM/AAAA`, `DDMMAAAA`, `AAAA-MM-DD`) → `data_nascimento`
- Número → tenta prontuário, código do paciente, pasta, código antigo, e também telefone/CPF parcial
- Texto → nome, split por tokens (todos os tokens precisam bater via ILIKE)

**Campos retornados por linha:**
`id, nome, cpf, telefone, data_nascimento, numero_prontuario, codigo_paciente, codigo_prontuario_anterior, unidade_id, unidade_nome, status (particular/associado), cadastro_incompleto (bool), ultima_consulta (date), match_score (int), match_reason (text)`

**Ranking (`match_score` desc, depois nome):**
1. CPF exato (100)
2. Prontuário exato (95)
3. Código paciente exato (90)
4. Código antigo exato (88)
5. Telefone exato (85)
6. Nome completo exato (80)
7. Nome começa com (60)
8. Nome contém todos tokens (40)
9. Data nascimento (30)
10. Telefone/CPF parcial (20)

**`cadastro_incompleto`** = true se faltar telefone, CPF, data_nascimento ou nome.

Índices funcionais adicionais (idempotentes):
- `idx_pacientes_cpf_digits` on `regexp_replace(cpf,'\D','')`
- `idx_pacientes_nome_trgm` (gin trgm) — se pg_trgm disponível
- reuso do `idx_pacientes_telefone_digits` já criado

Compatibilidade: manter `buscar_pacientes_agenda` como wrapper (chamando a nova) para não quebrar chamadas existentes durante a transição.

---

### 2. Frontend — componente único `PatientSearchInput`

Refatorar `src/components/patient-search-input.tsx` para ser a única porta de busca:
- Debounce 250ms, mínimo 2 caracteres (1 dígito se numérico).
- Chama sempre `rpc('buscar_pacientes_global')`.
- Renderiza cada resultado com: **Nome** • DN • Telefone (mascarado) • Prontuário • Status • Unidade • Última consulta.
- Badge amarelo "Cadastro incompleto — clique para completar" quando `cadastro_incompleto`.
- Callback `onSelect(paciente)` com o objeto completo.
- Slot opcional "+ Cadastrar novo paciente" quando nenhum resultado.
- Máscaras apenas na exibição (util `formatCPF`, `formatTelefone`).

---

### 3. Adoção em todos os módulos

Substituir buscas locais pela `PatientSearchInput` em:

Agenda, Agenda Express, Check-in, Caixa, Pacientes (lista), Prontuários, Documentos, Orçamentos, Atendimento IA, Financeiro (lançamento/atendimentos/notas), Cartão Benefícios, Exames Resultados, Odontologia, Contratos, Painel.

Arquivos previstos (mesmo padrão de import + troca do `<input>` local pelo componente):
`app.agenda.tsx`, `app.agenda.express.tsx`, `app.checkin.tsx`, `app.caixa.tsx`, `app.clientes.index.tsx`, `app.prontuarios.tsx`, `app.documentos.tsx`, `app.orcamentos.tsx`, `app.atendimento-ia.*`, `app.financeiro.*`, `app.exames-resultados.tsx`, `app.odontologia.tsx`, `app.cartao-beneficios.*`, `contratos-page.tsx`, `lancamento-dialog.tsx`, `paciente-quick-actions.tsx`.

Telas públicas (`totem.tsx`, `autoatendimento.tsx`, `painel.tsx`, `paciente.perfil.tsx`, `paciente.financeiro.tsx`) **não** entram — usam fluxos anônimos/token, fora do escopo.

---

### 4. Normalização de dados

Trigger `pacientes_normalize_bi` (BEFORE INSERT/UPDATE):
- `cpf := regexp_replace(coalesce(cpf,''), '\D','')` → `null` se vazio
- `telefone := regexp_replace(...)`, idem `telefone_secundario`
- `nome := btrim(regexp_replace(nome, '\s+', ' ', 'g'))`

Backfill único no mesmo migration: `UPDATE pacientes SET cpf = regexp_replace(...) WHERE cpf ~ '\D'` idem telefone. Sem alterar máscara na UI (formulários continuam recebendo com máscara, o trigger despoja).

---

### 5. Detecção de duplicados (alerta, sem merge)

View `v_pacientes_duplicados_suspeitos` agrupando por:
- mesmo CPF (dígitos) não nulo com >1 id
- mesmo telefone (dígitos) não nulo com >1 id
- mesmo `upper(nome)` + `data_nascimento` com >1 id

Exposta via RPC `listar_duplicados_pacientes(_clinica_id, _tipo)` para uso em uma futura tela de "Conferência de duplicados" (a UI pode ser incluída aqui como página simples em `app.clientes.duplicados.tsx`, apenas leitura + link para os cadastros).

---

### 6. Registrado como melhoria futura (não neste ciclo)

Histórico de buscas por usuário/dia (localStorage inicialmente, tabela `busca_historico` no futuro). Não implementado agora.

---

### Testes (Playwright + SQL)

- SQL: 8 chamadas à RPC cobrindo CPF com/sem máscara, telefone com/sem máscara, DN 2 formatos, prontuário, nome parcial, nome com dois tokens, não encontrado.
- Playwright: abrir Agenda, Caixa, Prontuários e Documentos — digitar o mesmo termo em cada uma e conferir que o dropdown mostra o mesmo paciente e os mesmos metadados.
- Antes/depois de p95 da RPC (esperado < 300 ms com índices).

### Rollback

- RPC nova é aditiva; `buscar_pacientes_agenda` mantido como wrapper — reverter é apagar wrapper e voltar componentes ao estado anterior (um único commit por módulo facilita).
- Trigger de normalização pode ser desativado (`ALTER TABLE ... DISABLE TRIGGER`) sem perda de dados.

### Risco

- Baixo em leitura (RPC nova, invocada apenas pelo componente).
- Médio em escrita: o trigger reescreve CPF/telefone. Mitigado por: (a) só remover não-dígitos, sem descartar dados; (b) backfill no mesmo migration para deixar base consistente; (c) rollback simples.

### Ordem de execução

1. Migration: RPC nova + índices + trigger + backfill + view duplicados.
2. Refactor do `PatientSearchInput`.
3. Adoção módulo a módulo (commits pequenos por área).
4. Testes Playwright em Agenda / Caixa / Prontuários / Documentos.
5. Página `app.clientes.duplicados.tsx` (leitura).
6. Medir p95 e reportar.

Confirma que posso seguir com essa ordem?
