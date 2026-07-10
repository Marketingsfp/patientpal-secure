# Redesign do modal de Auditoria da Agenda + observações manuais

## Contexto

Na Agenda existe hoje um modal "Histórico de alterações" (foto 2) que mostra cada evento em um card colorido com badge "Alterou/Criou/Excluiu", nome da tabela em fonte monoespaçada e diffs em vermelho/verde. Isso é útil pra debug técnico, mas fica visualmente pesado e "de sistema" pro dia a dia da clínica.

A referência (foto 1) é uma **tabela limpa** com três colunas — **Data**, **Usuário** e **Histórico** — em linguagem simples. A foto 3 pede também um **campo de texto + botão "+ Adicionar"** no topo do modal, para o próprio usuário registrar observações manuais (ex.: "paciente ligou pedindo remarcação").

## Pré-requisito bloqueante: restaurar o build

Antes de qualquer coisa, o build precisa voltar a passar. Hoje ele falha com ~70 erros vindos da resolução automática de conflitos de merge de mensagens anteriores (variáveis/imports que estavam do "outro lado" do conflito foram descartadas em `app.agenda.tsx`, `app.caixa.tsx`, `agenda-v2-shell.tsx`, `menu-v2`, `financeiro.*`, `print-gr.ts`, `cliente-form.tsx` etc.).

Consertar isso "à mão" um símbolo por vez é arriscadíssimo e vai reintroduzir regressões silenciosas. O caminho correto é **restaurar pela aba History** a um checkpoint verde anterior aos conflitos. Depois do restore, aplico o redesign abaixo isolado, em um único passo.

<presentation-actions>
  <presentation-open-history>Abrir History</presentation-open-history>
</presentation-actions>

## O que muda depois do restore

### 1. Nova tabela `agendamento_notas` (observações manuais)

Migration com:

- `id uuid PK default gen_random_uuid()`
- `agendamento_id uuid NOT NULL references agendamentos(id) on delete cascade`
- `clinica_id uuid NOT NULL` (usado nas policies)
- `texto text NOT NULL check (length(trim(texto)) > 0)`
- `user_id uuid`, `user_nome text`, `user_email text` (capturados no INSERT)
- `created_at timestamptz NOT NULL default now()`
- Index em `(agendamento_id, created_at desc)`
- `GRANT SELECT, INSERT ON public.agendamento_notas TO authenticated`
- `GRANT ALL … TO service_role`
- RLS habilitado + policies: SELECT/INSERT para usuários da clínica (via helper `usuario_da_clinica(clinica_id)` já existente no projeto).

Não permite UPDATE/DELETE — observação manual, uma vez lançada, fica no histórico (é auditoria).

### 2. Redesign do modal "Histórico" em `src/routes/_authenticated/app.agenda.tsx`

Substituo o conteúdo do `<Dialog open={!!auditAg} …>` (linhas ~5624–5763) por:

**Header** — mantém título "Histórico" (mais curto que "Histórico de alterações"), ícone `ShieldCheck`, subtítulo com paciente + data/hora do agendamento.

**Composer manual (topo, referência foto 3):**
- `<Textarea>` com placeholder "Escreva uma observação sobre este agendamento…", rows=3.
- Botão `+ Adicionar` alinhado à direita, primário azul (`bg-primary`), desabilitado quando o texto está vazio ou salvando.
- Ao clicar: INSERT em `agendamento_notas` com `agendamento_id`, `clinica_id`, `texto`, `user_id/nome/email` do `useAuth`. Depois limpa o textarea, dá toast de sucesso e recarrega a lista.

**Tabela unificada (referência foto 1):**

Três colunas: **Data | Usuário | Histórico**, linhas com divisórias sutis (`divide-y`), cabeçalho em `bg-muted`, tipografia limpa (sem badges coloridos, sem `font-mono`, sem cards).

Fonte de linhas = merge ordenado por `created_at desc` de:

1. **`audit_log` do agendamento** (já carregado hoje) — traduzido para linguagem natural:
   - `INSERT agendamentos` → "AGENDAMENTO CRIADO"
   - `UPDATE agendamentos` com `fluxo_etapa` mudando → "FLUXO ALTERADO PARA <TRIAGEM>" (usa o mapa de labels de etapa já existente)
   - `UPDATE agendamentos` com `status` mudando → "STATUS ALTERADO PARA <REALIZADO>"
   - `UPDATE agendamentos` com `medico_id`/`procedimento_id`/`inicio` → "REAGENDADO / MÉDICO ALTERADO / PROCEDIMENTO ALTERADO"
   - `DELETE agendamentos` → "AGENDAMENTO EXCLUÍDO"
   - `INSERT fin_lancamentos` → "PAGAMENTO DA CONSULTA REGISTRADO" (ou "DUPLICATA DE R$ X,XX GERADA VIA FATURAMENTO DO AGENDAMENTO" quando houver `origem = 'faturamento'`)
   - `UPDATE fin_lancamentos` com `repasse_pago true` → "REPASSE MÉDICO PAGO"
2. **`agendamento_notas`** — cada linha vira "HISTÓRICO: `<texto em maiúsculas>`" no estilo da foto 1 (que usa CAIXA ALTA).

Um pequeno helper `descreverEvento(row)` centraliza essa tradução. Campos técnicos crus (`fluxo_etapa: aguardando_recepcao → triagem`) somem — vai só o texto legível.

**Coluna Usuário:** nome resolvido via `equipeList` (já usado hoje) a partir de `user_email`; fallback para o email. Para `agendamento_notas`, usa `user_nome` gravado no próprio registro.

**Coluna Data:** `dd/MM/yyyy` numa linha, `HH:mm` embaixo (igual foto 1).

**Empty state:** "Nenhum histórico registrado para este agendamento." centralizado.

**Footer:** só o botão `Fechar` cinza (já existe).

### 3. Layout / design tokens

- Modal cresce um pouco: `max-w-4xl`, `max-h-[85vh]`, `flex-col`.
- Composer fica em bloco separado por `border-b` para dar respiro visual.
- Tabela responsiva: em telas < md, colunas Usuário/Histórico empilham (Data fica à esquerda como âncora).
- Sem cores fortes por tipo de evento — foto 1 é neutra. Mantenho apenas ícone `ShieldCheck` no header e o botão azul do "Adicionar".
- Usa tokens semânticos do design system (`bg-card`, `bg-muted`, `text-foreground`, `border`) — nada de `bg-white`/`text-black` hardcoded.

### 4. Fora do escopo

- Não vou reescrever o back-end do `audit_log`. Ele continua gravando os campos técnicos; a tradução acontece só na UI.
- Não vou implementar edição/exclusão de observação manual.
- Não vou tocar em outros modais que usam `audit_log` (ex.: histórico de orçamento) — este redesign é só o da Agenda.

## Ordem de execução após aprovação do plano

1. **Você** restaura via History para um checkpoint verde anterior aos conflitos.
2. Eu confirmo que o build voltou (`bun run build:dev` limpo).
3. Migration da tabela `agendamento_notas` + policies + grants.
4. Refactor do bloco do `<Dialog>` de auditoria em `app.agenda.tsx` (composer + tabela + helper `descreverEvento`).
5. Verifico visualmente abrindo o modal em um agendamento com histórico e lançando uma observação manual.
