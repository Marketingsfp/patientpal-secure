# Nina — identificação do atendimento na reserva

## Problema comprovado

O catálogo distingue Consulta + Preventivo de Consulta Ginecologia. A Nina apresentava o preventivo corretamente, mas o vínculo com a agenda reconstruía apenas o nome da especialidade. A conferência posterior à gravação não comparava o procedimento.

## Correção

- Os candidatos da agenda usam o título do atendimento estruturado publicado, separado da especialidade.
- A preferência com/sem preventivo permanece no contexto da sessão, sem copiar preços antigos. Cada médico é revalidado no catálogo publicado da clínica.
- Alterar a variante invalida as opções e o aceite anteriores. Uma variante incompatível não vira consulta genérica.
- O nome completo segue até o resumo, a gravação na agenda e a conclusão ao paciente, inclusive com templates já publicados.
- A releitura compara também o procedimento. Divergência impede afirmar sucesso; uma repetição não duplica a reserva.

## Validação

390 testes aprovados em 13 arquivos. Incluem interpretação no núcleo real com modelo/banco simulados, executor de agenda em homologação e WhatsApp, coleta de dados antes do aceite, variantes, preços por atendimento, mudança de escolha, compatibilidade do médico, publicação única/múltipla, escopo de sessão/clínica e divergência após gravar ou reencontrar uma reserva.

Checagem TypeScript e compilação de produção executadas. A consulta ao catálogo real foi somente leitura. As reservas dos testes são simuladas; nenhum agendamento real foi criado ou alterado nesta validação. Catálogo, preços, regras e registros históricos permanecem preservados.
