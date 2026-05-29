## Objetivo

Permitir que um serviço da aba **Consultas** (`tipo = 'consulta'`) apareça em **mais de uma especialidade**, escolhidas via checklist no próprio cadastro do serviço. Para os demais tipos (procedimento, exame, etc.) nada muda — continua com 1 especialidade só, via campo `grupo`.

## Como vai funcionar (visão do usuário)

1. Na tela **Serviços → Consultas**, ao **Editar** (ou criar) um serviço, aparece uma nova seção **"Especialidades em que aparece"** com a lista de todas as especialidades ativas e um checkbox em cada.
2. Você marca as especialidades onde aquela Consulta deve aparecer (ex.: marca "Cardiologia", "Clínica Geral" e "Geriatria" para uma "Consulta Eletrocardiograma").
3. Na própria aba **Consultas**, o filtro por especialidade passa a mostrar a consulta em **todas** as especialidades marcadas.
4. O campo "Categoria" (atual `grupo`) continua existindo e funciona como a **especialidade principal** da consulta — é ele que define onde ela "nasce". O checklist apenas adiciona especialidades extras.

Nas outras abas (Procedimentos, Exames, etc.) **nada muda visualmente** — o checklist só aparece quando `tipo = 'consulta'`.

## Mudanças técnicas

### 1. Banco (1 migração)

Nova tabela de vínculo N:N:

```text
public.procedimento_especialidades
 ├─ procedimento_id   uuid  → procedimentos(id) ON DELETE CASCADE
 ├─ especialidade_id  uuid  → especialidades(id) ON DELETE CASCADE
 ├─ clinica_id        uuid  (denormalizado p/ RLS)
 ├─ created_at        timestamptz default now()
 └─ PK (procedimento_id, especialidade_id)
```

- GRANTs para `authenticated` e `service_role`.
- RLS: SELECT/INSERT/UPDATE/DELETE permitidos para membros da `clinica_id` (`is_member(auth.uid(), clinica_id)`).
- Índices: `(especialidade_id)` e `(clinica_id, especialidade_id)` para o filtro de listagem.
- **Backfill:** para cada `procedimento` com `tipo = 'consulta'`, insere uma linha vinculando ao `especialidade.id` cujo `lower(nome) = lower(procedimento.grupo)` (quando existir). Isso garante que tudo que já está cadastrado hoje continua aparecendo onde aparecia.
- **Não** mexer no campo `grupo` — ele continua sendo a "categoria principal".

### 2. Frontend — `src/routes/_authenticated/app.procedimentos.tsx`

- No `useEffect` de carga, buscar também `procedimento_especialidades` da clínica e montar um `Map<procedimento_id, Set<especialidade_id>>`.
- No **diálogo de edição/criação**, quando `form.tipo === 'consulta'`:
  - Renderizar bloco **"Especialidades em que aparece"** com lista de checkboxes (vem de `especialidades` ativas, já carregadas pela página).
  - Estado local `especialidadesIds: string[]`.
  - Ao salvar: depois do `upsert` do procedimento, fazer `delete` das linhas antigas em `procedimento_especialidades` para aquele `procedimento_id` e `insert` das novas (transação implícita via 2 chamadas; idempotente).
- No filtro por especialidade da aba **Consultas**: trocar o teste atual `lower(p.grupo) === lower(esp)` por "está em `grupo` **ou** está no mapa de vínculos extras". Outras abas continuam só pelo `grupo`.

### 3. Onde **não** mexer (a pedido do usuário)

- Agenda, Orçamentos, Contratos, Relatórios continuam lendo `grupo` como hoje — fora do escopo dessa mudança.
- Triggers existentes (`sync_procedimentos_grupo_on_esp_rename`) continuam válidos; ao renomear uma especialidade, o `grupo` dos procedimentos vinculados acompanha. O vínculo N:N usa `especialidade_id` (UUID), então rename de nome não afeta.

## Verificação após implementar

1. Editar uma Consulta existente, marcar 2 especialidades extras, salvar.
2. Trocar o filtro do topo entre essas especialidades — a mesma consulta deve aparecer em cada uma.
3. Em uma especialidade **não** marcada, a consulta não aparece.
4. Conferir no banco: `select count(*) from procedimento_especialidades` > 0 após o backfill.

Posso seguir com essa implementação?