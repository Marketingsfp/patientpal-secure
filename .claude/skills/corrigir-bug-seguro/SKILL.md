---
name: corrigir-bug-seguro
description: Corrige um bug reportado com o menor diff possível — reproduz/localiza, encontra a causa raiz, corrige, valida com lint/typecheck/build, e para antes de commitar ou dar push.
---

# /corrigir-bug-seguro

Uso: `/corrigir-bug-seguro <descrição do bug>` (cole também prints, mensagem de erro exata, ou o prompt original do usuário relatando o problema, se houver).

## O que esta skill faz

Corrige um bug com o menor risco possível de efeito colateral. Prioriza diffs pequenos e verificáveis sobre refatoração ampla, mesmo que a "solução elegante" pareça maior.

## Procedimento

1. **Registre comportamento esperado vs. observado** em uma frase cada, antes de tocar em código. Se o pedido do usuário não deixar isso claro, pergunte — não assuma o que "deveria" acontecer sem base em `docs/regras-de-negocio.md`, `mem/` ou confirmação explícita.

2. **Verifique `git status` primeiro.** Se já houver alterações não commitadas na árvore, **não presuma que são suas** — pergunte ao usuário antes de misturar sua correção com o que já está lá (podem ser mudanças de outro colaborador ou do próprio Lovable).

3. **Reproduza ou localize o problema:**
   - Prefira localizar via leitura de código (grep pelo texto de erro, pela rota, pelo nome do componente) a tentar reproduzir em ambiente local, já que este projeto não tem suíte de testes automatizados nem CI.
   - Se houver print de erro, extraia a mensagem exata e a stack, se visível.
   - Cheque se o mesmo bug já foi relatado antes (buscar em `docs/`, `mem/`, ou pedir ao usuário para checar o histórico de prompts do Lovable) — bugs recorrentes no mesmo módulo indicam causa raiz mais profunda que uma correção pontual não resolveu.

4. **Identifique a causa raiz**, não só o sintoma. Distinga explicitamente: "isto é a causa" (evidência direta no código) de "isto é minha melhor hipótese" (marque como tal).

5. **Proponha a alteração mínima** que resolve a causa raiz. Evite:
   - Tocar em arquivos/componentes não relacionados ao bug.
   - "Aproveitar" para refatorar código ao redor.
   - Duplicar lógica em vez de corrigir/reutilizar a existente.
   - Alterar comportamento de módulos v1 e v2 ao mesmo tempo sem necessidade — corrija o que foi reportado; se o mesmo bug existe no outro módulo, informe e pergunte se corrige os dois.

6. **Preserve regras existentes.** Antes de mudar uma validação/condição, confirme que ela não está ali por uma regra de negócio documentada (`docs/regras-de-negocio.md`, `mem/`) — se estiver, sua correção não pode contradizê-la sem aprovação explícita.

7. **Após a alteração, rode as validações disponíveis:**
   - `npm run lint`
   - `tsc --noEmit` (não há script `typecheck` dedicado — rodar o `tsc` direto)
   - `npm run build` (se a mudança for estrutural o suficiente para justificar)
   - Não há testes automatizados neste projeto — diga isso explicitamente em vez de alegar cobertura que não existe.

8. **Revise o diff você mesmo** antes de apresentar (`git diff`) — confirme que só as linhas relacionadas ao bug mudaram.

9. **Não faça commit nem push automaticamente.** Apresente o diff e espere o usuário pedir explicitamente para commitar (ver `.claude/rules/git-lovable.md`).

10. **Apresente ao final:** o que mudou (arquivos + resumo), quais validações rodaram e o resultado, e quais riscos restantes existem (ex.: "não há teste automatizado cobrindo este fluxo", "esse mesmo padrão existe em outros 3 arquivos e não foi alterado").
