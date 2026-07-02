## Objetivo
Executar uma simulação **ponta-a-ponta** de um agendamento real via UI (Playwright headless autenticado como Jean), passando por todas as etapas operacionais do paciente — **exceto NFS-e** — e relatar cada erro, lentidão ou comportamento estranho encontrado no caminho.

## Escopo do fluxo simulado
Vou percorrer, em ordem, o mesmo caminho que uma recepcionista faria:

1. **Criar paciente novo** em `/app/clientes` (nome fictício "QA FLUXO {timestamp}", CPF válido gerado, telefone, data de nascimento).
2. **Criar agendamento** em `/app/agenda`:
   - Selecionar clínica POLICLINICA MENINO JESUS
   - Escolher um médico com agenda aberta hoje (uso Enfermagem/Eletrocardiograma se disponível)
   - Buscar o paciente recém-criado no combobox
   - Escolher procedimento válido do médico
   - Definir forma de pagamento particular
   - Confirmar
3. **Pagamento no caixa** em `/app/caixa` — abrir sessão se necessário, lançar a receita vinculada ao agendamento, confirmar que o badge PAGO aparece.
4. **Check-in** em `/app/checkin` — confirmar presença do paciente pago.
5. **Triagem de enfermagem** em `/app/triagem-enfermagem` — abrir a triagem, preencher sinais vitais mínimos, encaminhar para o médico.
6. **Atendimento** em `/app/atendimento-ia/{agendamentoId}` — abrir o prontuário, salvar uma evolução curta, finalizar o atendimento.
7. **Repasse médico** em `/app/financeiro/atendimentos` — confirmar que o atendimento apareceu com valor de repasse correto.
8. **Painel de chamada** em `/app/painel` — verificar se a senha do paciente foi/está na fila (leitura apenas).

**Explicitamente fora do escopo:** emissão/consulta de NFS-e, testes de convênio/cartão benefícios, split de orçamento (fluxo particular puro).

## Como vou executar
- Playwright headless com sessão do Jean já injetada, viewport 1280×1800.
- Um script Python por etapa, com screenshot antes e depois de cada ação crítica salvos em `/tmp/browser/fluxo-agendamento/`.
- Depois de cada etapa, valido no banco (SELECT direto) que o registro esperado foi criado com o status certo (`agendamentos.fluxo_etapa`, `fin_lancamentos`, `triagens_enfermagem`, `prontuarios`, `fin_atendimentos`).
- Se algum passo travar (botão desabilitado, toast de erro, tela em branco), capturo screenshot + console/network do momento e sigo para o próximo passo que não dependa dele, marcando o bloqueio no relatório.

## Entrega
Relatório em tabela por etapa com:
- Etapa | Ação | Resultado (OK / erro / lento) | Evidência (screenshot + linha do banco) | Observação técnica

Ao final, uma lista consolidada de **todos os problemas encontrados** (bug funcional, mensagem de erro, lentidão perceptível, UX confusa, dado divergente entre telas) com o arquivo/rota provável de origem, **sem aplicar correção** — só relatar, para você decidir o que priorizar.

## Dados de teste
- Paciente "QA FLUXO 02072026" (criado na simulação e deixado no banco para você inspecionar; posso removê-lo depois se pedir).
- Agendamento em horário `DISPONIVEL` de hoje ou amanhã, dependendo do que houver aberto.
- Um lançamento financeiro de teste (receita) que vou identificar por descrição prefixada `QA FLUXO`.

Nenhum arquivo de código do projeto será alterado.
