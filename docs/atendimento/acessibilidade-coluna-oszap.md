# Acessibilidade em coluna no OS ZAP

Antes, o botão abria um Sheet modal preso à direita da janela, com fundo
escuro e conteúdo sobre o atendimento. Agora, no OS ZAP, o painel ocupa uma
terceira coluna do layout, à direita. O chat e Contatos recebem a largura
restante; ao fechar, recuperam o espaço. A conversa e o rascunho não são
desmontados durante essa mudança.

Os controles continuam usando o mesmo provider e as mesmas preferências do
usuário. A reformulação posterior dos controles do OS ZAP está descrita em
[reformulacao-acessibilidade-oszap.md](reformulacao-acessibilidade-oszap.md).
A gaveta existente dos demais portais conserva seu conteúdo anterior.

Ao abrir a coluna, o foco vai para Fechar acessibilidade. O botão e Escape
quando o foco está no painel fecham a coluna e devolvem o foco ao botão de
abertura. O painel não bloqueia o uso do chat no computador. No celular, o
conteúdo atrás da coluna fica fora da navegação por teclado, e a barra inferior
não cobre as configurações. Abrir o menu lateral fecha a acessibilidade no
celular; abrir a acessibilidade fecha o menu lateral.

## Validação

- TypeScript: `tsc --noEmit`.
- Preferências: `bun test src/lib/acessibilidade/__tests__/prefs.test.ts`.
- Navegador: `node scripts/check-acessibilidade-oszap.mjs` monta os componentes
  reais de layout, botão, painel e provider com autenticação/banco inertes.
  Nenhum paciente é acessado e requisições HTTP externas são bloqueadas.
  Verifica a separação geométrica de Contatos e painel, menu e painel abertos,
  rascunho, chat utilizável, foco, Escape, preferências, largura recuperada,
  celular sem overflow e a gaveta modal preservada nos demais portais.
- Prévia e capturas: `../oszap-design-preview/acessibilidade.html`,
  `acessibilidade-desktop.png` e `acessibilidade-mobile.png`.

Publicação no Lovable e validação com sessão real devem ser conferidas depois
da sincronização. Não exige migration; reversão por revert do commit.
