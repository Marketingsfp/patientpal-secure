**Tipo do problema:** regra de negócio + erro de código no cálculo de limite do convênio.

**Fato confirmado agora:** no contrato **20261413**, o Sidiclei tem hoje quatro agendamentos: ECG, RX, Ecocardiograma e Consulta Cardiologia. Já existem lançamentos confirmados para ECG, RX e Ecocardiograma, mas **não existe lançamento confirmado da consulta**. Mesmo assim, a consulta está sendo tratada como se a cota de 1 consulta/dia já tivesse sido usada.

**Problema provável no código:** a regra atual ainda conta procedimentos que não são consulta quando o cadastro do serviço não casa perfeitamente com o nome gravado na agenda, ou quando o filtro por tipo/especialidade cai no caminho genérico. Isso faz exames/serviços pagos do mesmo contrato queimarem a cota diária da consulta de R$ 9,99.

**Plano de correção:**
1. Ajustar a função de apuração do convênio na Agenda para que uma regra com `tipo = consulta` só conte como uso da cota quando o agendamento anterior também for consulta.
2. Tornar esse filtro independente de casamento exato do nome do procedimento: além do cadastro, usar o texto do procedimento da agenda como fallback seguro, tratando nomes com “ECG”, “ELETRO”, “RX”, “RAIO-X”, “ECOCARDIOGRAMA” etc. como não consulta.
3. Manter a regra de que cota só é consumida por atendimento efetivamente pago/confirmado, sem alterar valores do Cartão Consulta e sem mexer nos contratos.
4. Validar diretamente no caso do Sidiclei: a consulta de Cardiologia deve voltar a sugerir o valor do benefício do contrato, e ECG/RX/Ecocardiograma não devem consumir a cota de consulta.

**Escopo:** somente cálculo/validação da cota na Agenda. Não vou alterar valores de Cartão Consulta, contratos, mensalidades, caixa ou regras cadastradas.