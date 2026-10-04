# Dicionário de formas de falar por cadastro

## Escopo entregue

Exames/procedimentos e consultas/profissionais têm um campo visível de variações e um botão de geração com `openai/gpt-6-astra`, usando Responses no gateway já utilizado pelo projeto. É independente do Opus que organiza os demais campos e do modelo de atendimento. Não há substituição automática de modelo caso Astra não esteja disponível no gateway.

A geração usa somente nome, descrição pública, especialidades e variações do formulário atual. Não envia conversas, pacientes, notas internas, preços ou credenciais para o navegador. Exige admin/gestor da clínica no servidor, inclusive após a geração; tem prazo, limites de conteúdo e proteção local contra chamadas concorrentes. O provedor deve aplicar seus limites globais.

As sugestões ficam separadas em uma prévia, com explicação e seleção individual. Nenhuma vem selecionada. O operador acrescenta as escolhidas ao formulário e usa o fluxo existente de rascunho/publicação. As variações antigas são preservadas; duplicatas de acento/caixa/espaços são removidas ao adicionar sugestões. Não há truncamento silencioso acima de 50 entradas por cadastro.

Persistência: reutiliza `estrutura.aliases`, já existente nos dois catálogos. Sem migration, novos vínculos ou mudança de políticas. Cards permitem expandir o dicionário, e a pesquisa editorial inclui essas variações. Não confundir o campo publicado com alterações ainda em rascunho.

## Limites de equivalência

A instrução do gerador separa consultas de exames e preserva região, modalidade, lateralidade, contraste e outros qualificadores. Expressões vagas devem aparecer como dúvidas. Isso é uma orientação ao modelo, não uma prova automática de equivalência clínica: a revisão humana continua necessária. Uma especialidade também pode pertencer a vários médicos.

O recuperador compartilhado já suporta aliases publicados e preserva ambiguidade entre registros. Uma variação não autoriza preço, disponibilidade, escolha de profissional ou agendamento.

## Dependência pendente: consulta da Maria

O atendimento atual lê `fonte-operacional.server` por `catalogo-turno.server`, e não os catálogos editoriais restaurados. Portanto, este gerador **não ativa o dicionário nas respostas reais ou na homologação**. Ambos continuam no mesmo caminho compartilhado.

A ativação depende da sincronização aprovada ClínicaOS → base estruturada → Maria. O plano estrutural dessa integração continua pendente. Ao implementá-lo, as variações revisadas precisam ser preservadas como conteúdo editorial associado ao identificador de origem, sem serem zeradas pelo sincronizador e sem transportar preços/regras da base antiga. Revisar as variações se o significado do cadastro mudar.

## Validação e implantação

Testes cobrem autorização, isolamento por clínica, geração sem escrita, preservação/deduplicação, limites, saída interrompida, recusa, falha do provedor, cancelamento e concorrência. Testes de transporte usam respostas simuladas e não comprovam a qualidade do modelo real.

A chave do gateway não está disponível no ambiente local desta implementação. Disponibilidade de Astra, qualidade das sugestões e apresentação no Lovable devem ser conferidas no ambiente publicado. O botão apresenta falha explícita, preservando o conteúdo atual, se o modelo não estiver liberado.

Impacto financeiro: cobrança apenas ao gerar sugestões, conforme o gateway. Nenhuma chamada de IA por mensagem de paciente foi adicionada. Impacto operacional esperado: menos preenchimento manual, mantendo a revisão. Sem alteração em preços, agenda, prontuário ou regras de atendimento. Reversão: reverter o commit da interface/gerador; as variações já salvas continuam no campo existente.
