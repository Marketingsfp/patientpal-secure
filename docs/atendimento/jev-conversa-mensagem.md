# Conversa e texto nas decisões do Jev

Escopo: visualização e auditoria do atendimento OS ZAP/Nina. Base consultada:
`7c7474ad354ed825024bddc501da0f1d3d9af788` (origin/main em 04/10/2026).

## Antes e depois

A tabela não selecionava `conversation_id`. As principais fases guardavam apenas
as chaves das perguntas e os resultados, sem o texto analisado.

A tela agora exibe o número `#numero_conversa`, quando a conversa está acessível,
e permite expandir seu ID completo. Uma consulta em lote à `atend_conversas`,
com a sessão do usuário, RLS e filtro da clínica, recupera os números. Referências
legadas que não são UUID não entram nessa consulta, mas continuam visíveis.

As novas decisões salvam uma cópia do texto do próprio turno no JSON `perguntas`,
em `_texto_analisado`. Não há migration nem atualização dos registros antigos.

- Intenção e transferência: mensagem do paciente, incluindo os IDs de entrada
  disponíveis quando várias mensagens foram agrupadas.
- Especialidade: mensagem usada pela busca ou, se ausente, termo pesquisado.
- Conferência: resposta candidata da Nina, antes de qualquer correção/envio.
- Escolha: mensagem do paciente interpretada nesta chamada.
- Motivo da transferência: texto do motivo, identificado como tal.
- Cadastro e avaliação global: continuam sem mensagem individual; são consultas
  estruturadas/dossiês, não uma mensagem única.

O texto é limitado a 6.000 caracteres apenas na cópia de auditoria; a tela avisa
quando o registro é parcial. Isso não altera o texto enviado ao modelo. Dados
antigos da fase de especialidade podem mostrar o termo já registrado. Quando
não existe texto, a tela informa a ausência: não busca a última mensagem nem
faz correlação aproximada por horário.

## Impacto e validação

As regras, pontuações, perguntas ao modelo, limites e decisões permanecem iguais.
Não há novas chamadas de IA ou efeitos financeiros. O ganho operacional é
identificar o atendimento e o texto sem procurar manualmente entre conversas.
O risco principal é atribuir um texto à decisão errada: a cópia vem diretamente
do chamador, e leituras atrasadas da tela são descartadas ao trocar clínica/filtro.
A persistência é compartilhada pelo atendimento real e homologação.

- 36 testes automatizados: auditoria (incluindo execução da função real de
  persistência com transporte simulado), intenção, transferência, conferência
  e escolha.
- `scripts/check-jev-auditoria.mjs`: página React real com dados simulados;
  número/UUID, expansão de texto, histórico sem texto, corte explícito,
  consulta única por clínica, texto escapado e largura de celular.
- TypeScript e build verificados localmente. Testes não enviam WhatsApp e
  não chamam modelos reais.

Pendente: confirmar a revisão publicada no Lovable e gerar decisões novas em
ambos os ambientes para conferir a persistência com o banco implantado. Enviar
código ao GitHub, isoladamente, não comprova essa publicação.
