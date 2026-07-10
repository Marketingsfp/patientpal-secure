# Auditoria da funcionalidade de permissões

Data: 10/07/2026  
Escopo: ClinicaOS / Health Hub Pro, clínica `POLICLINICA MENINO JESUS`  
Modo: análise somente leitura; nenhuma permissão foi alterada.

## Conclusão executiva

As permissões exibidas na tela **não representam de forma confiável o que cada usuário realmente pode fazer**. O sistema possui três camadas que não estão alinhadas:

1. matriz visual `Sem / Leitura / Edição`;
2. guard de rota e ocultação de menu no front-end;
3. políticas RLS e funções do banco.

A matriz funciona principalmente como controle de visibilidade. O nível `read/write` só é consultado por três módulos (`Caixa`, `Clientes` e `Financeiro > Movimento`). A maior parte das telas não usa esse nível para bloquear botões ou mutações. No banco, muitas políticas de escrita autorizam qualquer membro ativo da clínica, sem considerar o perfil ou a matriz.

Classificação geral: **risco crítico de autorização inconsistente e excesso de privilégio**.

## Achados prioritários

### P0 — RLS ignora a matriz de permissões em operações sensíveis

Foram encontradas políticas de `INSERT`, `UPDATE`, `DELETE` ou `ALL` baseadas apenas em `is_member(auth.uid(), clinica_id)` para várias tabelas. Isso significa que ser membro ativo da clínica pode ser suficiente para escrever diretamente via API, mesmo quando a tela mostra “Sem” ou “Leitura”.

Exemplos confirmados no banco de produção:

- `agendamentos`: qualquer membro pode inserir e atualizar;
- `fin_lancamentos`, `fin_contas`, `fin_atendimentos`, `fin_categorias`, `fin_empresas` e `fin_notas_pacientes`: qualquer membro pode inserir/atualizar;
- `pagamentos` e `pagamento_splits`: qualquer membro pode inserir/atualizar;
- `boletos`, `nfse`, contratos e mensalidades: qualquer membro pode inserir/atualizar;
- `pacientes`, prontuários, anamneses, resultados de exames e documentos: escrita baseada em membership;
- marketing, CRM, estoque, orçamento e serviços também possuem políticas amplas.

Consequência: esconder uma rota ou botão não impede um usuário autenticado de chamar a API Supabase diretamente.

### P0 — “Leitura” e “Edição” quase não são aplicadas

O hook `usePodeEscrever()` é usado somente em:

- `app.caixa.tsx`;
- `app.clientes.index.tsx`;
- `app.financeiro.movimento.tsx`.

Nos demais módulos, possuir `read` ou `write` normalmente produz o mesmo efeito no guard: ambos permitem abrir a rota. A página interna pode continuar contendo ações de alteração.

Consequência: a distinção visual entre “Leitura” e “Edição” é, em grande parte, nominal.

### P0 — Perfil MÉDICO está excessivamente privilegiado

Configuração real salva na Policlínica Menino Jesus: **43/57 módulos**, sendo 4 de edição e 39 de leitura.

Permissões incompatíveis com a descrição do perfil médico incluem:

- `caixa: write`;
- `checkin: write`;
- `perfis: read`;
- `equipe: read`;
- `hr-holerites: read`;
- `hr-contratos: read`;
- `hr-ponto: read`;
- módulos de marketing, CRM, Nina, LMS, unidades, serviços e gestão operacional.

Há 6 usuários ativos com perfil médico afetados.

### P0 — ADMIN mostra 1/57, mas possui acesso total

No banco, o perfil ADMIN está salvo com `agenda: write` e todos os outros 56 módulos como `none`. A interface mostra corretamente o conteúdo salvo, porém `usePermissoes()` ignora completamente a matriz quando o role é `admin` e retorna acesso irrestrito.

Consequências:

- a tela é enganosa;
- alterações feitas na matriz do ADMIN não têm efeito real;
- um administrador pode acreditar que restringiu outro administrador quando não restringiu.

Existem **10 usuários ativos como ADMIN**, número elevado para uma clínica e incompatível com o princípio do menor privilégio.

### P1 — GESTOR pode administrar permissões de todos os perfis

As políticas de `perfis_acesso` e `perfil_permissoes` usam `can_manage_clinica()`. Essa função considera tanto `admin` quanto `gestor`. Portanto, um gestor pode alterar inclusive permissões de ADMIN e de outros gestores.

A descrição da tela afirma que GESTOR não acessa configurações sensíveis, mas a política de banco permite administrar a matriz caso ele alcance a funcionalidade.

Atualmente não há gestores ativos na clínica analisada, mas a vulnerabilidade funcional permanece.

### P1 — Existem duas definições diferentes de presets

Há uma cópia de `PRESETS` dentro de `app.perfis.tsx` e outra em `src/lib/permissoes-presets.ts`. Elas já divergem. Exemplo: o financeiro do gestor aparece como `read` na tela e `write` no preset compartilhado.

Consequência: uma clínica sem linhas salvas pode receber uma permissão; ao abrir/salvar a tela, passa a receber outra.

