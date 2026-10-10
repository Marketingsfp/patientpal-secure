# Pedido médico antes da agenda

Regra solicitada em 10/10/2026. Implementada no núcleo comum do WhatsApp e da homologação, para todas as clínicas que usam a fonte `base_conhecimento` e têm a exigência estruturada publicada.

A homologação usa a nova regra. Em produção, ela fica desligada até a promoção global por `VITE_NINA_PEDIDO_MEDICO_ANTES_AGENDA=true` no build. Sem essa chave, preserva-se a solicitação de foto anterior, sem o novo bloqueio da agenda. O controle é global, sem seleção por clínica, e deve ser promovido somente após validação da prévia. Rollback: retirar a chave e publicar novamente.

## Comportamento

Antes, a Nina solicitava a foto de exames com pedido obrigatório, mas essa exigência não bloqueava as ferramentas da agenda. Agora, exames com hora marcada ou ordem de chegada com pré-agendamento aguardam a foto legível reconhecida para o mesmo exame antes de consultar ou oferecer vagas, selecionar horário ou reservar. Um horário escolhido anteriormente também passa pela conferência.

| Situação                                                                                | Conduta                                                                                                                             |
| --------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| Exame identificado, pedido obrigatório e foto ausente                                   | Pedir a foto. Pode informar preço, preparo e fatos publicados; não oferecer vagas nem iniciar a reserva.                            |
| Foto já solicitada, ainda ausente                                                       | Aguardar sem repetir a solicitação ou encaminhar somente por essa pendência. Responder dúvidas informativas.                        |
| Foto reconhecida, intenção ainda não informada                                          | Apresentar informações pertinentes e perguntar se deseja agendar, quando permitido.                                                 |
| Foto reconhecida e intenção de agendar na mensagem ou no histórico da mesma solicitação | Continuar diretamente no fluxo autorizado, aproveitando médico, dia e período já informados, sem repetir a pergunta sobre intenção. |
| Ordem de chegada com pré-agendamento                                                    | Após a foto, permitir reserva de comparecimento; não prometer atendimento no minuto exato.                                          |
| Ordem de chegada sem pré-agendamento                                                    | Informar dias, períodos e orientações publicados, sem consulta de vagas ou reserva.                                                 |
| Pedido dispensado ou exigência não informada                                            | Não impor a exigência de foto.                                                                                                      |

Foto recebida não significa pedido clinicamente válido. A prova vem da mensagem de imagem e da transcrição reconhecida pelo servidor, com correspondência ao nome ou alias publicado do exame. Texto do paciente como “tenho pedido” ou “já enviei” não libera a agenda. Imagem de outra conversa, sessão ou ambiente, leitura inconclusiva e mensagem não recebida também não liberam.

## Implementação e limites

- `prompt/pedido-medico.ts` fornece a instrução comum para o contexto obrigatório de cada turno e para o prompt de referência. Não reescreve versões históricas de prompts no banco.
- `pedido-medico.ts` calcula a pendência usando o catálogo e o histórico da sessão. `pedido-medico-agenda.server.ts` confere o registro publicado e a modalidade do executante antes das ferramentas de vagas, seleção e reserva.
- O resultado `PEDIDO_MEDICO_PENDENTE` representa espera pelo paciente, sem leitura de vagas, criação de agendamento ou encaminhamento técnico. O núcleo também o verifica antes de retomar a coleta cadastral para um exame já escolhido.
- Permanecem as permissões de agenda, os fluxos de somente informar, as regras de encaminhamento, a identificação cadastral e o aceite final. A regra não habilita agendamento onde ele está desativado.
- Não há alteração estrutural de banco, reescrita de dados históricos, troca automática da fonte ou chamada extra de IA. A fonte `clinica_os` mantém o comportamento anterior porque não publica esse campo de exigência.

## Validação

Regressões automatizadas verificam o bloqueio das quatro ferramentas de consulta, liberação após foto do mesmo exame, modalidades, ambientes, isolamento de sessão/conversa, pedido já solicitado e retomada de escolha/reserva. As execuções usam serviços e mensagens simulados, sem pacientes, consultas ou reservas reais. Os testes do núcleo comprovam a entrega da nova instrução ao modelo nos dois ambientes.

O comportamento conversacional do Gemini com uma foto real deve ser conferido na homologação após implantação; modelos são simulados nos testes automatizados. Push para `main` não comprova implantação.

A prévia local isolada em `output/nina-pedido-medico-previa.html` executa o avaliador real com dados fictícios no navegador. Playwright conferiu ausência de foto, recebimento correto, outro exame, sessão anterior, foto ilegível, duas modalidades com reserva, comparecimento sem reserva, dispensa e controle desligado. Não houve requisições externas, leitura de vagas ou gravações reais. Os artefatos de prévia e os relatórios locais ficam em `output/`, ignorado pelo Git.
