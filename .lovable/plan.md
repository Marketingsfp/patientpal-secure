# Liberar cadastro de Especialidades e Categorias de Serviço para gestores de clínica

## O que foi confirmado

A migração de 02/09 substituiu as regras de escrita dessas duas tabelas: hoje **só o administrador da plataforma** (usuário com papel `admin` sem clínica vinculada) consegue criar, editar ou excluir. Conferi as regras ativas no banco: em `especialidades` e `tipos_servico` as permissões de criar/editar/excluir exigem `is_platform_admin`. A leitura continua liberada para todos.

As telas continuam mostrando os botões "Novo/Nova", "Editar" e "Excluir" para quem tem permissão de escrita no módulo. O gestor clica, salva e recebe erro — sem entender o motivo.

Este é um ponto de **regra de negócio**, não apenas erro técnico: essas duas tabelas são **globais**, valem para todas as clínicas. Se um gestor renomear ou excluir uma especialidade, isso muda para todo mundo. Por isso não altero o banco sem confirmação.

## Opção recomendada (equilíbrio entre autonomia e risco)

1. **Criar e editar**: liberar para gestores de clínica (mesmo critério de antes: `can_manage_medicos` / gestor da clínica).
2. **Excluir**: manter só para o administrador da plataforma — exclusão global é o que causa dano irreversível em outras clínicas.
3. **Aviso na tela**: nas duas páginas, um texto curto explicando que o cadastro é compartilhado por todas as clínicas.
4. **Botão Excluir**: ocultar/desabilitar para quem não é administrador da plataforma, para o gestor não bater na parede.

## Alternativa mais restritiva

Manter tudo como está no banco e apenas ajustar as telas: esconder os botões de novo/editar/excluir para quem não é administrador da plataforma, com aviso "solicite ao administrador". Sem mudança de banco, mas o gestor fica dependente de suporte para cadastrar uma especialidade nova antes de cadastrar um médico.

## Detalhes técnicos

- Migração nova (não editar a antiga) recriando em `public.especialidades` e `public.tipos_servico`:
  - `*_platform_insert` / `*_platform_update` substituídos por políticas que aceitam `public.is_platform_admin(auth.uid()) OR public.can_manage_medicos(auth.uid())` (ou função equivalente já usada para gestor de clínica — confirmar a existente antes de escrever a SQL).
  - `*_platform_delete` permanece inalterado.
- Front: `src/routes/_authenticated/app.especialidades.tsx` e `src/routes/_authenticated/app.tipos-servico.tsx` — aviso de escopo global e o botão de excluir condicionado a administrador da plataforma.
- Escopo: vale para **todas as clínicas** (as tabelas são globais e não têm `clinica_id`).

## Fora do escopo

Nenhuma outra política da migração de 02/09 será tocada (backups, allowlist de laboratório, relatórios internos permanecem restritos à plataforma).
