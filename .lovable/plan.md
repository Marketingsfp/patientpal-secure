## Contexto

O usuário quer:
1. Importar as 3 planilhas de relatório de rateio (Cartão Consulta antigo, Cartão Consulta 12/06/2025–11/06/2026, Cartão Consulta + Seguro) da Policlínica Menino Jesus como base de dados de contratos antigos.
2. Cadastrar titular **e** dependentes pela tela de Cartão Benefícios (hoje só dá pra fazer pelo titular).
3. Aplicar descontos automaticamente quando o paciente do cartão for atendido (consulta, exame, etc.).
4. Bloquear **agendamento + check-in** quando houver qualquer mensalidade vencida.

Convênios já cadastrados na clínica MJ: CARTÃO CONSULTA, CARTÃO CONSULTA + SEGUROS, CARTÃO TERAPÊUTICO. 0 contratos importados até agora.

## Observações importantes sobre as planilhas

- São relatórios de **rateio de receita** (cada linha é um pagamento), não listas de titulares.
- Os nomes vêm **truncados** em ~25 caracteres com `...` no final. Isso prejudica matching exato — vou usar prefixo + fuzzy.
- Vou agrupar por nome+clínica (MJ) para extrair os titulares únicos, somando pagamentos por mês.
- Valores como R$10/15/20 são adesão; R$25 é mensalidade Cartão Consulta titular; R$15 dep; R$290/490 é Cartão Terapêutico.
- Pacientes que aparecem só nessas planilhas (não existem em `pacientes`) ficam registrados como contrato com `paciente_nome` em texto livre + flag para o atendente completar o cadastro.

## Etapas de entrega

### Etapa 1 — Importação (script + migration)
- Script local em Python que lê as 3 .xlsx, normaliza nomes (sem acentos, uppercase, sem `...`), agrupa por titular e gera registros em `contratos_assinatura` com:
  - `convenio_id` correto (Cartão Consulta vs Cartão Consulta + Seguros).
  - `paciente_nome` (texto) + tentativa de match com `pacientes` por prefixo de nome → preenche `paciente_id` quando único.
  - `data_inicio` = primeira data de pagamento da pessoa naquela planilha; `valor_mensal` inferido pelo maior valor de mensalidade observado.
  - `observacoes` = "Importado de relatório de rateio MJ <arquivo>".
- Cria entradas em `contrato_mensalidades` para cada pagamento histórico encontrado (já como `paga`).
- **Dedup**: antes de inserir, busca contrato existente com mesmo convênio+nome normalizado, mescla histórico em vez de criar novo.
- Entrega no chat: `/mnt/documents/import-cartao-mj.csv` com o resultado (titulares criados, mesclados, sem match, pagamentos importados).

### Etapa 2 — Tela: cadastrar dependentes junto do titular
- No `contratos-page.tsx` (já tem aba dependentes ao editar contrato), revisar o fluxo de **criação** do contrato:
  - Permitir, no mesmo modal de novo contrato, adicionar 1..N dependentes via `PatientSearchInput` (ou cadastro rápido inline para paciente novo).
  - Salvar dependentes em `contrato_dependentes` após criar o contrato.
- Aviso visual quando o titular tem mensalidade vencida (badge vermelho).

### Etapa 3 — Descontos automáticos no atendimento
- Já existe `procedimento_cb_convenio_valores`, `cb_convenio_regras` e `findRegra/computeValor` em `src/lib/cb-regras.ts`.
- Vou **popular as regras** dos 3 convênios MJ via migration conforme o informativo:
  - **Cartão Consulta**: consulta R$25 titular / R$15 dep, exames com tabela própria (uso valor fixo do informativo).
  - **Cartão Terapêutico**: 40% off em consultas de Pediatria/Neurologia/Ortopedia/Nutrição, 10% off em exames, terapias inclusas no pacote (valor R$0 dentro do limite semanal).
  - **Cartão Consulta + Seguros**: mesma tabela do Consulta + cobertura adicional.
- Garantir que `procedimento-cell.tsx` (agenda) e a tela de atendimento já usam essas regras quando o paciente é titular **ou** dependente ativo de contrato.

### Etapa 4 — Bloqueio por mensalidade vencida
- Nova função SQL `public.paciente_cartao_inadimplente(paciente_id, clinica_id)` que retorna `true` quando existe `contrato_mensalidades.status='vencida'` em qualquer contrato ativo do paciente (como titular ou dependente).
- No agendamento (`app.agenda.tsx`) e no check-in (`app.checkin.tsx` / `recepcao.tsx`):
  - Antes de salvar, chama a função; se inadimplente, mostra toast vermelho **bloqueante** com a lista de mensalidades vencidas e um botão "Ver financeiro".
  - Usuários com permissão `gerente` veem botão "Liberar mesmo assim" (registra log).

## Detalhes técnicos

- Importação roda local (Python + openpyxl) gerando SQL bulk. Eu rodo o SQL via `supabase--insert` em lotes de ~500 linhas.
- A função de bloqueio é `SECURITY DEFINER` para não exigir nova policy.
- Regras de preço já têm UI em `regras-tab.tsx` — não preciso criar UI nova, só popular.
- Não vou mexer em São Francisco / Consulta Hoje agora (só MJ tem planilha). Os convênios das outras clínicas ficam para uma próxima rodada com planilha delas.

## Entrego em sequência, te mostro cada etapa concluída antes da próxima

Etapa 1 leva mais tempo (parsing + dedup). Posso começar pela Etapa 3+4 (regras + bloqueio) em paralelo se preferir, já que dependem menos dos dados antigos. Confirma que pode seguir nessa ordem (1 → 2 → 3 → 4) ou prefere outra?