### P1 — A tela administra 57 módulos, mas o runtime conhece módulos adicionais

O catálogo compartilhado inclui módulos não presentes na tela, como:

- `atendimento-multiplo`;
- `tipos-servico`;
- `enfermagem-recursos`;
- `painel-executivo`.

Quando existe ao menos uma linha salva para o perfil, o hook deixa de complementar com o preset. Assim, módulos ausentes da tela podem desaparecer do acesso sem possibilidade de configuração visual.

### P1 — Falha de carregamento concede acesso pelo preset

Em erro de leitura das permissões, `usePermissoes()` cai no preset para “não travar o usuário”. Para autorização, esse comportamento é permissivo. Uma falha transitória pode ampliar acesso em vez de bloqueá-lo.

O carregamento inicial também trata `allowed === null` como acesso total e o guard permite a rota enquanto `permsLoading` está ativo. Embora isso reduza flashes visuais, não é um padrão seguro para autorização.

### P2 — Matriz é por perfil, não por usuário

A tela não configura exceções individuais. O acesso efetivo de cada usuário é o role em `clinica_memberships`, combinado com a matriz do perfil. O título “o que cada usuário pode fazer” só pode ser respondido por role; não existe uma camada consolidada de permissão por usuário.

## Estado real da clínica analisada

| Perfil | Usuários ativos | Matriz salva |
|---|---:|---:|
| Admin | 10 | 1/57, mas runtime concede tudo |
| Médico | 6 | 43/57 |
| Recepção | 19 | 15/57 |
| Enfermeiro | 3 | 13/57 |
| Financeiro | 2 | 18/57 |
| Caixa | 1 | 11/57 |
| Gestor | 0 | sem linhas; usa preset enquanto não for salvo |

## Avaliação por perfil

- **Admin:** capacidade real condiz com “acesso total”, mas a tela não condiz com a realidade e há administradores demais.
- **Gestor:** preset geral é amplo e a política permite alterar permissões sensíveis; não condiz com a descrição de restrição.
- **Médico:** não condiz. Possui acesso excessivo a caixa, check-in, RH, perfis, marketing e gestão.
- **Recepção:** a matriz visual parece próxima da função operacional, porém RLS permite mais operações do que a matriz declara.
- **Caixa:** a matriz contém acessos operacionais plausíveis, mas inclui agenda/clientes em edição e NFS-e/boletos; precisa de validação de negócio. RLS amplia ainda mais.
- **Financeiro:** a matriz é razoavelmente alinhada ao papel, mas `integration-secrets: read`, RH e agenda em edição merecem revisão. O banco não limita escrita financeira exclusivamente a esse perfil.
- **Enfermeiro:** matriz visual próxima do papel, mas políticas do banco permitem escrita em domínios fora da enfermagem.

## Recomendações

1. Definir uma função de autorização central no banco, por exemplo `has_module_access(clinica_id, modulo, nivel)`, baseada no membership e em `perfil_permissoes`.
2. Reescrever primeiro as RLS de agenda, financeiro, pagamentos, caixa, pacientes e prontuários para exigir módulo e nível adequados.
3. Fazer `read` controlar SELECT/visualização e `write` controlar INSERT/UPDATE/DELETE, tanto no banco quanto no front-end.
4. Alterar o carregamento para **fail closed**: erro ou estado desconhecido não deve conceder preset ou acesso total.
5. Manter um único catálogo de módulos e presets, importado pela tela, guard e testes.
6. Tornar ADMIN explicitamente imutável como acesso total, ou remover o bypass e fazer a matriz realmente valer; não manter os dois comportamentos.
7. Permitir alteração de perfis sensíveis somente a ADMIN; gestor não deve elevar privilégios nem alterar ADMIN.
8. Revisar imediatamente os 10 administradores e reclassificar contas que não precisam de acesso total.
9. Reduzir o perfil MÉDICO ao domínio clínico e, quando necessário, aos próprios pacientes/atendimentos/repasses.
10. Criar testes automatizados por perfil e operação, incluindo chamadas diretas ao Supabase, não apenas navegação pela interface.

## Evidências de código

- Catálogo/presets compartilhados: `src/lib/permissoes-presets.ts`.
- Preset duplicado da tela: `src/routes/_authenticated/app.perfis.tsx:179`.
- Salvamento da matriz: `src/routes/_authenticated/app.perfis.tsx:320`.
- Fallback permissivo: `src/hooks/use-permissoes.tsx:67`, `:79` e `:98`.
- Admin tratado como acesso irrestrito: `src/hooks/use-permissoes.tsx:117`.
- Guard permite durante loading: `src/components/app-shell.tsx:439-444`.
- Somente três usos de `usePodeEscrever`: Caixa, Clientes e Financeiro/Movimento.
- `can_manage_clinica` inclui admin e gestor: migration `20260516181120...sql:82`.

## Limites desta auditoria

Esta análise verificou código, configuração viva de perfis e políticas RLS existentes. Não foram usadas senhas nem realizadas operações destrutivas. Para comprovar cada ação visível por perfil, ainda é recomendado executar uma matriz de testes com contas controladas de cada role em ambiente de homologação.
