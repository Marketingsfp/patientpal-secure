# Dicionário de formas de falar por cadastro

## Escopo entregue

Exames/procedimentos e consultas/profissionais têm um campo visível de variações e um botão de geração com `openai/gpt-6-astra`, usando Responses no gateway já utilizado pelo projeto. É independente do Opus que organiza os demais campos e do modelo de atendimento. Não há substituição automática de modelo caso Astra não esteja disponível no gateway.

A geração usa nome, descrição pública, especialidades, abrangência (item/grupo) e variações do formulário atual. Não lê conversas, pacientes ou notas internas. A descrição pública pode conter valores e regras: o prompt orienta o modelo a pesquisar somente nomenclaturas de atendimentos e especialidades, sem incluir profissionais, clínica, valores ou horários nas consultas web. Essa restrição das consultas é uma instrução ao modelo, não um filtro executado sobre cada consulta da ferramenta hospedada. Exige admin/gestor da clínica no servidor, inclusive após a geração; tem prazo, limites de conteúdo e proteção local contra chamadas concorrentes. O provedor deve aplicar seus limites globais.

## Pesquisa web na geração

O botão solicita `web_search` pela Responses API, com `tool_choice: required` e `include: ["web_search_call.action.sources"]`, sem definir `max_tool_calls` ou rejeitar resultados pela quantidade de chamadas. O prompt orienta concluir com evidências suficientes, evitando buscas repetidas sem ganho de informação. Mantém Astra, limite de 6.000 tokens de saída/raciocínio e 120 segundos; limites próprios do provedor continuam aplicáveis. Mais buscas podem aumentar custo e duração. Cadastro já com 50 variações não inicia uma chamada cobrada. Não há busca web nas conversas ou alteração do Gemini.

O servidor só entrega a prévia quando a resposta completa contém uma busca executada e fontes HTTP(S) retornadas pela ferramenta ou por suas anotações de citação. Texto do modelo afirmando que pesquisou não comprova execução. Se o gateway recusar a ferramenta, omitir a execução, omitir as fontes ou devolver uma resposta incompleta, a tela mostra erro e preserva o dicionário. Não há repetição automática da pesquisa nem troca de modelo.

O prompt e as descrições do esquema informam os limites: 50 variações, termos de 2 a 160 caracteres, explicações e dúvidas de 1 a 350 caracteres, 20 dúvidas e 5 fontes por sugestão. A validação local continua obrigatória. Não se adicionam palavras-chave de JSON Schema sem suporte confirmado no gateway.

Se a única divergência forem explicações ou dúvidas longas, o servidor faz no máximo uma chamada adicional ao mesmo Astra, sem ferramentas, enviando somente IDs e os textos a reformular. Não envia nem permite substituir termos, categorias ou fontes. Essa chamada pode consumir créditos de IA, compartilha o prazo total de 120 segundos e não repete a pesquisa. IDs ausentes, repetidos ou desconhecidos invalidam a reformulação inteira.

Os textos originais completos ficam visíveis na prévia, inclusive quando a reformulação funciona: a revisão humana deve conferir se as ressalvas foram preservadas. Se ela falhar, exceder o prazo ou continuar longa, a prévia mantém as sugestões e os textos completos, com aviso em português; não corta texto nem faz uma terceira chamada. Outros erros de estrutura são apresentados em português, sem expor o erro bruto do validador. Nada é salvo ou publicado automaticamente.

Cada sugestão indica origem `web` ou `linguistica`. URLs de sugestões web são cruzadas com as fontes retornadas pelo provedor. Sugestões web, siglas e sinônimos sem referência rastreável saem da lista selecionável e entram nas dúvidas. Isso prova que o link foi retornado, não que o conteúdo confirma equivalência clínica: a equipe ainda deve revisar. Hipóteses de digitação são identificadas como hipóteses e não recebem fonte inventada. A tela mostra a contagem das cinco categorias, links por sugestão, fontes gerais e chamadas realizadas.

