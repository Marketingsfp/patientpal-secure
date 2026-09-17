# Atendimento não encontrado no catálogo

## Regra solicitada

Quando uma consulta, especialidade, exame ou procedimento solicitado não for
encontrado na base publicada, a Nina deve encaminhar a conversa para a equipe.
Ausência no catálogo não autoriza afirmar que a clínica não oferece o serviço.

## Mudanças

- O fallback de instruções deixou de mandar negar a oferta da especialidade.
- O retorno `not_found` orienta encaminhamento obrigatório. O fluxo compartilhado
  aplica a regra após a pesquisa automática de um pedido identificado e após as
  ferramentas de busca do modelo. Ausências tipadas de médicos/procedimentos e
  catálogo vazio de especialidades também acionam o encaminhamento.
- A leitura preventiva de nome, CPF, saudação ou pedido genérico ainda sem item
  não comprova ausência de atendimento. O modelo continua responsável por
  interpretar o pedido e pesquisar cada item, inclusive em pedidos compostos.
- A busca desconsidera palavras de conversa como “gostaria” e “consulta” quando
  existem termos específicos, evitando recuperar outro serviço apenas pelo
  termo genérico e preservando o item ao final de uma frase longa.
- O encerramento dessa geração usa o fluxo existente de transferência,
  interrompe ferramentas posteriores do mesmo lote e respeita a revisão da
  conversa. Falha no encaminhamento não é comunicada como sucesso.
- O motivo é registrado como `CATALOGO_SEM_REGISTRO`. Quando não há chamada ao
  modelo, a auditoria fica no resumo do turno, sem inventar uma execução de LLM.
- Na homologação, o fluxo existente registra a simulação e a mensagem informa
  que nenhuma atendente real recebeu a conversa. Não reativa o motor de confiança.

## Prompt publicado

A versão **v27** foi publicada em **17/09/2026 às 15:54**, pelo editor de
Arquitetura, com alcance para todas as clínicas. A nova instrução FAT-04 é o
texto `REGRA_SEM_REGISTRO_PROMPT` de `src/lib/nina/catalogo-sem-registro.ts`.
O texto anterior da v26 foi preservado, acrescentando apenas essa regra antes
de CONV-04. O editor confirmou a versão publicada e o conteúdo salvo.

Não foi concatenada uma regra oculta à versão publicada. A mesma instrução
também integra o fallback do código.

## Validação

142 testes passaram, em grupos separados para isolar mocks:

- 56: regra de ausência, fluxo de geração real em produção/homologação com
  dependências simuladas e regressão das regras SFP/técnico.
- 15: recuperação do catálogo, incluindo pneumologista ausente, outros exames
  e procedimentos ausentes, serviço existente e termos genéricos.
- 71: contrato de catálogo, prompt, resposta direta, agenda sem vagas e regras
  administrativas anteriores.

`bun run typecheck` e `git diff --check` também passaram. O build completo
do aplicativo não foi revalidado nesta alteração.

Os testes cobrem falha de transferência, geração obsoleta, interrupção de
agendamento no mesmo lote, busca posterior do item ausente em um pedido misto,
preservação do atendimento para registros encontrados e ausência do motor.
Banco, modelo e transferências são simulados; não foi enviado WhatsApp nem
atribuída uma conversa real durante a validação. Não foi testada a aderência
do modelo real à v27 em uma conversa de paciente.

## Implantação

O prompt v27 já está publicado. O reforço no código permanece local até envio
ao GitHub/Lovable e publicação do aplicativo. Não há migração de banco.
