# Interpretação do catálogo e esclarecimento único

A busca usa somente registros publicados da clínica. Normaliza acentos e caixa,
reconhece equivalências de escrita (USG/ultra/ultrassom, RX, ECG, EEG e abreviações
comuns de especialidades) e compara pequenos erros com o vocabulário publicado.
Os nomes originais continuam sendo exibidos; nenhum cadastro é renomeado.

Equivalências não criam oferta, preço, preparo nem disponibilidade. A busca exige
os termos específicos em conjunto: encontrar “tireoide” não comprova “USG de
tireoide”. Qualificadores como total/superior e com/sem Doppler são preservados.
As correções são limitadas em distância e tamanho. Siglas desconhecidas pedem
identificação; não há promessa de reconhecer qualquer sigla ou erro possível.

Pedidos genéricos de ultrassonografia/radiografia, resultados ambíguos e nomes de
profissionais aproximados retornam `esclarecimento`. A pergunta contém apenas
opções publicadas. O limite de resultados não pode transformar um empate em
escolha automática. Os resumos `procedure` e `price` ficam vazios enquanto a
identificação está pendente; apenas os nomes dos candidatos viram evidências.

O executor impede consultar/reservar agenda com identificação pendente. A Nina
entrega uma única pergunta. A resposta seguinte reconsulta o catálogo: referências
como “o de tireoide”, “o segundo” ou a unidade de um médico retomam as opções da
mesma sessão, sem autorizar reserva. Uma confirmação vaga não escolhe entre várias
opções. Se a identificação continuar pendente, o servidor encaminha à equipe,
sem fazer uma segunda pergunta, com o pedido, a pergunta e a resposta no resumo
interno. Falha técnica de consulta não é classificada como falta de compreensão.

Médicos homônimos mantêm identidades distintas. Nome completo, especialidade e
unidade ajudam o paciente a escolher; quando os dados não distinguem os registros,
a equipe precisa conferir. Após uma escolha contextual inequívoca, a nova consulta
usa o ID publicado e o vínculo oficial da agenda. Preços de pessoas diferentes
não são misturados nem tratados como conflito apenas porque seus nomes coincidem.

O marcador da pergunta usa o estado existente da sessão e é descartado ao
esclarecer ou reiniciar a sessão. Não há migração nem alteração dos dados históricos.
Testes usam catálogo, pacientes, agenda, modelo e transporte fictícios; nenhuma
mensagem é enviada ao WhatsApp durante a validação.
