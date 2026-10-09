# Mapa de consulta da base de conhecimento

## Caminho dos dados

1. O modelo identifica consulta ou exame/procedimento e utiliza as ferramentas existentes de pesquisa.
2. O retorno contém `records` (ou `registros` nos adaptadores) e `mapa_campos`, versão 1.
3. O mapa liga um nome claro ao caminho do dado dentro de **um registro**. Ele não copia valores, escolhe registros nem atesta que um campo está preenchido.
4. A Maria interpreta os dados públicos conforme o prompt publicado, o estado da conversa e os controles existentes de confiança/esclarecimento.

O cadastro editorial exibe o mesmo mapa em “Mapa de consulta · como as informações estão organizadas”. O módulo `catalogo-mapa-campos.ts` é a definição compartilhada entre a interface e o retorno das ferramentas, evitando manter duas listas independentes.

## Exemplos

| Nome no mapa | Consulta/profissional | Exame/procedimento |
|---|---|---|
| nome_atendimento | procedimento | procedimento |
| nome_medico | medico | extras.executantes[].nome |
| especialidades | extras.especialidades | Não é campo de especialidade de consulta |
| variacoes_nome | extras.estrutura.aliases | extras.estrutura.aliases |
| formas_pagamento | extras.formas_pagamento | extras.formas_pagamento |
| pedido_medico | extras.estrutura.pedido_medico | extras.estrutura.pedido_medico |
| horarios_habituais | extras.horarios | extras.executantes[].horarios |
| preparo_instrucoes | Sem campo próprio de preparo de consulta | preparo |
| restricoes | Condições públicas e regras por atendimento | extras.restricoes |
| aviso_vigente | extras.aviso_vigente | Não possui aviso temporário próprio |

Os nomes à esquerda são índices de navegação. Por exemplo, o nome do profissional continua armazenado em `nome` no cadastro e exposto em `medico` no registro da consulta; `mapa_campos.consultas_profissionais.nome_medico` indica esse caminho. Não houve renomeação de colunas no banco nem de campos legados das ferramentas.

## Associação e ausência de dados

- Valores permanecem associados a forma, condição e observação da mesma entrada. O mapa não modifica regras de pagamento.
- Dias, início/fim, recorrência e observação permanecem associados ao mesmo profissional e atendimento.
- Blocos em `extras.atendimentos_publicados` conservam critérios de idade, modalidades e complementos por atendimento. Um complemento pode não existir; isso não significa dispensa de requisitos.
- Campo ausente, null ou `nao_informado` permanece desconhecido. O mapa de formato não é prova de oferta ou aceite.
- Rascunhos e notas internas continuam fora da resposta pública. Avisos vencidos continuam excluídos; `aviso_vigente` retorna texto e validade somente quando vigente.
- Ambiguidade, conflito e encaminhamento continuam sob os controles existentes. O mapa não resolve uma dúvida por semelhança.
- Vagas reais continuam em `consultar_disponibilidade`. Funcionamento da clínica usa `horario_funcionamento`; localização/contato usa `dados_da_clinica`.

## Fonte e implantação

Esta alteração organiza o contrato já usado pelo núcleo compartilhado de homologação e atendimento real. A fonte operacional atual não foi trocada. A base editorial restaurada ainda depende da integração pendente ClínicaOS → base estruturada → Maria.

Sem migration, novas permissões ou alteração no cadastro de origem. Mudança aditiva no retorno: mapa de caminhos, descrição pública/restrições/observação de valores de serviços, e descrição/aviso vigente de profissionais. O aviso é filtrado pela validade existente.

Validação: testes de caminhos com registros completos, campos desconhecidos, avisos vencidos, proteção de notas/rascunhos e preservação de pagamentos/horários; testes do núcleo com transporte/modelo simulados nos dois ambientes verificam que o mapa chega à requisição do modelo, incluindo nova tentativa após busca recusada. Isso não equivale a teste com modelo real ou confirmação da versão publicada no Lovable.

Impacto: consultas organizadas sem chamadas extras ao banco/modelo. O mapa acrescenta metadados ao retorno da ferramenta, com pequeno aumento de texto enviado ao modelo. Reversão: reverter o commit; os registros e o formato legado permanecem intactos.
