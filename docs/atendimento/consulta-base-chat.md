# Consulta à base dentro do chat — OS ZAP

## Uso

No cabeçalho da conversa, **Consultar base** abre um painel integrado, sem sair do
chat. Procure pelo nome do procedimento, profissional ou especialidade. Expanda
**Ver informações e fonte** e clique em **Inserir no rascunho**. O texto é acrescentado
ao que já estava digitado, com fonte e data da consulta; nada é enviado automaticamente.

A fonte vigente na main é `lerFonteOperacional`: o cadastro oficial convertido para
atendimento, compartilhado com a Nina. As tabelas editoriais antigas foram removidas;
a interface não inventa status de publicação ou versão editorial. A leitura respeita
as regras, a habilitação por clínica e o cache de até 60 segundos já existentes nessa
fonte. Não lê outra base nem modifica médicos, preços, horários ou procedimentos.

## Regras

- Autenticação e `assertAcessoConversa` antes da leitura; clínica e conversa obrigatórias.
- Preço e condição de pagamento preservados por linha, sem transformar Cartão em Pix
  no apresentador desta ferramenta. Os dados partem do conversor operacional existente.
- Somente os campos públicos necessários; notas internas e instruções do modelo não
  entram nos resultados nem no rascunho.
- Falta de informação aparece como **Não informado na fonte** na consulta e não vira
  preço zero, dispensa de preparo ou negativa de atendimento.
- Horário habitual e recorrência são preservados; não confirma disponibilidade ou vaga.
- Busca por candidatos com as regras existentes de aliases/qualificadores, sem escolher
  automaticamente o procedimento. Registros semelhantes continuam separados.
- Paginação de 20 resultados, informando o total.
- Antes de inserir, consulta novamente o registro pelo ID/tipo na fonte vigente (sujeita
  ao mesmo cache declarado). Registro removido, falha ou acesso negado não altera o rascunho.
- Bloqueios de resposta são mantidos, inclusive se a permissão mudar durante a requisição.
- Troca de conversa/clínica desmonta a consulta. Respostas antigas são ignoradas e a Inbox
  ainda confere o destino antes de escrever. O rascunho anterior não é sobrescrito.
- A consulta pode ser usada somente para leitura quando o envio está bloqueado.
- Escape fecha o painel; teclado dentro dele não aciona atalhos do chat.
- O mesmo componente atende a Inbox e a Central de conversas. Nenhuma regra de resposta
  da Nina, transporte WhatsApp, esquema de banco ou permissão geral foi alterada.

## Validação

`src/lib/atendimento/__tests__/consulta-base-chat.test.ts`: conteúdo público, preços por
condição, formas distintas, preparo ausente, horários/recorrência/avisos vigentes,
busca, paginação, acesso negado antes da fonte, revalidação e preservação do rascunho.

`scripts/check-consulta-base-chat.mjs`: componente real com fonte simulada; busca,
inserção sem envio, rascunho existente, resposta atrasada após troca de paciente,
bloqueio durante inserção, falha da fonte, Escape, temas claro/escuro e celular a 135%.
Gera prévia fictícia em `../oszap-design-preview/consulta-base-chat.html`.

TypeScript e build verificam a integração com a Inbox. Testes locais não equivalem a
uma consulta autenticada no Lovable publicado. Após publicação, conferir com telefonia
uma conversa autorizada, buscar um procedimento conhecido e revisar o texto no rascunho.
Nenhuma mensagem real foi enviada para validar a ferramenta.

Reversão por revert do commit; não há migração ou dado histórico a desfazer.
