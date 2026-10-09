# Reformulação dos ajustes de acessibilidade do OS ZAP

## Antes e depois

O painel apresentava controles redundantes de tamanho e espaçamento, filtros
de cor na página inteira e um modo foco que reduzia o destaque da fila.
As cinco opções de som eram armazenadas, mas não tinham implementação de
alertas associada a elas. A fonte fixa das mensagens não acompanhava a escala
de texto escolhida.

Agora o OS ZAP tem três grupos recolhíveis: Leitura e tamanho, Conforto visual,
Teclado e envio. Dois perfis rápidos ajustam texto e espaço: Mais conversas
e Leitura confortável. Os perfis preservam o tema e as opções de envio.

| Ajuste                 | Comportamento                                                                                                 |
| ---------------------- | ------------------------------------------------------------------------------------------------------------- |
| Tamanho do texto       | 90%, 100%, 115% e 135%, incluindo as mensagens do chat                                                        |
| Espaço dos controles   | Compacto, Confortável e Amplo; consolida os controles antigos de tamanho/espaçamento                          |
| Espaço entre linhas    | Aumenta a altura das linhas das mensagens                                                                     |
| Modo escuro            | Mantido com descrição clara                                                                                   |
| Contraste reforçado    | Reforça texto e divisórias respeitando o tema                                                                 |
| Diferenciar avisos     | Paleta azul/laranja e borda dupla para espera crítica, com prévia                                             |
| Reduzir movimentos     | Mantido sem esconder avisos                                                                                   |
| Foco de teclado        | Destaca o controle alcançado com Tab                                                                          |
| Conversa selecionada   | Reforça o destaque da conversa aberta                                                                         |
| Enter envia            | Padrão existente; pode ser desativado para Enter quebrar a linha e Ctrl/Cmd+Enter enviar no campo de resposta |
| Atalhos de atendimento | Mantidos com explicação das ações disponíveis                                                                 |

Saíram do painel do OS ZAP as opções de som sem efeito, o modo foco que apagava
a fila, os filtros de cor globais e os controles redundantes. Preferências
antigas de modo foco/filtros não diminuem a visibilidade do atendimento.
A gaveta e os controles dos demais portais foram preservados.

O painel continua ocupando uma coluna à direita e empurrando Contatos/chat.
O cabeçalho e o botão de fechar ficam visíveis ao rolar. Escape com foco no
painel devolve o foco ao botão de abertura. A conversa e o rascunho continuam
montados. Restaurar exige confirmação e não apaga a conversa.

## Implementação e alcance

- `AjustesOsZap.tsx`: controles específicos do atendimento.
- `prefs.ts`: preferências adicionais em `oszap`, com padrões compatíveis com
  configurações antigas; armazenamento existente preservado.
- `AcessibilidadeProvider.tsx`: uma atualização em lote para cada perfil rápido,
  evitando gravar suas configurações parcialmente. A persistência usa o perfil
  existente e o cache local; não exige migration.
- `os-zap.css`: ajustes novos limitados à interface do OS ZAP.
- `AtendimentoExtraTabs.tsx` e `teclado-envio.ts`: o campo de resposta respeita a
  opção de Enter. O evento já tratado não chega ao atalho global, evitando
  envio duplicado. Composição de texto e seleção de resposta rápida não enviam.

Não há alterações no motor da Nina, prompt, agenda, filas ou prioridades.
Fonte, tema e densidade continuam sendo as preferências pessoais compartilhadas
que já existiam; a interface de configuração dos outros módulos não muda.

As escolhas de foco visível e de informação que não depende apenas de cor
seguem orientações da [W3C sobre foco](https://www.w3.org/WAI/WCAG22/Understanding/focus-appearance)
e [design acessível](https://www.w3.org/WAI/tips/designing/).
Isso não representa certificação completa de conformidade WCAG.

## Validação e pendências

- TypeScript completo: `tsc --noEmit`.
- 10 testes de preferências e envio por teclado: defaults antigos, validação,
  armazenamento local, classes, Enter/Ctrl/Cmd, quebra de linha e composição.
- `node scripts/check-acessibilidade-oszap.mjs`: componentes reais em Chrome,
  com autenticação/banco inertes e requisições externas bloqueadas. Verifica
  layout, Contatos, rascunho, fonte real da mensagem, perfis, envio único,
  paleta/borda crítica, tema/contraste, redução de movimentos, restauração,
  foco/Escape, celular a 135%/Amplo e gaveta anterior dos outros portais.
- Prévia em `../oszap-design-preview/acessibilidade.html` e capturas
  desktop, escuro e mobile geradas pelo mesmo script.

Os testes não usam pacientes nem WhatsApp real. Persistência em conta
autenticada, leitura com tecnologia assistiva e revisão efetivamente publicada
no Lovable ainda precisam de conferência no ambiente publicado.
Reversão por revert do commit; nenhuma alteração de dados operacionais.
