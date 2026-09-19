# Pausas na Central de Atenção

Alteração de interface e leitura de dados, em 17/09/2026. Regra de encerramento da pausa atualizada em 19/09/2026.

## Comportamento

- A seção **Atendentes em pausa** mostra nome, cronômetro amarelo e total de conversas não atribuídas de cada atendente pausada, inclusive com zero pendências.
- A fila da mesma atendente aparece uma vez: junto da pausa. Filas individuais das demais atendentes e a fila global continuam disponíveis.
- Clicar na atendente filtra suas conversas pendentes dentro da Central.
- Pessoas em pausa não aumentam o contador de conversas que precisam de atenção.
- Ao mudar para Online ou Offline, a atendente sai da seção de pausas e o cronômetro some e zera. Uma nova pausa inicia outra contagem. Conversas ainda pendentes continuam na seção de filas individuais.
- Offline não recebe novas conversas na distribuição automática, mesmo com vagas na fila individual. A distribuição continua restrita a Online e Pausa; se não houver atendente elegível, as novas conversas ficam na fila global.

## Fontes e sincronização

Presença vem de `atend_agente_presenca.estado_manual`, limitada à clínica e aos membros ativos. Pendências seguem o cálculo existente de `fila_pendente`, excluindo conversas encerradas e da IA.

O início usa `consultarInicioCronometroPausa`, a mesma leitura histórica da sidebar: primeira Pausa posterior ao último Online ou Offline, considerando a versão da presença. Cliques repetidos em Pausa não reiniciam o período. O estado Offline descarta o início antigo também no recarregamento e na sincronização entre abas. Ausência ou falha na leitura do início aparece como tempo indisponível, sem inventar um horário.

`TempoPausa` compartilha um relógio local de um segundo entre a sidebar e a Central. Cada atualização usa um único instante; voltar de uma aba suspensa recalcula o tempo decorrido. O intervalo termina quando o último cronômetro desmonta. Nenhuma consulta de rede é feita por segundo.

A Central relê os dados ao abrir, nos eventos de presença/conversas, nos avisos de presença entre abas, ao recuperar conexão/visibilidade e no intervalo de 30 segundos existente.

## Acesso

A função mantém autenticação e associação à clínica. `can_manage_clinica` autoriza a visão da equipe; atendentes recebem somente a própria pausa/fila, além da contagem global já permitida.

Presenças, membros e conversas são consultados com o cliente autenticado. Como o histórico bruto de presença só permite leitura própria/admin, o servidor usa o cliente administrativo exclusivamente para calcular o início das pausas da equipe após validar gestão. Essa leitura permanece filtrada por clínica, atendente e versão; não retorna registros de auditoria. Falha na autorização interrompe a consulta. Atendentes comuns não utilizam essa leitura privilegiada.

Não há migration, alteração de distribuição, gravação de presença ou modificação de histórico nesta entrega.

## Validação local

Testes cobrem filas individuais/globais, zero/dez pendências, exclusões, privacidade, autorização, início idêntico ao da sidebar, encerramento em Online/Offline, reinício após Offline, respostas antigas e relógio compartilhado.

Prévia no Chrome com componentes reais e dados fictícios: tempos iguais em ambos os locais, seleção da atendente, atualização de dez para nove pendências, saída da lista ao ficar Online e largura de 320 pixels sem rolagem horizontal. Essa prévia não testa transporte Realtime nem dados de produção.

Publicação no Lovable continua sendo uma etapa separada.
