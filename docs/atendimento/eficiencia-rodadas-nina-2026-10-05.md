# Eficiência de chamadas da Nina — 05/10/2026

Escopo: núcleo compartilhado WhatsApp/homologação do OS ZAP. Solicitação: reduzir chamadas desnecessárias e retirar o limite fixo de rodadas. Nina e Maria são o mesmo agente.

## Evidência anterior à mudança

Leitura dos testes recentes do Lead 01, sem enviar mensagem ou executar agendamento. No ciclo 629, o pedido de Pediatria para sábado levou cerca de 148 segundos: cinco rodadas principais, uma tentativa adicional após timeout e duas conferências Jev, totalizando oito chamadas. A segunda pesquisa recuperava o vínculo operacional do médico que já constava da primeira consulta, ampliando o resultado para outros profissionais. A reescrita reprovada pelo Jev e seu timeout consumiram aproximadamente 108 segundos desse fluxo. Os contadores cumulativos de ferramentas não foram tratados como novas chamadas.

O ciclo 627 terminou com `LIMITE_RODADAS` após seis rodadas de catálogo/agenda sem texto final. Pesquisas com profissionais diferentes não eram duplicatas exatas; o teto interrompia o fluxo antes de concluir.

A resposta do ciclo 629 usou Pix/cartão quando o retorno consultado tinha preço explícito de cartão. Durante a implementação, o responsável confirmou que **Pix e cartão sempre têm o mesmo valor**. Portanto, esse uso é autorizado e a equivalência foi alinhada na Nina e no Jev; não é tratada como invenção pela ausência de um campo Pix separado. Isso não dispensa a fonte do valor nem prova a causa única da reprovação histórica do Jev.

## Alteração

- Retirado o teto de três rodadas informativas e seis de agendamento. A auditoria registra `max_rodadas: null` e controle por novidade dos retornos.
- Resultados novos permitem continuar. Retorno de cache ou repetição dos mesmos fatos não conta como avanço, mesmo com mudança da ordem das propriedades ou de metadados de pesquisa. Se uma rodada inteira não avançar, a próxima chamada pede conclusão usando os fatos já obtidos e não expõe ferramentas.
- Resposta vazia ou tentativa de usar ferramentas nessa conclusão não gera transferência automática: solicita que o paciente escolha nova tentativa ou equipe. Encaminhamentos por outras causas explícitas continuam no fluxo existente.
- Mantidos confirmação real de agendamento, revisão/reserva do turno, idempotência, isolamento da homologação e limites técnicos de chamadas ao provedor. A remoção do teto de rodadas não torna chamadas externas imunes a timeout.
- `consultar_cadastro` inclui os vínculos de agenda somente dos profissionais retornados e confirmados. Isso evita precisar de `buscar_medicos` só para obter o ID operacional. Identidade não prova vaga, escolha nem reserva; disponibilidade continua na agenda Clínica OS. Falha nessa leitura adicional preserva os fatos do catálogo e informa indisponibilidade do vínculo.
- Orientações `instrucao` e `mapa_campos` idênticas às já enviadas no turno são omitidas dos retornos posteriores; fatos e retornos originais de auditoria são preservados.
- Sequência normal de ferramentas deixa de causar elevação automática para HIGH. Conflitos ainda podem elevar o esforço.
- Regra autorizada Pix/cartão entra no contrato de instruções do núcleo e na pergunta de conferência do Jev. O prompt publicado no banco não foi editado. Preços persistidos não foram alterados.
- Jev mantém uma oportunidade de reescrita e reconferência, inclusive depois de mais de seis consultas; reescrita não permite executar ferramentas.

## Validação

Serviços e modelo simulados, núcleo real: testes em produção/homologação cobrem oito consultas seguidas e resposta na nona, modo informativo sem teto, repetição com síntese na terceira chamada (antes na sexta), síntese vazia/inválida sem transferência, Jev com correção aprovada/reprovada após oito consultas, preservação do catálogo se falhar o vínculo e identidade operacional sem consultar vagas. Regressões cobrem perguntas independentes, identificação, contexto de agenda, transferências por motivos existentes e turno obsoleto.

Resultado local: 431 testes aprovados em 16 arquivos, zero falhas; TypeScript sem erros, build de produção concluído e `git diff --check` aprovado. Build emitiu avisos de dependências/diretivas e APIs obsoletas, sem impedir a compilação.

Não há medição pós-alteração com modelo real ou prova da revisão implantada no Lovable. Redução observada em simulação não é promessa de quantidade ou latência fixa por mensagem. Envio do commit ao GitHub não comprova implantação.
