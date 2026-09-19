# Prompts pessoais para simulações com Sol e Luna

Solicitação de 19/09/2026: guardar os comandos escritos em “Planejar com Sol”
para selecionar e reutilizar em outras simulações sem redigitar.

## Uso

1. Escrever o pedido e clicar em “Gerar cenários com Sol”.
2. O servidor valida o usuário, a clínica e o texto, salva o prompt e pede o plano à IA.
3. Na próxima simulação, abrir “Meus prompts”, buscar pelo texto se necessário
   e clicar em “Usar prompt”. O texto completo volta ao campo e pode ser editado.
4. Gerar novamente continua sendo uma ação explícita. Selecionar um pedido não
   chama Sol/Luna, não cria uma carga e não envia mensagens.

A lista é pessoal por usuário e clínica, persiste no banco, não expira por
fechar o navegador e não exclui os pedidos antigos. Os mais recentemente usados
aparecem primeiro; busca e paginação permitem localizar os demais. Repetir o
mesmo texto reutiliza seu registro, mantendo a data de criação. Alterar o texto
gera outra opção, conservando a anterior.

O histórico começa nas novas solicitações ao Sol. Pedidos anteriores que
existiam somente no rascunho em memória não são reconstruídos.

## Persistência e segurança

Migração `20260919180000_nina_prompts_simulacao.sql`, tabela `nina_carga_prompts`.
RLS exige tanto o próprio `user_id` quanto vínculo ativo com a clínica. O usuário
vem da sessão autenticada no servidor, nunca da entrada enviada pelo cliente.
O índice único por clínica/usuário/hash evita duplicação e permite textos até
6.000 caracteres sem indexar o texto integral. O hash serve apenas à deduplicação.

Se salvar falhar, a geração não é cobrada/iniciada e o rascunho permanece.
Se o provedor falhar depois do salvamento, o prompt já está guardado para
reutilização. As respostas da listagem são descartadas ao fechar, mudar a busca,
mudar a clínica ou trocar de usuário; rascunhos locais também são separados por usuário.

A migração é aditiva e idempotente; não altera agenda, financeiro, pacientes,
mensagens ou simulações anteriores. Foi aplicada pelo SQL editor do Lovable.
Não foi alterado manualmente o histórico de migrations. Publicação do aplicativo
é necessária para disponibilizar o botão e o salvamento automático.
Reversão funcional: reverter a integração da tela/planejador, preservando a
tabela e seus prompts; nenhuma exclusão de histórico é necessária.

## Validação

- 34 testes do planejador e da UI passaram, incluindo montagem React real,
  seleção de prompt com quebra de linha, reabertura, isolamento do rascunho
  entre usuários e ausência de chamadas à IA ao escolher um texto salvo.
- Falhas de autorização, validação, salvamento e provedor exercitadas em testes.
- PostgreSQL temporário: persistência, deduplicação, limite de tamanho, ordenação,
  busca, permissões por usuário/clínica, revogação de vínculo, bloqueio anônimo,
  proteção da data de criação e reexecução da migração passaram.
- Verificação de tipos e ESLint dos arquivos alterados passaram.
- Nenhuma simulação de paciente real ou chamada paga à IA foi criada para testar.

```text
bun test src/lib/nina/carga-planejamento.test.ts src/components/nina/carga-teste-ui.test.ts src/components/nina/carga-teste-montagem.test.ts
bun run typecheck
node scripts/test-nina-prompts-sql.mjs <caminho-do-pglite/dist/index.js>
```
