Adicionar uma nova aba **Convênio** ao formulário de edição do cliente (`src/components/clientes/cliente-form.tsx`) listando todos os contratos de Cartão Convênio em que o paciente aparece — como titular ou dependente — com os detalhes do plano, dependentes e parcelas.

## O que aparece na aba

Para cada contrato encontrado, um card com:

**Cabeçalho do contrato**
- Nome do convênio/plano (de `planos_assinatura.nome`)
- Número do contrato e status (ativo / pendente / cancelado)
- Papel do paciente atual: "Titular" ou "Dependente" (badge destacado)

**Dados do contrato**
- Vigência: `data_inicio` → `data_fim` (ou `data_inicio + vigencia_meses` quando `data_fim` for nula)
- Dia de vencimento
- Valor mensal
- Forma de pagamento, número de parcelas

**Titular e dependentes**
- Nome do titular (de `contratos_assinatura.paciente_nome`)
- Lista de dependentes ativos com parentesco (de `contrato_dependentes`)
- O nome do paciente que está sendo editado fica **destacado** (negrito + cor primária + ícone) onde quer que apareça

**Resumo das parcelas** (4 cards de KPI)
- Pagas (qtd + soma)
- Pendentes / em aberto (qtd + soma)
- Em atraso — pendentes com `vencimento < hoje` (qtd + soma)
- Total do contrato

**Tabela de parcelas**
Colunas: nº, vencimento, valor, status (paga / pendente / em atraso), pago em, valor pago. Linhas em atraso destacadas em vermelho, pagas em verde.

**Estados vazios**
- Sem contratos: ícone + mensagem "Este cliente ainda não possui contratos de convênio."
- Paciente não salvo ainda: mensagem orientando a salvar antes.

## Como busca os dados

Um único `useEffect` disparado por `editing?.id`, fazendo em série:

1. `contratos_assinatura` onde `paciente_id = editing.id` (papel = titular)
2. `contrato_dependentes` onde `paciente_id = editing.id AND ativo = true`, então `contratos_assinatura` dos `contrato_id` retornados (papel = dependente)
3. União dos contratos, carrega em paralelo:
   - `planos_assinatura` pelos `plano_id`
   - `contrato_dependentes` (ativos) de todos os contratos
   - `contrato_mensalidades` de todos os contratos, ordenadas por `numero_parcela`

Status "em atraso" é derivado no cliente: `status IN ('pendente','aberto') AND vencimento < hoje` — segue a mesma regra usada em `pendencias_paciente`.

## Arquivos alterados

- `src/components/clientes/cliente-form.tsx`
  - Importar ícone `CreditCard` (lucide-react)
  - Adicionar `TabsTrigger value="convenio"` e alterar `TabsList` de `grid-cols-6` para `grid-cols-7`
  - Novos estados: `convList`, `convLoading`, tipo `ConvContrato`
  - Novo `useEffect` de carregamento
  - Novo `TabsContent value="convenio"` com a UI descrita

Nenhuma mudança de schema, RLS, função SQL ou outra rota — apenas leitura das tabelas existentes via SDK do Supabase, que já respeitam as policies da clínica.
