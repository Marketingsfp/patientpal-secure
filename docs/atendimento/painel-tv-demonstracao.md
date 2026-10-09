# Demonstração do painel da TV do OS Zap

Antes, o painel exibia somente dados reais e podia ficar vazio durante a
apresentação à equipe. Registros operacionais marcados como teste continuam
excluídos das métricas reais.

Agora, o botão **Demonstração** abre o mesmo painel com dados fictícios gerados
somente em memória: 13 conversas aguardando, seis atendentes (online, em pausa,
no almoço e offline), volume por hora e contagens de respostas e resoluções.
O cenário inclui as três faixas de espera existentes. Os tempos avançam com o
relógio, como no painel real; abrir novamente a demonstração reinicia o cenário.

A indicação **Demonstração · dados fictícios** permanece no cabeçalho. O botão
**Voltar aos dados reais** retoma as consultas e a atualização em tempo real.

- Painel autenticado: `/app/painel-tv-atendimento?demonstracao=true`.
- Prévia local: `/dev/painel-tv`, indisponível em produção.

A demonstração desmonta o componente que consulta o painel real e fecha sua
assinatura de atualizações. Não grava registros, não envia mensagens, não muda
presenças e não altera permissões. O acesso autenticado segue as regras já
existentes; a prévia local contém apenas dados fictícios. As duas versões usam
o mesmo componente visual, sem uma cópia do layout.

Validação local: testes existentes do painel de telefonia, lint do escopo e
Playwright com a rota real e transportes simulados. Conferidas as resoluções
1920 × 1080 e 1366 × 768, a identificação de dados fictícios, a troca entre
modos, o encerramento da assinatura e a ausência de consultas na demonstração.
O teste não acessa o banco nem representa uma validação de dados de produção.

Também passaram a checagem completa de tipos, o build de produção e a abertura
da prévia no aplicativo completo sem erros de JavaScript ou chamadas ao
Supabase. O lint do escopo ficou sem erros; conserva o aviso preexistente de
tipagem da assinatura de atualizações. As alterações estão na `main` local;
publicação do aplicativo deve ser conferida separadamente do envio ao Git.
