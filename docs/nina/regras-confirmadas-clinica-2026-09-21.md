# Definições confirmadas em 21/09/2026

Alteração de regras de negócio autorizada pelo usuário após a lista de pendências.

- Horários e limites: informar como publicados para cada atendimento, sem copiar limites de outra consulta do mesmo médico. Ausência de horário de saída/término é omitida, sem estimativa ou encaminhamento só por esse campo. Não trocar pelo fechamento da unidade. Karen permanece com chegada até 17h.
- Anestesia: quando publicada como valor separado, é adicional ao procedimento. Os preços-base e as formas de pagamento permanecem intactos; o total soma os valores confirmados. Os três procedimentos do Marcelo Barreto passam a explicar o adicional de R$ 500,00 no texto e no complemento do atendimento.
- Agendado: hora marcada.
- Ordem de chegada: pré-agendamento com reserva de um horário; a ordem vale entre os pacientes daquele horário. A exceção explícita sem pré-agendamento e a modalidade por ficha permanecem válidas.
- Sandro Prinscewal: 20 vagas de cardiologia e 20 de clínico geral, separadamente. Isso é limite publicado, não comprovação de vagas livres nem criação de vagas na agenda.

As demais pendências ficam preservadas: peso, referências quinzenais, distribuição das vagas de outros profissionais, atendimento humano pelo WhatsApp e identificação dos telefones como WhatsApp.

## Implementação e verificação

As mesmas regras alimentam o prompt de fallback, o bloco da ferramenta e a edição assistida da base. O resolvedor de modalidade passa a ler os blocos de atendimento publicados, preservando o bloqueio quando há conflito ou modalidades diferentes/incompletas no mesmo profissional.

A migration `20260921210000_nina_regras_confirmadas_clinica.sql` publica uma nova versão WhatsApp e atualiza somente os textos/complementos dos três procedimentos de anestesia e o texto de capacidade de Sandro. Não altera schema, preços-base, calendários, horários, limites de chegada, capacidades operacionais da agenda, cobranças, pacientes ou mensagens. Rascunhos e registros arquivados são preservados. Usa a auditoria existente e mantém o conteúdo da versão anterior.

Testes locais cobrem as modalidades na consulta de vagas, confirmação de pré-agendamento, associação de regras por atendimento, manutenção de campos desconhecidos e compatibilidade entre prompt publicado e fallback. PostgreSQL descartável verifica os quatro registros esperados, preservação de preço/horário/histórico/auditoria, publicação válida e reaplicação sem duplicar mudanças.

Aplicação pelo editor SQL confirmada em 21/09/2026: WhatsApp v44 (`f6ed99c9-64bb-487d-a87d-a503f7057780`), 54.315 caracteres, MD5 `4fd57de87627840e9ebe1e84a523fc90`. V43 arquivada com conteúdo preservado; painel interno v4 intacto. Comparações antes/depois confirmaram os demais cadastros integralmente preservados e os preços/campos não autorizados dos registros alterados intactos. Leitura posterior confirmou os três adicionais e as 20 vagas por consulta.

Validação: 236 testes focados aprovados, typecheck aprovado e teste PostgreSQL descartável aprovado. A publicação das instruções e dos quatro cadastros está concluída; o código da aplicação requer a publicação correspondente no Lovable.

Para reversão, republicar a versão anterior das instruções e restaurar apenas os campos alterados a partir da auditoria, após conferir se houve edição posterior. Não apagar o histórico.
