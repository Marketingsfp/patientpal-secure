## Objetivo

Redesenhar o diálogo "Histórico de alterações" do slot de agendamento (foto 2) para o formato tabela da foto 1 (Data · Usuário · Histórico), mantendo as cores/estilo do nosso sistema, e adicionar um campo para inclusão de **histórico avulso** (texto livre digitado por um usuário da clínica).

## Escopo

- **Somente** o diálogo aberto pelo ícone de escudo no slot de agendamento (arquivo `src/routes/_authenticated/app.agenda.tsx`, linhas ~4827–4937).
- Não altera o histórico de orçamentos (`historico-orcamento-dialog.tsx`) nem a página de Auditoria.
- Sem mudanças em regras de negócio de agendamento, financeiro ou repasse.

## Como vai ficar

### Layout (parecido com foto 1, cores HHP)

```
┌─────────────────────────────────────────────────────────┐
│ 🛡  Histórico                                        ✕  │
│    ALINE TAVARES... — 14/07/2026, 07:00                 │
├─────────────────────────────────────────────────────────┤
│  ┌───────────────────────────────────────────────────┐  │
│  │ [textarea: digite uma observação de histórico...] │  │
│  └───────────────────────────────────────────────────┘  │
│                                    [ + Adicionar ]      │
├─────────────────────────────────────────────────────────┤
│  Data              Usuário              Histórico       │
│  14/07/26 10:28    ELISABETE M.         Alterou status: │
│                                         agendado →      │
│                                         realizado       │
│  14/07/26 07:07    EDNALDA P.           Alterou etapa:  │
│                                         recepção →      │
│                                         triagem         │
│  10/07/26 09:49    KELLY B.             (avulso) Não    │
│                                         compareceu…     │
│  17/06/26 09:21    PATRICIA M.          Criou           │
│                                         agendamento     │
└─────────────────────────────────────────────────────────┘
                                              [ Fechar ]
```

- Tabela com cabeçalho fixo, linhas com hover suave (padrão shadcn `Table`).
- Coluna **Data**: `dd/MM/yy HH:mm`.
- Coluna **Usuário**: nome do funcionário (via `equipeList`, fallback e‑mail).
- Coluna **Histórico**: descrição legível em texto corrido. Sem cards, sem badges grandes; usa apenas um pequeno rótulo colorido (verde=Criou, âmbar=Alterou, rosa=Excluiu, azul=Nota) antes do texto — nossas cores atuais.
- Ordenação: mais recentes no topo (igual hoje).
- Empty state: linha única "Nenhum registro."

### Campo de "histórico avulso"

- Textarea + botão **Adicionar** logo abaixo do cabeçalho do diálogo.
- Ao clicar, grava uma nota livre com autor, data/hora e agendamento_id, e a linha aparece imediatamente na tabela junto com as alterações auditadas.
- Notas avulsas **não podem ser editadas nem excluídas** depois de gravadas (regra de imutabilidade de dados do projeto — `mem/constraints/governanca-dados-imutaveis.md`).
- Nota vazia é ignorada; texto é limitado a 1000 caracteres.

## Detalhes técnicos

### Persistência das notas avulsas

Nova tabela `agendamento_historico_notas` no schema `public`:

```
id uuid pk default gen_random_uuid()
clinica_id uuid not null
agendamento_id uuid not null
user_email text
user_nome text
texto text not null check (length(texto) between 1 and 1000)
created_at timestamptz not null default now()
```

- Índice em `(agendamento_id, created_at desc)`.
- `GRANT SELECT, INSERT ON public.agendamento_historico_notas TO authenticated;` (sem UPDATE/DELETE — imutável).
- `GRANT ALL ON ... TO service_role;`
- RLS habilitado; políticas: `SELECT` e `INSERT` só quando o usuário pertence à `clinica_id` (mesmo padrão das outras tabelas de agendamento).
- Sem `anon`.

### Frontend

No `app.agenda.tsx`:

- Substituir o conteúdo do `Dialog` (linhas 4827–4937) pela tabela shadcn (`Table/TableHeader/TableRow/TableCell`) + textarea + botão.
- Novo estado: `notaTexto`, `notasAvulsas`, `savingNota`.
- Carregar notas avulsas em paralelo com `auditRows` quando `auditAg` mudar.
- Fundir `auditRows` (INSERT/UPDATE/DELETE) e `notasAvulsas` em uma única lista ordenada por `created_at desc` para renderizar.
- Função helper para transformar cada `auditRow` em uma string de "Histórico" legível (ex.: `Alterou status: agendado → realizado`), reaproveitando a lógica atual de diff + `repasseLabel`.

### Não muda

- Não muda `audit_log`, triggers, nem o dialog de histórico de orçamentos.
- Não altera nenhum outro fluxo da agenda.

## Validação

- Abrir o histórico de um agendamento existente e conferir que todas as linhas hoje exibidas em cards continuam aparecendo, agora em formato tabela.
- Inserir uma nota avulsa curta e conferir que aparece imediatamente no topo, com o nome do usuário logado.
- Tentar inserir nota vazia → botão desabilitado.
- Recarregar o dialog → nota persiste.
- Conferir em outra clínica que a nota não vaza (RLS).

## Pendências que dependem de você

1. Confirma o **nome do rótulo** para notas manuais? Sugestão: mostrar um chip azul `Nota` na coluna Histórico. Alternativas: `Anotação`, `Observação`.
2. Alguma nota avulsa deve poder ser **oculta/marcada como corrigida** por gestor, ou realmente segue 100% imutável (recomendado, alinhado com a governança do projeto)?