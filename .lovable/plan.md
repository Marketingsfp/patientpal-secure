## Plano

Corrigir a tela de check-in para cumprir exatamente o combinado:

1. **Quando clicar em Buscar sem nome/CPF**
   - Mostrar todos os pacientes agendados na data selecionada que ainda estão em etapa de check-in: `aguardando_recepcao` ou `recepcao`.
   - Não exigir pagamento registrado nesse modo.
   - Continuar excluindo horários disponíveis/sem paciente e agendamentos cancelados.

2. **Quando clicar em Buscar com nome/CPF**
   - Mostrar somente os agendamentos do paciente pesquisado naquela data.
   - Incluir também os que já avançaram para `triagem`, `atendimento` ou `caixa`, para localizar casos como Quédima.
   - Não trazer pacientes cujo nome do médico/serviço contenha o termo pesquisado.

3. **Corrigir a causa do erro atual**
   - Hoje, busca vazia entra no mesmo caminho que aplica filtro de etapa, mas depende do estado de busca e pode ficar preso em uma lista vazia/antiga.
   - Vou separar explicitamente os dois modos: `busca vazia` e `busca com texto`, evitando que um comportamento interfira no outro.

4. **Manter a interface atual**
   - Botões Buscar/Limpar permanecem.
   - Badges de pagamento e etapa permanecem.
   - Botão “Confirmar presença” só aparece para pacientes ainda pendentes de check-in.

## Detalhes técnicos

- Ajustar apenas `src/routes/_authenticated/app.checkin.tsx`.
- A query sem termo manterá `.in("fluxo_etapa", ["aguardando_recepcao", "recepcao"])`.
- A query com termo buscará a data inteira e depois filtrará por `paciente_nome` ou CPF já carregado.
- O `useMemo` final não deve refiltrar itens em modo ampliado vazio de forma indevida.