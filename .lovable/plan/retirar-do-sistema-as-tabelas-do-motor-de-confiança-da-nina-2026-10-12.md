# Retirar do sistema as tabelas do motor de confiança da Nina

Objetivo: deixar o sistema sem nenhuma leitura ou gravação em `nina_confianca_decisoes`, `nina_confianca_vinculos`, `nina_confianca_propostas` e nas 7 colunas `confianca_*` de `nina_teste_execucao_itens`. Depois disso, o SQL de exclusão pode rodar sem quebrar nada.

Este passo não mexe no banco. O SQL de exclusão continua sendo um passo separado, que depende de autorização e da cópia de segurança.

## O que continua igual
- O atendimento da Nina no WhatsApp e na homologação. O envio já não grava nesse motor desde 24/09.
- Os detalhes técnicos das mensagens, menos a parte de confiança, que já está oculta.
- Os cenários de teste, que deixam só de calcular e gravar a média de confiança.

## O que muda (vale para todas as clínicas)
1. **Detalhes técnicos e saída das mensagens** (`detalhes-mensagem.server.ts`, `saida-mensagem.server.ts`): param de consultar os vínculos. O estado da entrega passa a vir só da mensagem e dos avisos de encaminhamento.
2. **Cenários de teste** (`cenarios.functions.ts`): param de ler as decisões e de gravar as colunas `confianca_*`.
3. **Métricas do analista** (`analista-metricas.functions.ts`): a métrica de confiança é retirada; as outras métricas continuam.
4. **Telas do motor desativado**: são removidas, com as funções do servidor que elas chamam.
   - Telas: `ConfiancaRespostas`, `ConfiancaMensagem`, `ConfiabilidadeDecisao`, `MetricasConfiabilidade` e `CalibracaoConfianca`.
   - Servidor: `confianca.functions.ts`, `confidence-engine.server.ts` e `politica-override.server.ts`.
   - Também saem os pontos de menu e as abas que abrem essas telas.
5. **Testes**: os testes que simulam essas tabelas são ajustados ou removidos. Isso inclui o teste SQL de retenção.

## Riscos
- Se alguma equipe ainda abre as telas de calibração ou métricas de confiança, elas deixam de existir. Os dados já estavam congelados desde 16/09.
- Esta é uma área crítica (a Nina). Por isso, a mudança é só de retirada, sem lógica nova.

## Validação
- Busca no código sem nenhuma menção às tabelas e colunas (fora o arquivo gerado de tipos).
- `bunx tsgo --noEmit -p tsconfig.json` e a suíte da Nina com `bun test`.
- Abrir na homologação os detalhes técnicos de uma mensagem e rodar um cenário de teste.

## Depois (fora deste passo)
1. Publicar, com a sua autorização.
2. Fazer a cópia de segurança das 3 tabelas.
3. Trocar a permissão de mudanças incompatíveis no banco.
4. Rodar o SQL enviado.

Rollback: restaurar os arquivos e publicar de novo. O banco não é tocado.
