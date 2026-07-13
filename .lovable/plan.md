# Trocar perfil de acesso do médico

## Contexto

Hoje, quando um funcionário é promovido para **Médico** (`clinica_memberships.role = 'medico'`), ele some da aba "Funcionários" (a listagem filtra `role !== 'medico'`) e passa a aparecer só na aba "Médicos". A edição do médico usa `MedicoFormDialog`, que **não tem** o seletor de perfil de acesso — por isso não dá para voltar o usuário para "Funcionário" (recepção, caixa, etc.) pela interface.

## ATENÇÃO — impacto em permissões

Esta mudança altera diretamente o **perfil de acesso** (`clinica_memberships.role`) do usuário. Consequências práticas ao trocar de "medico" para outro perfil:

- Perde acesso automático à agenda médica, prontuário, atendimento e módulos vinculados ao preset "medico"
- Ganha acesso aos módulos do novo perfil (recepção/caixa/financeiro/etc.)
- `has_role(uid,'medico')` passa a retornar falso — RLS de agendas/prontuário passa a filtrar
- O registro em `public.medicos` continua existindo (para preservar histórico de agendamentos, prontuários, repasses passados) — só é **desativado** (`ativo=false`) por padrão

Apenas **admin/gestor da clínica** pode executar a troca (mesma regra que `can_manage_clinica` já usada em toda essa área). Nada de anon, nada de RLS afrouxada.

## Escopo

**Dentro:**
- Adicionar no `MedicoFormDialog` (na aba "Login e Perfil", junto do campo "Perfil de acesso" que já existe para outros formulários) um seletor de **Perfil de acesso**, pré-preenchido com "Médico".
- Se o usuário mudar o perfil e salvar:
  1. Atualiza `clinica_memberships.role` do `user_id` do médico para o novo perfil
  2. Desativa o cadastro em `public.medicos` (`ativo=false`) — o registro permanece para histórico
  3. Mostra confirmação em modal antes de aplicar ("Isso removerá o acesso de médico. Continuar?")
- Botão só aparece se `can_manage_clinica` (admin/gestor). Demais perfis veem apenas leitura.

**Fora:**
- Não mexer em RLS, funções `security definer`, GRANTs, `has_role`, `can_manage_clinica`, `can_manage_medicos`
- Não deletar o registro do médico (histórico preservado)
- Não mexer em `FuncionarioFormDialog` (o caminho inverso já funciona: promover funcionário → médico)
- Não criar tabela nova

## Arquivos que serão alterados

1. `src/components/medicos/MedicoFormDialog.tsx`
   - Novo seletor "Perfil de acesso" com as mesmas opções de `PERFIS` do FuncionarioFormDialog
   - Nova ação `handleTrocarPerfil` que faz `UPDATE clinica_memberships` + `UPDATE medicos SET ativo=false`
   - Confirmação via modal antes de aplicar
   - Só habilita se `podeGerenciarEquipe` (já existe no componente)

Nenhum outro arquivo será tocado. Não há mudança em: `_authenticated/route.tsx`, `auth-middleware.ts`, presets, mapa rota→módulo, RLS ou funções `security definer`.

## Fluxo em texto

```text
Editar médico  →  aba "Login e Perfil"
                 ├─ Perfil de acesso: [Médico ▼]  ← já é "medico"
                 │                    ├─ Recepção
                 │                    ├─ Caixa
                 │                    ├─ Financeiro
                 │                    ├─ Enfermeiro
                 │                    ├─ Gestor
                 │                    └─ Administrador
                 │
                 └─ Salvar
                    ├─ Se perfil mudou → modal de confirmação
                    │  "Isso removerá o acesso de médico. O cadastro será
                    │   desativado mas o histórico permanece. Continuar?"
                    ├─ Confirma → UPDATE clinica_memberships.role
                    │              UPDATE medicos SET ativo=false
                    │              redireciona para /app/equipe?tab=funcionarios
                    └─ Cancela → nada muda
```

## Validação após a mudança

1. Login como admin da clínica → editar um médico → trocar perfil para "recepção" → salvar → confirmar que:
   - o usuário aparece na aba "Funcionários"
   - some da aba "Médicos"
   - ao logar como esse usuário, não vê mais menu médico
   - agendas/prontuários antigos dele continuam existindo (não foram deletados)
2. Login como recepcionista → editar médico → o seletor de perfil aparece somente leitura (ou não aparece)
3. `bun run build` limpo

## Riscos / pendências

- O usuário virou "recepção" mas ainda tem `medicos.user_id` ligado. Se você quiser que ele volte a ser médico depois, hoje já dá para reativar o registro (`ativo=true`) e devolver o perfil — mas isso ficará como próxima iteração, não faz parte deste escopo.
- Perfis com `role` fora do enum previsto por `has_role` seguem funcionando normalmente (o enum já cobre admin/gestor/medico/enfermeiro/recepcao/caixa/financeiro).

**Preciso da sua confirmação explícita para prosseguir**, conforme regra 1 do AGENTS.md.
