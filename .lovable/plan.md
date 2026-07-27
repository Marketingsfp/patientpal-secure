## Objetivo

Na aba **Orçamento** de Odontologia, trocar a lista de cartões por uma **tabela** com todos os orçamentos odontológicos da clínica, e mover o botão **Novo orçamento** para cima do campo de pesquisa do paciente.

Vale para as **3 clínicas** (sem feature flag). Tipo de pedido: ajuste visual/UX + leitura de dados (sem mudança de regra de negócio nem de banco).

## O que muda

### 1. Cabeçalho da aba Orçamento
```text
[ Orçamentos odontológicos ]                    [ + Novo orçamento ]
[ Pesquisar paciente ................................ ]  (filtro opcional)
```
- O botão fica acima do campo de pesquisa e **sempre habilitado** (respeitando permissão de edição).
- A pesquisa de paciente passa a ser apenas **filtro da tabela** — não é mais obrigatório selecionar paciente para ver a lista.

### 2. Novo orçamento com paciente escolhido no diálogo
- O diálogo `NovoOrcamentoOdontoDialog` ganha, no topo, o mesmo campo de busca de paciente já usado na tela (com cadastro rápido quando o paciente não existe).
- Se um paciente estiver filtrado na tela, ele vem pré-selecionado; ainda assim pode ser trocado.
- O restante do fluxo (itens, dentes, sinal/entrada) continua igual.

### 3. Tabela de orçamentos

Colunas, nesta ordem:

| Coluna | Origem |
|---|---|
| Data e hora | `orcamentos.created_at` (dd/mm/aaaa hh:mm) |
| Paciente | `paciente_nome` |
| Médico | `medico_nome` |
| Itens | contagem de linhas em `orcamento_itens` |
| Total dinheiro | soma por forma "Dinheiro" |
| Total cartão/Pix | soma por forma cartão/Pix |
| Pagos | "x/y" itens quitados, com destaque quando parcial |
| Ações | botão de impressora (2ª via) |

- Clicar na linha abre o **drawer** de detalhe já existente (com sinal/saldo por item).
- A impressora chama o `printOrcamento` atual, sem mudança de layout.
- Ordenação padrão: mais recentes primeiro; limite de 200 registros, com o filtro por paciente aplicado na consulta.

### 4. Regras de leitura dos valores e do "pagos"
- **Dinheiro / Cartão-Pix**: usa os valores por forma já gravados no orçamento; quando o orçamento não tiver valores por forma, as duas colunas mostram o valor total (comportamento igual ao da cobrança na agenda hoje).
- **Itens pagos**: item conta como pago quando estiver quitado no financeiro do orçamento **ou** quando o agendamento vinculado a ele tiver recebimento confirmado — mesma definição usada hoje na agenda. Item com apenas o sinal pago aparece como parcial, não como pago.

## Detalhes técnicos

- `src/components/odontologia/orcamento-tab.tsx`: passa a receber `pacienteId` opcional (filtro) em vez de obrigatório; consulta `orcamentos` por `clinica_id` + `especialidade_id` (Odontologia), com `.eq("paciente_id", ...)` condicional; agrega `orcamento_itens` (contagem, `valores_formas`, `status_financeiro`, `valor_pago`) e `agendamento_orcamento_itens` + `fin_lancamentos` confirmados para o contador de pagos; renderiza `Table` do shadcn no lugar dos `OrcamentoCard`.
- `src/routes/_authenticated/app.odontologia.tsx`: na `TabsContent value="orcamento"`, remove o gate `!pacienteIdOrc`, move o botão para cima do `PatientSearchInput` e sempre renderiza `OrcamentoTab`.
- `src/components/odontologia/novo-orcamento-odonto-dialog.tsx`: props de paciente viram opcionais e o diálogo passa a ter `PatientSearchInput` + `QuickPatientDialog` internos, com validação antes de salvar.
- Sem migração de banco; `OrcamentoCard` continua existindo para o módulo global de Orçamentos.

## Fora do escopo

- Módulo global `/app/orcamentos` permanece inalterado.
- Nenhuma alteração em regras de preço, convênios ou valores do Cartão Consulta.