As referências e explicações ficam na prévia de geração. A persistência continua exclusivamente em `estrutura.aliases` (termos selecionados); não foi criada tabela de fontes, auditoria adicional nem migration. Os registros de chamadas do provedor podem complementar a inspeção da execução.

Documentação de referência: https://developers.openai.com/api/docs/guides/tools-web-search e https://developers.openai.com/api/reference/resources/responses/methods/create. O suporte específico à ferramenta no gateway Lovable precisa ser comprovado por chamada real; testes simulados não o comprovam.

As sugestões ficam separadas em uma prévia, com explicação e seleção individual. Nenhuma vem selecionada. O operador acrescenta as escolhidas ao formulário e usa o fluxo existente de rascunho/publicação. As variações antigas são preservadas; duplicatas de acento/caixa/espaços são removidas ao adicionar sugestões. Não há truncamento silencioso acima de 50 entradas por cadastro.

Persistência: reutiliza `estrutura.aliases`, já existente nos dois catálogos. Sem migration, novos vínculos ou mudança de políticas. Cards permitem expandir o dicionário, e a pesquisa editorial inclui essas variações. Não confundir o campo publicado com alterações ainda em rascunho.

## Limites de equivalência

A instrução do gerador separa consultas de exames e preserva região, modalidade, lateralidade, contraste e outros qualificadores. Para um grupo geral de ultrassonografia, US/USG podem identificar o grupo; para um item específico, devem preservar seus complementos. Com abrangência ausente, mantém o nível de detalhe do nome, sem inventar regiões/serviços para nomes genéricos. Contradições entre nome, descrição e abrangência geram dúvidas, sem ampliar automaticamente o cadastro. Expressões vagas fora dessa abrangência continuam como dúvidas. O modelo deve explorar todas as cinco categorias sem preencher uma quantidade artificial. Isso é uma orientação ao modelo, não uma prova automática de equivalência clínica: a revisão humana continua necessária. Uma especialidade também pode pertencer a vários médicos.

O recuperador compartilhado já suporta aliases publicados e preserva ambiguidade entre registros. Uma variação não autoriza preço, disponibilidade, escolha de profissional ou agendamento.

## Dependência pendente: consulta da Maria

O atendimento atual lê `fonte-operacional.server` por `catalogo-turno.server`, e não os catálogos editoriais restaurados. Portanto, este gerador **não ativa o dicionário nas respostas reais ou na homologação**. Ambos continuam no mesmo caminho compartilhado.

A ativação depende da sincronização aprovada ClínicaOS → base estruturada → Maria. O plano estrutural dessa integração continua pendente. Ao implementá-lo, as variações revisadas precisam ser preservadas como conteúdo editorial associado ao identificador de origem, sem serem zeradas pelo sincronizador e sem transportar preços/regras da base antiga. Revisar as variações se o significado do cadastro mudar.

## Validação e implantação

Testes cobrem autorização, isolamento por clínica, geração sem escrita, preservação/deduplicação, limites, saída interrompida, recusa, falha do provedor, cancelamento, concorrência, execução web obrigatória, siglas com fonte, URLs inventadas/perigosas, ausência de fontes, excesso de chamadas e ferramenta não suportada. Testes de transporte usam respostas simuladas e não comprovam a qualidade do modelo real.

A chave do gateway não está disponível no ambiente local desta implementação. Disponibilidade de Astra, qualidade das sugestões e apresentação no Lovable devem ser conferidas no ambiente publicado. O botão apresenta falha explícita, preservando o conteúdo atual, se o modelo não estiver liberado.

Impacto financeiro: cobrança apenas ao gerar sugestões, conforme o gateway. Nenhuma chamada de IA por mensagem de paciente foi adicionada. Impacto operacional esperado: menos preenchimento manual, mantendo a revisão. Sem alteração em preços, agenda, prontuário ou regras de atendimento. Reversão: reverter o commit da interface/gerador; as variações já salvas continuam no campo existente.
