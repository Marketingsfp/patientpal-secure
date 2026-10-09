# Visual do OS ZAP — revisão local

Base: origin/main `563dba3fd` (03/10/2026). Pedido: melhorar a leitura do atendimento, pendências e urgências, exclusivamente no OS ZAP.

## Antes e depois

- Lista recolhida por padrão → aberta para quem ainda não salvou preferência; mantém a opção de desafixar.
- Nomes e prévias pequenos → nomes maiores, prévias em duas linhas e seleção mais evidente.
- Responsável destacado como alerta → identificação neutra; cores de atenção reservadas às pendências.
- Espera indicada apenas pelo tempo → texto “Espera” / “Espera crítica”, usando as faixas existentes.
- Mensagens com fundo forte → fundo suave, mais espaço e texto de 15px com maior entrelinha.
- Central de Atenção estreita → painel mais amplo, categorias e contatos mais legíveis.
- Colunas comprimidas em telas pequenas → alternância entre fila e conversa, com retorno explícito.
- Campo de envio só com placeholder → rótulo, nome acessível no botão e indicação dos atalhos existentes.

O tema é condicionado a `data-os-zap="true"` no shell. Outros módulos não recebem essa identidade visual. Menus renderizados em portal conservam o tema compartilhado; a Central de Atenção recebe apenas espaçamento próprio. Nenhuma função de atendimento, regra de confiança, envio, fila ou permissão foi alterada.

## Validação

- `node --max-old-space-size=8192 node_modules/typescript/bin/tsc --noEmit`: passou após instalação das dependências fixadas em `bun.lock`; lock não alterado.
- 34 testes existentes passaram: filtros-atendente, filtros-inbox e responsabilidade-espera-fase3.
- Prévia local: desktop 1600×960, notebook 1366×768, celular 390×844, tema claro/escuro, retorno à lista e painel de atenção. Sem rolagem horizontal nem erros JavaScript.
- Sintaxe TSX dos componentes editados conferida após remover formatação não relacionada.

## Prévia reproduzível

Executar na raiz do repositório:

```
node scripts/build-preview-oszap.mjs
node scripts/check-preview-oszap.mjs
```

Saída em `../oszap-design-preview/index.html` e capturas PNG. A prévia usa os componentes reais de filtros, espera, botões e cartões e o CSS do sistema; o layout envolvente é uma representação com dados fictícios. Não acessa APIs, banco ou WhatsApp. Os botões de envio e transferência da prévia não executam operações.

## Limites e revisão

Não equivale a teste de ponta a ponta da aplicação autenticada. Conferir visualmente no sistema com perfis de atendente e gestão, preferência de painel previamente salva, histórico longo, mídia e recursos de acessibilidade antes da publicação. Não foram publicados frontend nem backend. Nenhuma alteração no comportamento da Nina foi realizada por este trabalho.

A reversão é apenas de código: remover este conjunto de mudanças visuais, preservando alterações posteriores. Não há migração, exclusão ou transformação de dados.

## Ajuste de densidade solicitado por JEAN em 03/10/2026

Removidos o título da lista, subtítulo, ícone decorativo e faixa de contagem/espera. Cards com menor padding e prévia em uma linha. Filtros de atendente em uma linha. Compositor reduzido a campo de mensagem (34px) e botão de envio, com nome acessível; respostas rápidas continuam disponíveis pelo comando `/`. Verificação de sintaxe TSX e prévia nos três tamanhos passaram, sem erros JavaScript ou rolagem horizontal. Esta validação visual usa dados fictícios.
