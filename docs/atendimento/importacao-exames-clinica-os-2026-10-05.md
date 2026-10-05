# Importação de exames e procedimentos — 05/10/2026

Pedido: copiar todos os exames e procedimentos do Clínica OS para os campos
correspondentes da Base de conhecimentos; informação ausente permanece vazia.

## Resultado confirmado no banco

| Clínica | Antes | Depois | Publicados | Rascunhos | Arquivados |
| --- | ---: | ---: | ---: | ---: | ---: |
| Policlínica Menino Jesus | 1.070 | 4.614 | 2.705 | 1.902 | 7 |
| Policlínica São Francisco de Paula | 0 | 2.425 | 2.425 | 0 | 0 |
| Clínica Consulta Hoje | 0 | 0 | 0 | 0 | 0 |

Foram analisados 7.032 procedimentos que não são consultas: 6.369 exames,
651 procedimentos, 10 fisioterapias e 2 outros. Todos têm correspondência na base.
Criados 5.969 registros e atualizados 1.056. Sete correspondências arquivadas foram
preservadas sem escrita; sete registros antigos de categorias, sem vínculo de
procedimento, também foram preservados. Por isso o total final é 7.039.

## Adaptação

- Nome, tipo e grupo nos campos correspondentes. Seis nomes continham protocolos
  extensos: o cabeçalho explícito foi usado como título e o original integral ficou
  na descrição.
- Dinheiro, Pix, crédito, débito e cartões específicos conservam seus valores
  cadastrados. Preços por convênio ativo conservam o nome do convênio na condição.
  Foram analisadas 3.354 relações de preços por convênio, sem misturar clínicas.
- Oito registros com preço variável não oferecem valor fixo. Zero não é preço
  confirmado; referência sem modalidade fica identificada como referência.
- Preparo e restrições só são preenchidos quando informados. Não foi encontrado
  texto de preparo na origem desses 7.032 registros: os campos continuam vazios,
  sem afirmar que o preparo está dispensado.
- Observações, especialidades, sessões, ciclos e indicação de laudo entram na
  descrição. O tempo administrativo é identificado como tal, sem afirmar duração
  clínica. Ausência de exigência de pedido médico permanece “não informado”.
- Executantes ativos e visíveis mantêm horários e observações correspondentes.
  Procedimentos inativos ficam em rascunho.

## Execução e verificação

A prévia completa da interface ficou lenta com milhares de itens. A importação
autorizada foi aplicada pelo editor SQL do próprio Lovable, sem migração de
estrutura. Antes da escrita, os 7.025 registros aplicáveis foram validados pelo
`servicoSchema` e comparados ao adaptador TypeScript. As únicas diferenças da
prévia eram a ordem de horários empatados; o SQL recebeu desempate por ID.

Uma única instrução atômica releu a origem e exigiu a assinatura da prévia
`5f785328f17c5eb39d78fd0bf26fc397`. Atualizações compararam ID, clínica e versão;
inserções usaram IDs determinísticos. Criador/data de criação e arquivos existentes
foram preservados. O trigger normal registrou 5.969 INSERT e 1.056 UPDATE, com
origem de manutenção `codex:importacao-exames-20261005`, sem atribuir a execução a
um usuário humano.

A leitura posterior confirmou zero origens sem destino e zero divergências de
campos nos registros aplicáveis. A auditoria confirmou todas as 7.025 escritas.
Os dados foram efetivamente gravados; isso independe da publicação do código.

O código ajusta a importação completa e a sincronização individual de serviços
para usar a mesma adaptação. Não modifica prompt, Jev, fonte selecionada da Nina,
agenda, WhatsApp, cadastros de origem nem dados financeiros de atendimentos.
A fonte selecionada observada permanece Clínica OS; não houve troca automática
para Base de conhecimentos. Não foi validado atendimento com modelo real.

Validação de código: testes de importação, sincronização, estrutura e fonte
operacional; checagem TypeScript, build e revisão do diff. A implantação desse
novo código no Lovable deve ser confirmada separadamente do push ao GitHub.
