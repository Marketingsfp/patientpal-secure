# Equipe do painel de TV: perfil de telefonia

Antes, o painel incluía membros ativos online/em pausa ou com conversa
atribuída, independentemente do perfil. Isso fazia administradores aparecerem
na equipe e na contagem de online.

Agora, a equipe inclui somente vínculos ativos com `role=telefonia` na clínica
consultada. Administradores ficam excluídos mesmo quando também possuem um
vínculo de telefonia. O filtro vale tanto para a presença quanto para conversas
atribuídas anteriormente. A contagem de online/em pausa usa a mesma equipe
retornada e não inclui os usuários excluídos.

A definição de telefonia corresponde à função existente
`atend_tem_perfil_telefonia`: vínculo ativo com esse perfil. O painel não filtra
por elegibilidade para receber conversas, pois uma atendente em pausa também
precisa aparecer. A equipe mostra somente os estados `ONLINE`, `PAUSA` e
`PAUSA_SAIDA` (almoço). Usuários offline ou sem presença ficam ocultos, mesmo
com conversas atribuídas. Essas conversas e seus resultados permanecem nas
contagens gerais do painel. O mesmo filtro se aplica à demonstração.

A alteração é somente de leitura. Não muda perfis, presença, atribuições,
auditoria, autores de encerramento ou as métricas gerais das conversas da
clínica. Não exige migration.

Validação: `bun test src/lib/atendimento/__tests__/painel-tv-telefonia.test.ts`
verifica exclusão de outros perfis, vínculo duplo de administrador e o retorno
completo do painel com banco simulado, incluindo presença, pausa, vínculo
inativo, almoço, offline explícito e atribuição sem presença. Confere também
que esperas e resoluções de pessoas offline não desaparecem dos totais.
Verificação de tipos com `tsc --noEmit`.

Validação visual com Playwright e transportes simulados: offline fica oculto
na demonstração e após sair de online; pausa e almoço permanecem. Com todos
offline, a equipe fica vazia sem apagar a fila. Ao voltar ao online, a pessoa
reaparece. Conferidas as resoluções 1920 × 1080 e 1366 × 768, sem erros de
JavaScript ou acesso ao banco. Lint do escopo sem erros e tipos aprovados.

Após publicar no Lovable, conferir o painel com uma pessoa de telefonia online,
outra em pausa e um administrador online. Publicação e dados reais precisam
ser verificados separadamente dos testes locais. Reversão por revert do commit.
