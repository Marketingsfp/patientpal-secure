# Plano de vistoria e integração do sistema

Sem erros específicos listados, vou trabalhar em **4 ondas sequenciais**, cada uma focada em um elo do fluxo. Ao fim de cada onda eu te mostro o que encontrei + o que corrigi, e você valida antes de eu seguir para a próxima. Isso evita um patch gigante de risco alto.

## Onda 1 — Abertura de agenda + disponibilidades
Arquivos: `app.medicos.tsx`, `app.disponibilidades.tsx`, `MedicoAgendasTab.tsx`, `medico_agendas`, `medico_disponibilidades`, `medico_agenda_procedimentos`.

Vou verificar:
- Cadastro de agenda do médico salva especialidade, dias, intervalo de slots e procedimentos vinculados.
- Disponibilidade respeita feriados/bloqueios e gera os slots corretos na tela de agenda.
- Médico com 2+ agendas (clínicas/dias diferentes) não duplica nem some.
- Encaixe respeita os filtros (já corrigido recentemente — vou revalidar).

## Onda 2 — Agendamento
Arquivos: `app.agenda.tsx`, `procedimento-cell.tsx`, `app.checkin.tsx`, tabela `agendamentos`.

Vou verificar:
- Criar/editar/remarcar mantém paciente, procedimento, especialidade, médico e valor coerentes.
- Vínculo com orçamento (recém adicionado: Laboratório x Demais) está exibindo as opções certas.
- Status (agendado → confirmado → em atendimento → finalizado) atualiza em todas as telas (agenda, fluxo, recepção, painel).
- Realtime atualiza sem precisar recarregar.

## Onda 3 — Caixa / Pagamento do paciente
Arquivos: `app.caixa.tsx`, `lancamento-dialog.tsx`, `SolicitarEstornoDialog.tsx`, `pagamentos`, `pagamento_splits`, `caixa_sessoes`, `caixa_movimentos`, `fin_lancamentos`.

Vou verificar:
- Abertura/fechamento de sessão de caixa, conferência de valores.
- Pagamento vinculado ao agendamento gera lançamento financeiro e split corretos.
- Múltiplas formas de pagamento (dinheiro, cartão, pix) somam certo e respeitam taxa.
- Estorno reverte lançamento + split + status do agendamento.

## Onda 4 — Atendimento → comissão médica
Arquivos: `app.atendimento-ia.*`, `prontuarios`, `pagamento_splits`, `procedimento_split_regras`, `regras_rateio`, `app.financeiro.atendimentos.tsx`, `app.medico.$medicoId.tsx`.

Vou verificar:
- Finalizar atendimento dispara cálculo do repasse conforme `procedimento_split_regras` / `regras_rateio`.
- Comissão considera convênio/particular, descontos e taxa da maquineta.
- Relatório do médico bate com a soma dos splits.
- Pagamento ao médico (baixa) atualiza status do split e gera lançamento financeiro de saída.

## Como vou trabalhar
1. Abro a onda, leio os arquivos e o schema, listo achados (bug / inconsistência / integração faltante) com gravidade.
2. Aplico correções pontuais (sem reescrever módulos inteiros).
3. Te entrego um resumo curto + testes manuais sugeridos.
4. Você confirma e eu avanço para a próxima onda.

## Antes de começar — preciso de você
Para a Onda 1 ser efetiva, me responde:
- Tem **algum erro/tela específica** que você já viu falhar? (mesmo que vago — "ao salvar agenda some o procedimento", "encaixe vem com hora errada", etc.) Qualquer pista corta horas de auditoria às cegas.
- Posso começar pela **Onda 1 (Abertura de agenda)** agora?
