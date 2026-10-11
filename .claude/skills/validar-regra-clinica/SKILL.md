---
name: validar-regra-clinica
description: Rastreia uma regra de negócio ou processo da interface até o banco de dados, sem modificar nada, e classifica o quanto ela está de fato implementada — produz perguntas objetivas para a equipe da clínica.
---

# /validar-regra-clinica

Uso: `/validar-regra-clinica <regra ou processo a validar>` (ex.: `/validar-regra-clinica serviço vinculado à especialidade do médico aparece automaticamente no repasse`).

## O que esta skill faz

Investiga se uma regra que o usuário acredita existir (ou deveria existir) está de fato implementada, e onde. **Não modifica o sistema** — o resultado é um veredito + perguntas, não um patch.

## Procedimento

1. **Escreva a regra em uma frase objetiva e testável** antes de investigar (ex.: "quando X é cadastrado, Y deve refletir automaticamente"). Se a regra como descrita pelo usuário for ambígua, peça para reformular antes de rastrear — rastrear a coisa errada desperdiça a investigação.

2. **Rastreie da interface até o banco, nessa ordem:**
   - **Componente/tela**: onde a regra deveria se manifestar visualmente (ex.: um campo que aparece/desaparece, um valor calculado).
   - **Validação client-side**: existe checagem no formulário/componente (zod schema, `if` de validação)?
   - **Server function / RPC**: existe checagem em `src/lib/*.functions.ts` ou em RPC do Supabase?
   - **Tabela(s) envolvidas**: quais colunas armazenam o estado relevante?
   - **Trigger/constraint**: existe algo no banco (`CREATE TRIGGER`, `CHECK`, `UNIQUE`, `EXCLUDE`) garantindo a regra automaticamente, ou tudo depende de código de aplicação lembrar de aplicá-la em todo lugar?
   - **RLS**: a regra tem componente de autorização (quem pode ver/alterar)? Está espelhada na política, ou só na UI?

3. **Aponte explicitamide onde a regra É aplicada** (arquivo + linha/trecho) e **onde ela deveria ser aplicada mas não está** (ex.: validado na tela de cadastro, mas não na importação em lote; ou validado no client, mas ausente na RPC que o `service_role` também pode chamar).

4. **Identifique caminhos que contornam a regra.** Pergunte: existe uma segunda forma de chegar no mesmo dado/ação que não passa pela checagem encontrada? (ex.: outra rota, outro RPC, `service_role` direto, import em lote, edição via SQL de manutenção.)

5. **Classifique o resultado como:**
   - **Confirmada** — aplicada de ponta a ponta, sem caminho de contorno encontrado.
   - **Parcial** — aplicada em alguns caminhos, não em outros (liste quais).
   - **Ausente** — existe intenção documentada (mem/docs) ou relatada pelo usuário, mas nenhum código a aplica.
   - **Contraditória** — código/UI/documentação dizem coisas diferentes entre si.
   - **Não conclusiva** — evidência insuficiente para decidir; diga exatamente o que faltou checar e por quê (ex.: precisa de acesso a um sistema externo, ou depende de dado de produção que não foi consultado).

6. **Nunca marque como Confirmada só por não ter achado o caminho de contorno** — se a investigação foi rasa por limite de tempo/escopo, isso é Não conclusiva, não Confirmada.

7. **Produza perguntas objetivas para a equipe da clínica** quando o veredito for Parcial, Ausente, Contraditória ou Não conclusiva — perguntas que um humano de negócio (não técnico) consiga responder sem ver código (ex.: "quando um serviço é vinculado à especialidade de um médico, isso deveria aparecer automaticamente na aba de repasse, ou o cadastro em Repasse é sempre manual e independente?").

8. **Não proponha nem aplique correção nesta skill.** Se o usuário quiser corrigir o que foi encontrado, direcione para `/corrigir-bug-seguro` (bug pontual) ou para uma conversa de escopo maior se for mudança de arquitetura.
