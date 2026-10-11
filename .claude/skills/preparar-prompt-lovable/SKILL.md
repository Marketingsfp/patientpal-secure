---
name: preparar-prompt-lovable
description: Transforma um pedido em um prompt estruturado e seguro para enviar ao agente de IA do Lovable — com contexto, restrições, critérios de aceite e o que não deve ser tocado.
---

# /preparar-prompt-lovable

Uso: `/preparar-prompt-lovable <o que você quer que o Lovable faça>`.

## O que esta skill faz

Este projeto pode ser editado de duas formas: diretamente neste repositório (Claude Code + `git push`), ou pelo agente de IA do próprio Lovable (via `send_message`, que consome créditos do usuário e edita o sandbox deles diretamente). Quando a segunda via for a escolhida, um prompt vago do tipo "conserta o caixa" tende a gerar mudanças amplas demais ou fora de escopo. Esta skill converte um pedido em um prompt estruturado que reduz esse risco.

## Procedimento

1. **Não execute nada** — esta skill só produz texto (o prompt) para o usuário revisar e, se quiser, enviar ao Lovable (por conta própria ou via `send_message`, com autorização explícita).

2. **Monte o prompt com as seguintes seções, nesta ordem:**

   - **Contexto da área**: módulo afetado, com referência a `docs/contexto-do-projeto.md`/`docs/arquitetura-atual.md` quando existir (ex.: "módulo Caixa, ver `docs/arquitetura-atual.md#estado-e-consultas`").
   - **Objetivo**: uma frase clara do resultado desejado.
   - **Comportamento atual**: o que o sistema faz hoje (baseado em código lido, não em suposição — se não souber, diga "comportamento atual não confirmado, descrever ao Lovable como suspeita").
   - **Comportamento esperado**: o que deveria acontecer depois da mudança.
   - **Arquivos ou módulos envolvidos**: liste os arquivos/rotas/tabelas relevantes já identificados (isso ajuda o agente do Lovable a não caçar no escuro nem tocar em código adjacente).
   - **Restrições**: explicitamente liste o que **não** deve mudar (ex.: "não alterar a tabela `pacientes`", "não tocar no módulo de caixa clássico, só no v2", "não mudar RLS").
   - **Regras que devem ser preservadas**: cite as relevantes de `docs/regras-de-negocio.md`/`mem/` (ex.: "preservar a regra de repasse fixo do Cartão Consulta em `src/lib/print-gr.ts`").
   - **Verificações antes da alteração**: o que o agente deveria checar primeiro (ex.: "confirmar se já existe uma trava de concorrência antes de adicionar outra").
   - **Testes após a alteração**: como validar (não há suíte automatizada neste projeto — pedir teste manual do fluxo específico, com passos).
   - **Critérios de aceite**: lista objetiva e checável (ex.: "ao pagar 3 agendamentos juntos, devem aparecer 3 movimentos separados em Mov. Caixa, cada um com o nome do usuário que processou").
   - **Instrução explícita**: "não modifique áreas não relacionadas a este pedido."
   - **Instrução explícita**: "não altere banco de dados/migrations a menos que estritamente necessário para este pedido — se precisar, explique o motivo antes de aplicar."
   - **Instrução explícita**: "ao concluir, liste os arquivos modificados e o resultado, antes de qualquer publicação."

3. **Sinalize riscos conhecidos do pedido**, se houver — por exemplo, se o pedido tocar em um módulo com histórico de bugs recorrentes (ver `docs/regras-de-negocio.md`), avise o usuário nisso antes de finalizar o prompt, para que ele decida se quer pedir validação extra.

4. **Entregue o prompt pronto em bloco de código**, para o usuário copiar, revisar e decidir se envia — esta skill não envia a mensagem ao Lovable por conta própria.
