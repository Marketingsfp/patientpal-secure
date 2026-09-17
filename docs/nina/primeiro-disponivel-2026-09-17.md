# Escolha de médico ou primeiro disponível

Regra de negócio solicitada em 17/09/2026. O fluxo compartilhado atende WhatsApp e homologação, para todas as clínicas.

Antes, a consulta de vagas exigia um médico definido. Agora existe `consultar_primeiro_disponivel`: quando o paciente escolhe essa estratégia, o servidor compara as agendas dos profissionais publicados do atendimento exato solicitado. A instrução CONV-07 passa a oferecer as duas possibilidades, sem repetir a pergunta se a preferência já foi expressa.

## Comportamento

- Pergunta: “Você prefere escolher um desses profissionais ou quer que eu consulte quem tem a disponibilidade mais próxima?”
- Nome escolhido: mantém a consulta da agenda desse médico.
- Primeiro disponível: lê todos os candidatos publicados da própria clínica, resolve vínculos oficiais e compara data/hora das vagas reais, dentro dos filtros do pedido e da janela de até 60 dias. Pagina o catálogo e a agenda, sem limitar a comparação aos seis primeiros nomes ou perder vagas após muitas linhas ocupadas.
- Retorna a opção mais próxima com médico, procedimento, data, hora, modalidade, orientações e registro público do próprio profissional, incluindo formas de pagamento e critérios. Preços condicionados a outras especialidades do mesmo médico são excluídos.
- Empate: apresenta as opções empatadas para escolha. Um “sim” à pergunta com duas alternativas não escolhe automaticamente o primeiro disponível.
- Agenda vazia de um médico não encerra a comparação. Ausência de vagas em todas as agendas ativa o encaminhamento humano existente. SFP mantém encaminhamento obrigatório; falha de consulta, vínculo não resolvido ou modalidade indefinida não viram conclusão falsa de agenda vazia.
- Atendimento sem pré-agendamento aparece separadamente como orientação de comparecimento nos dias/períodos publicados. Não há promessa de vaga individual ou de que uma consulta reservável acontece antes desse atendimento. Hora marcada e ficha mantêm os 15 minutos de antecedência; ordem de chegada não recebe essa exigência.
- Consultar não reserva. As opções são registradas para escolha e para o resumo final validado. Uma confirmação já aceita não é alterada pela busca.

## Implementação e validação

Código: `consulta-agenda.ts`, `paciente-tools.server.ts`, `primeiro-disponivel-catalogo.server.ts`, `tool-broker.ts`. Instrução publicável/fallback: `prompt/consulta-agenda.ts`, bloco CONV-07. Sem migração, alteração de preços ou escrita em pacientes/agendamentos reais.

Testes com banco e transporte simulados: reconhecimento de preferência e continuidade, comparação nas duas origens, empate, filtros, quatro modalidades, preços por médico/especialidade, SFP, ausência/falha de agenda, escopo da clínica, catálogo além de seis candidatos, paginação após 800 linhas ocupadas, janela de 60 dias e preservação de confirmação existente. Não houve conversa com o modelo real nem reserva real.

Resultado: 281 testes passaram (59 de autorização/escolha, 112 do executor e 110 de continuidade, histórico, escolha e encaminhamento). `bun run typecheck` e `git diff --check` passaram.

## Ativação

É necessário implantar o código antes de publicar a nova CONV-07. A ferramenta nova ainda não existe no servidor que usou o prompt v30. Na aba Arquitetura, o novo texto foi preparado como rascunho; preserva o restante do prompt, incluindo formatação para celular e regras de confirmação.

Rascunho v31 inicialmente salvo e conferido na interface, com 35.313 caracteres. Naquela validação, a versão em uso era v30 (publicada em 17/09/2026 às 16:19). O comentário do rascunho informa a dependência de implantação da ferramenta. O código desta alteração faz parte da entrega ao GitHub de 17/09/2026, preservando os commits dos colaboradores; a ativação depende da implantação e publicação do rascunho.

Atualização posterior no mesmo dia: o rascunho v31 passou a 36.425 caracteres com a interpretação contextual. O filtro literal de “primeiro disponível” foi retirado do fluxo ativo; a estratégia passa a ser interpretada pelo modelo com o histórico. Detalhes e validação em [Consulta da agenda pela intenção contextual](agenda-contextual-2026-09-17.md).

Após implantação, publicar o rascunho e validar na homologação: pedido de consulta → escolha entre médico e primeiro disponível → resultado completo → escolha da vaga → resumo final. O envio de mensagens e a reserva continuam sujeitos ao ambiente e às regras já existentes.
