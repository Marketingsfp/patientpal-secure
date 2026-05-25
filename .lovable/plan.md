## Mudança na aba "Benefícios" do Convênio

Cada benefício deixa de ser apenas `{nome, descrição}` e passa a representar uma **regra de desconto** vinculada a um **item (procedimento)** ou a uma **especialidade inteira**, com tipo de desconto, gatilho de início, limite/periodicidade de uso e definição de quem usa.

## Fluxo de cadastro

Ao clicar em **"Adicionar benefício"** na aba Benefícios do convênio, abre um pequeno diálogo de escolha de **escopo**:

- **Serviço único** — adiciona uma linha onde o usuário seleciona um **Item** (combo buscável com a lista de `procedimentos` ativos da clínica).
- **Especialidade** — adiciona uma linha onde o usuário seleciona uma **Especialidade** (combo com `especialidades` ativas).

Depois da escolha, a linha aparece na tabela inline (mesmo padrão atual) com **todos os campos editáveis direto na linha** (sem novo pop-up), seguindo a UX que você já validou nas outras abas.

## Campos por benefício (linha da tabela)

| Campo | Tipo | Opções/Comportamento |
|---|---|---|
| Escopo | Badge (read-only) | "Serviço" ou "Especialidade" — definido na criação |
| Alvo | SearchableSelect | Procedimento OU Especialidade conforme escopo |
| Tipo de desconto | Select | "Desconto %", "Desconto R$", "Gratuidade" |
| Valor | Input numérico/moeda | Aparece só se tipo = %, ou R$. Oculto em "Gratuidade" |
| A partir de | Select | "1ª mensalidade", "2ª mensalidade", "6ª mensalidade" |
| Limite de uso | Select | "Ilimitado", "1" |
| Periodicidade | Select | "Por dia", "Por mês", "Por contrato" |
| Pessoa | Select | "Apenas titular", "Titular + dependentes (somam)", "Titular ou dependentes (um ou outro)" |
| Ativo | Switch | igual hoje |
| Ações | Botão lixeira | igual hoje |

A linha fica larga: vou agrupar os campos em duas linhas dentro da mesma row (estilo card por benefício dentro do `<TableRow>`), para caber no viewport e ficar legível.

O campo "Nome" deixa de existir como entrada manual — o nome exibido será derivado automaticamente do alvo escolhido (ex.: "Consulta Cardiologia" ou "Especialidade: Pediatria"). "Descrição" continua opcional como campo livre.

## Persistência (banco)

A tabela atual `cb_beneficios` só tem `nome/descricao/ativo`. Precisa de migração para adicionar as novas colunas:

- `escopo` text — `'servico' | 'especialidade'`
- `procedimento_id` uuid null — FK para `procedimentos(id)` ON DELETE SET NULL
- `especialidade_id` uuid null — FK para `especialidades(id)` ON DELETE SET NULL
- `tipo_desconto` text — `'percentual' | 'valor' | 'gratuidade'`
- `valor_desconto` numeric(12,2) null — só preenchido em % ou R$
- `inicio_a_partir` integer — 1, 2 ou 6 (nº da mensalidade)
- `limite_uso` text — `'ilimitado' | '1'`
- `periodicidade` text — `'dia' | 'mes' | 'contrato'`
- `pessoa` text — `'titular' | 'titular_dependentes_soma' | 'titular_ou_dependentes'`

Constraints:
- CHECK: se `escopo='servico'` → `procedimento_id` not null; se `escopo='especialidade'` → `especialidade_id` not null.
- CHECK: se `tipo_desconto in ('percentual','valor')` → `valor_desconto` not null e > 0.

`nome` continua na tabela (já é NOT NULL); ele será preenchido automaticamente pelo front com o nome do procedimento/especialidade escolhido, então não quebra registros existentes nem o NOT NULL.

RLS já existente continua valendo.

## Arquivo afetado

- `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx` — UI da aba Benefícios, tipo `Beneficio`, `loadBeneficios`, `save()` (mapeamento dos novos campos), e diálogo de escolha de escopo ao "Adicionar benefício".

## Detalhes técnicos

- Pequeno `Dialog` modal com dois botões grandes ("Serviço único" / "Especialidade") chamado ao clicar em "Adicionar benefício". Ao escolher, fecha e insere a nova linha vazia com `escopo` já definido.
- Carregar `procedimentos (id, nome)` ativos e `especialidades (id, nome)` ativas uma vez ao abrir o formulário do convênio, reutilizar em todas as linhas.
- Usar `SearchableSelect` (já existe em `@/components/ui/searchable-select`) para escolher procedimento/especialidade.
- Em `save()`, validar por linha antes de inserir: alvo escolhido, valor se aplicável. Continuar usando o padrão "delete + insert" da lista de benefícios.
- Preencher `nome` no insert como: `escopo='servico' ? procedimentoNome : 'Especialidade: ' + especialidadeNome`.

## Confirmação

Posso aplicar a migração e refatorar a aba conforme acima?