## Diagnóstico

Verifiquei no banco: a Quedima (`73c7e395-…`) é **admin nas 3 clínicas** tanto em `user_roles` quanto em `clinica_memberships`. Pelo código de `usePermissoes`, admin recebe `allowed = null` (sem filtro), então **não é a matriz de permissões que está cortando** o menu dela.

O que corta é outra coisa: o **"Subsystem" salvo no navegador** (`localStorage.appshell:subsystem`). Quando o usuário entra em `/app` e escolhe um perfil de trabalho (Gestor Clínico = `recepcao`, ou Gestão de Pessoas = `gestao-pessoas`), o `app-shell.tsx` passa a esconder grupos inteiros do menu, **inclusive para admin**:

- `recepcao` → só mostra: Operação, Cartão Benefícios, Inteligência, Marketing, Cadastros, RH, Gestão, Configurações. **Esconde** grupos como "Financeiro", "Clínico", etc.
- `gestao-pessoas` → só mostra: RH, Gestão, Configurações.

Hoje, só o e-mail do Rodrigo tem bypass desse filtro (`isRodrigoFullAccess` no `app-shell.tsx`). Por isso a Quedima, mesmo sendo admin, vê o menu recortado — provavelmente escolheu "Gestor Clínico" no seletor `/app` em algum momento e a escolha ficou gravada no navegador dela.

Classificação: **erro de UX/permissão de visualização** (não é regra de negócio, não é dado, não é RLS).

## Correções propostas (escolha a que preferir)

Preciso da sua confirmação antes de aplicar. Duas alternativas:

**Opção A — Admin sempre vê tudo (recomendado)**
Estender o bypass que hoje existe só para o Rodrigo: qualquer usuário com `role = admin` na clínica atual passa a ignorar o filtro de subsystem e sempre enxerga o menu completo. Muda 1 arquivo (`src/components/app-shell.tsx`), sem tocar em banco.

**Opção B — Botão "Ver menu completo" quando um subsystem está ativo**
Manter o filtro (é útil para usuários operacionais que querem foco), mas mostrar um botão/label ao lado do "Gestor Clínico" que limpa o subsystem (`setSubsystem(null)`) e devolve o menu inteiro. Serve para todos, não só admin.

As duas soluções resolvem o caso da Quedima. A **A** é automática; a **B** exige que ela clique uma vez.

## Escopo (Regra 1.10)

A mudança é de **frontend puro (comportamento do menu)**, sem impacto por clínica — mas confirme mesmo assim:
- Aplicar nas **3 clínicas** (SFP, Menino Jesus, SÃO Policlínica)?
- Ou só onde a Quedima trabalha primariamente?

## Fora do escopo

- Não vou alterar nenhum papel, permissão ou dado.
- Não vou mexer em `perfil_permissoes` / `perfis_acesso`.
- Não vou tocar no bypass existente do Rodrigo.

## Pendências / validação após aplicar

- Pedir à Quedima para dar **F5** (o `localStorage` do subsystem é do navegador dela; qualquer opção acima só passa a valer no próximo carregamento da página).
- Se preferir uma correção imediata **sem deploy**, ela pode abrir o Console do navegador e rodar `localStorage.removeItem('appshell:subsystem')` + F5 — resolve o caso pontual dela agora, mas não previne repetição.

Me diga qual opção (A ou B) e o escopo de clínicas para eu implementar.
