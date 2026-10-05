# Encaminhamento após duas falhas de entendimento

Regra confirmada pelo responsável em 05/10/2026: se a Nina não entender duas vezes o que o paciente escreveu, encaminhar para atendimento humano.

Antes, o Jev encaminhava após três mensagens consecutivas sem entendimento. A descrição da ferramenta e partes do prompt de reserva mencionavam duas perguntas de esclarecimento, o que permitia aguardar uma terceira mensagem.

Agora, a primeira mensagem incompreendida pede esclarecimento; se a resposta do paciente continuar incompreendida, encaminha na segunda falha. Entendimento confirmado, escolha válida ou avanço real reiniciam a sequência. Ausência de dados na fonte, coleta normal de cadastro/agenda e falha técnica não são falta de entendimento. Chamadas do modelo e pesquisas no mesmo turno não gastam tentativas. IDs das entradas ficam na contagem existente de auditoria e são recuperados para impedir que reprocessar a mesma entrada conte como outra mensagem.

O código do Jev Fase 2 aplica o limite de duas falhas quando essa fase está habilitada. A regra também integra o contrato efetivo enviado ao modelo em todas as clínicas, prevalecendo sobre versões antigas do prompt; a descrição da ferramenta de handoff, o prompt de reserva e as explicações da arquitetura foram alinhados. As flags existentes não foram alteradas, não foi adicionada chamada de IA e o prompt publicado no banco não foi editado.

Identificação pendente não anula encaminhamento por duas falhas reais de entendimento. Recusa compreensível de um candidato (como “não, é outro”) continua sendo resposta compreendida; o fluxo pode pedir o nome. Perguntas independentes e demais motivos operacionais mantêm seus fluxos.

Sem teto de rodadas internas: o controle de progresso implantado no commit anterior continua separado desta contagem. Síntese vazia/falha técnica não vira declaração de que o paciente não foi entendido.

Validação com núcleo real e serviços simulados cobre primeira/segunda falha, entrada reprocessada, entendimento restabelecido, motivo explícito, uma transferência sem nova geração na segunda falha, ambiente de homologação e regressões de identificação, perguntas independentes e rodadas sem teto. Nenhum teste envia WhatsApp ou cria transferência operacional. Implantação Lovable e comportamento com modelo real continuam sem confirmação.

Resultado local: 123 testes aprovados em 12 arquivos, TypeScript sem erros, build de produção concluído e `git diff --check` aprovado. Build apresenta avisos de dependências e APIs obsoletas, sem impedir a compilação.
