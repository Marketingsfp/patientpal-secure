# Nina: modalidades de atendimento

Regra de negócio informada pelo usuário em 16/09/2026. Alteração local sobre a correção de escolha de horário; atende o fluxo compartilhado do WhatsApp e da homologação.

## Antes e depois

Antes, a confirmação usava uma mensagem genérica de agendamento, sem distinguir quatro regras. Agora a modalidade publicada do profissional acompanha a oferta, a escolha validada, o resumo aceito e a confirmação da reserva.

| Modalidade | Reserva e comunicação |
|---|---|
| Hora marcada | Reserva o horário escolhido e confirmado. Informa atendimento nesse horário e chegada 15 minutos antes para check-in na Recepção Principal. |
| Ordem de chegada com pré-agendamento | Reserva o horário escolhido. Explica que quem chega primeiro será atendido primeiro e não garante a hora exata da consulta. Não pede 15 minutos de antecedência. |
| Ordem de chegada sem pré-agendamento | Orienta comparecimento nos dias/períodos publicados. Não consulta vagas individuais, não oferece horário, não inicia cadastro para reserva e não grava agendamento. Não pede 15 minutos. |
| Por numeração (ficha) | Confirma a reserva com a ficha real e horário de comparecimento, pede chegada 15 minutos antes e explica atendimento pela ordem das fichas. Não promete hora exata da consulta. |

O aviso de contato uma hora antes e a despedida existentes foram mantidos nas reservas, com referência ao horário de consulta, de pré-agendamento ou de comparecimento, conforme a modalidade. Esta mudança não cria uma automação de lembrete.

## Fonte e integridade

- A modalidade vem de `nina_cat_profissionais.tipo_atendimento` PUBLICADO, vinculada ao médico operacional. O formulário oferece as quatro opções e conserva o texto legado até edição explícita.
- Sem modalidade reconhecida no catálogo, somente `medico_agendas.ordem_chegada = false`, na agenda específica da vaga, permite inferir hora marcada. `true`, ausência e conflito não distinguem pré-agendamento de comparecimento livre; encaminha-se à equipe sem inventar a modalidade.
- `agendamentos.tipo_atendimento` continua sendo o campo financeiro existente (particular/convênio).
- A modalidade e o identificador da agenda ficam no resumo de consentimento. Mudança após o aceite impede a reserva e encaminha à equipe, preservando a regra de não substituir médico, dia ou hora.
- A ficha usa `numerarFichasFormatadas`, como a Agenda, com todas as páginas do dia do profissional e incluindo vagas/cancelados. As filas são separadas por agenda. Nenhum registro histórico é renumerado ou alterado.
- Se a consulta da ficha falha depois de uma reserva comprovada, a Nina confirma a reserva e informa que a recepção poderá fornecer o número. Não inventa ficha nem repete a gravação.
- O resumo e a confirmação usam templates específicos por modalidade. O runtime encerra o lote de ferramentas depois dessas respostas, evitando uma segunda gravação ou a substituição do texto por outro horário.
- O encaminhamento utiliza o serviço existente, que mantém o comportamento de simulação da homologação. O motor de confiança continua fora do fluxo.

## Validação local

430 testes aprovados em 22 arquivos: escolha e consentimento, executor com banco simulado, modalidades, catálogo, numeração da Agenda, cadastro, continuidade, ausência de vagas, estado da sessão e finalização/runtime nos dois ambientes. Incluem mudança de modalidade após resumo, número de ficha com paginação, falha de leitura após gravação comprovada e escolha da quarta alternativa apresentada. `bun run typecheck` aprovado e `git diff --check` sem erros.

Os testes do runtime usam modelo e banco simulados; não são conversas com o provedor real. Nenhum paciente real foi contatado ou agendamento real criado.

## Publicação e configuração

Ainda não publicado. Não exige migração de banco. Profissionais cadastrados apenas como “ordem de chegada” precisam ter a modalidade completa escolhida e publicada; não houve alteração automática dos dados do catálogo. Templates publicados continuam sujeitos à configuração da clínica, portanto devem preservar as orientações correspondentes à modalidade.
