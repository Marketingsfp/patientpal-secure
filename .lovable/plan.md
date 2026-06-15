# Painel de divisão de orçamento na agenda

## Objetivo
Quando a recepção busca um orçamento com itens de tipos diferentes (ex: ultra + laboratório + ECG), abrir um painel onde ela define **quem faz, em qual sala e em qual horário** cada grupo de itens. O sistema cria **N agendamentos vinculados** ao mesmo orçamento, e a partir daí tratamos esse conjunto como um "pacote".

---

## Fluxo na tela da agenda

1. Recepção digita o nº do orçamento no campo atual.
2. Em vez de criar 1 agendamento direto, abre um **modal "Dividir orçamento"** mostrando:
   - Cabeçalho: paciente, nº do orçamento, valor total.
   - Lista de itens **pré-agrupados por tipo de procedimento** (Laboratório, Ultrassonografia, ECG, Consulta, Procedimento, etc.).
   - Cada grupo vira um "card de agendamento" editável:
     - Profissional (dropdown filtrado por quem atende aquele tipo)
     - Sala/recurso (quando aplicável — ex: ECG precisa de sala de enfermagem)
     - Data + hora início + duração
     - Observações
   - Botão "+ separar item" pra tirar um item específico do grupo e virar agendamento próprio (caso raro: 2 ultras com médicos diferentes).
   - Botão "juntar com outro grupo" se a recepção quiser fundir.
3. Botão **"Criar N agendamentos"** no rodapé — valida que todos os grupos têm profissional + horário, então cria tudo numa transação.

## Vínculo (pacote)

Cada agendamento gerado guarda referência ao orçamento de origem **e** a um id de pacote compartilhado. Com isso:

- **Pagamento único**: o pagamento é feito no orçamento (já é assim hoje); os N agendamentos só "consomem" o mesmo orçamento. Não cobra duas vezes.
- **Check-in inteligente**: ao fazer check-in de um agendamento do pacote, mostra aviso "Este paciente tem mais 2 procedimentos hoje: Ultra 14h, ECG 14h30" e oferece check-in conjunto.
- **Cancelamento**: ao cancelar um agendamento do pacote, pergunta "Cancelar só este ou todos os 3 do orçamento?".
- **Indicador visual** no card da agenda: badge "📦 1/3" mostrando que faz parte de um pacote, com tooltip listando os outros.
- **Busca por orçamento já agendado**: se a recepção buscar o mesmo orçamento de novo, sistema avisa "Este orçamento já tem 3 agendamentos ativos" e mostra a lista, em vez de duplicar.

---

## Detalhes técnicos

### Banco
Migration nova:
- Adicionar coluna `pacote_id uuid` em `agendamentos` (nullable; agendamentos avulsos ficam null).
- Índice em `(orcamento_id)` e `(pacote_id)` pra busca rápida.
- Não precisa de tabela nova — `pacote_id` agrupa, `orcamento_id` já existe.

### Frontend
- Novo componente `src/components/agenda/dividir-orcamento-dialog.tsx` com o painel descrito.
- Em `src/routes/_authenticated/app.agenda.tsx`:
  - `buscarOrcamento` muda: em vez de criar agendamento direto, carrega itens do orçamento, agrupa por `procedimentos.tipo` e abre o novo dialog.
  - Verifica antes se já existem agendamentos ativos pra esse orçamento (avisa em vez de duplicar).
  - Submit do dialog: gera `pacote_id = crypto.randomUUID()` e insere N linhas em `agendamentos` em uma única chamada.
- Card do agendamento na agenda: badge "📦 X/Y" quando `pacote_id` não é null.
- Modal de cancelamento: detecta `pacote_id` e oferece "cancelar pacote inteiro".
- Check-in: ao confirmar presença, busca outros agendamentos do mesmo `pacote_id` no dia e oferece check-in em lote.

### Agrupamento padrão
Os itens são agrupados pelo campo `procedimentos.tipo` (laboratorio, ultrassonografia, ecg, consulta, procedimento, odontologia, etc.). Itens sem tipo definido vão pra um grupo "Outros" que a recepção precisa atribuir manualmente.

---

## O que NÃO está nesse plano (pra próximas etapas)
- Sugestão automática de horário (ex: encaixar os 3 procedimentos em janelas livres consecutivas). Por ora a recepção escolhe na mão.
- Recurso de "fila do paciente" (esperar entre um exame e outro). Tratamos como agendamentos independentes no mesmo dia.
- Reagendamento em lote (mudar dia do pacote inteiro). Fica pra v2.

---

## Próximo passo
Se aprovar, começo pela migration do `pacote_id` + ajuste do `buscarOrcamento` pra abrir o dialog, e depois construo o componente de divisão.
