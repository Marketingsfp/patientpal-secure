## Objetivo

Permitir que perfis **Admin** e **Gestor** marquem um contrato como **"sem carência"**, para casos em que o contrato está na tabela antiga ("migrar") mas na prática já é uma renovação de um cliente antigo — hoje o sistema não tem como saber isso e aplica carência como se fosse um contrato novo.

## Estado atual (verificado)

- `contratos_assinatura` já tem `contrato_origem_id` e `numero_renovacoes`. Quando qualquer um está preenchido, a Agenda/Caixa considera **renovação** e **ignora carência** (`src/routes/_authenticated/app.agenda.tsx` linhas 494–510).
- Contratos legados da "tabela antiga — migrar" não têm nenhum dos dois → sistema trata como novo → aplica carência da regra do convênio.
- Não existe hoje um campo "isenção manual de carência".

## Mudança proposta

### 1. Banco (migração)

Adicionar em `contratos_assinatura`:

- `sem_carencia boolean NOT NULL DEFAULT false` — flag manual.
- `sem_carencia_motivo text` — motivo curto informado por quem marcou (ex.: "Contrato migrado — cliente desde 2022").
- `sem_carencia_por uuid` — usuário que marcou.
- `sem_carencia_em timestamptz` — quando foi marcado.

Backfill: nada automático. Cada contrato migrado será tratado caso a caso pelo Admin/Gestor.

### 2. Regra de negócio (frontend)

Em `src/routes/_authenticated/app.agenda.tsx` (`carregarInfoConvenio`), estender a condição de renovação:

```
const isRenovacao =
  Number(contrato?.numero_renovacoes ?? 0) > 0 ||
  !!contrato?.contrato_origem_id ||
  !!contrato?.sem_carencia;   // ← novo
```

O mesmo `select` do contrato passa a buscar `sem_carencia`. Como Caixa e Agenda usam o mesmo helper, a isenção passa a valer nos dois fluxos automaticamente.

### 3. UI — aba "Dados" do contrato (`src/components/pages/contratos-page.tsx`)

Novo bloco **"Carência"** visível para **todos**, mas editável apenas para Admin/Gestor (`useRolesGestao` / equivalente já existente):

- Checkbox **"Este contrato é isento de carência"**.
- Campo texto **"Motivo"** (obrigatório quando o checkbox é marcado).
- Ao salvar: grava `sem_carencia`, `sem_carencia_motivo`, `sem_carencia_por = auth.uid()`, `sem_carencia_em = now()`.
- Para outros perfis: mostra somente leitura ("Isento — motivo: … marcado por Fulano em dd/mm/aaaa").

Ao lado da badge "Tabela antiga — migrar" na listagem, exibir badge extra **"Sem carência"** quando `sem_carencia = true`, para deixar visível na lista.

### 4. Auditoria

Registrar a mudança em `audit_log` (a tabela já existe no projeto) com ação `contrato.sem_carencia.toggle` e diff antes/depois. Assim fica rastreável quem alterou.

## Fora do escopo

- Não altera a lógica de "Tabela antiga — migrar" nem a data `migrar_apos`.
- Não altera regras de taxa de adesão.
- Não faz backfill em massa — cada contrato é marcado individualmente pelo gestor.

## Validação

1. Marcar um contrato migrado como "sem carência" com usuário Admin.
2. Abrir agendamento na Agenda usando esse contrato → o benefício do convênio deve ser aplicado imediatamente, sem exigir mensalidades pagas.
3. Repetir no Caixa (mesma função `carregarInfoConvenio`).
4. Testar com usuário Recepção → checkbox deve aparecer desabilitado/somente leitura.
5. Desmarcar → carência volta a valer.
