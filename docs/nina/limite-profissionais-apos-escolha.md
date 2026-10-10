# Limite de profissionais após a escolha

Correção de regra existente, solicitada em 10/10/2026 após a sessão 928,
ciclo cb3916be, protocolo MJ-869. A imagem mostra encaminhamento por nove
profissionais depois de “oi boa tarde quero marcar cardiologia, vcs fazem?”.

O código acionava o limite na leitura de `consultar_cadastro` somente pela
quantidade, antes de devolver os fatos ao modelo. Isso interrompia a regra
já existente de perguntar pela primeira vaga ou pela escolha de profissional.

## Comportamento

- Existência/agendamento genérico: confirmar que há Cardiologia e perguntar
  “Você prefere o primeiro horário disponível ou deseja escolher entre os profissionais?”.
- Primeira vaga: comparar todas as agendas elegíveis do atendimento, mesmo
  acima de oito, apresentar somente a opção mais próxima e continuar com
  seu profissional, respeitando filtros, modalidade, cadastro e aceite final.
- Ver/escolher a lista: até oito, apresentar; acima de oito, encaminhar para
  a equipe apresentar as opções. Pedido explícito de lista dispensa a pergunta inicial.
- Médico já escolhido: preservar sua escolha; quantidade total não encaminha.

O objetivo existente `medicos` representa a apresentação solicitada pelo
paciente, interpretada pelo modelo com a mensagem inteira e o histórico.
Consulta interna para comparar a primeira vaga usa `agendamento`/`horarios`.
Não há classificador novo por palavras-chave nem chamada extra de IA.
Sem objetivo válido de lista, o código não atribui essa intenção ao paciente.
Prompt de referência, contrato obrigatório efetivo e descrição da ferramenta
orientam a mesma sequência em WhatsApp e homologação, para todas as clínicas.

## Validação e limites

Testes locais usam o núcleo e executor reais com catálogo, banco, agenda e
modelo simulados. Cobrem a pergunta inicial, resposta contextual pela primeira
vaga, primeira vaga solicitada já na mensagem inicial, lista acima de oito,
limite exato de oito, médico definido, ausência de
objetivo e exceções existentes. O executor compara nove médicos e encontra
a primeira vaga do nono publicado, permite selecionar essa vaga e conserva
a necessidade de aceite final, sem gravar agendamento.

Validação local concluída: 47 testes nas seis suítes direcionadas, incluindo
o processo isolado com 311 testes do executor; zero falhas. Tipos passaram,
lint dos arquivos alterados ficou sem erros (há avisos preexistentes de
`any` nos módulos compartilhados) e `git diff --check` passou. Playwright
conferiu pergunta inicial, primeira vaga com nove, encaminhamento da lista
com nove e apresentação com oito, além de mobile sem rolagem horizontal,
zero erros de JavaScript e nenhuma requisição externa.

Não foram alterados cadastros, reservas, preços, permissões, histórico,
auditoria antiga ou versões de prompt publicadas no banco. O encaminhamento
SFP e demais restrições do catálogo conservam sua prioridade. A prévia local
em `output/nina-limite-profissionais-previa.html` usa a decisão pura real para
ilustrar os dois caminhos; seus diálogos são exemplos, não respostas do Gemini.

Após publicação, falta verificar a interpretação do Gemini real na homologação
com as duas escolhas e uma solicitação inicial já pedindo o primeiro disponível.
Rollback: reverter o commit da correção, sem operação no banco.
