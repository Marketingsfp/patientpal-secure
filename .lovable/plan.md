## Objetivo

No cadastro de médico, eliminar o bloco "RQE (Registro de Qualificação de Especialista)" como seção independente. Em vez disso, cada **especialidade** vinculada ao médico passa a ter um checkbox **"Tem RQE"** e, quando marcado, um campo para o **número do RQE**.

## Banco de dados

Migração em `public.medico_especialidades`:
- Adicionar `tem_rqe boolean NOT NULL DEFAULT false`.
- Adicionar `rqe_numero text` com check de tamanho (≤ 50).
- Backfill: para cada item em `medicos.rqes` (JSON), se houver linha correspondente em `medico_especialidades` com a mesma `especialidade_id`, definir `tem_rqe = true` e `rqe_numero` = número informado.
- Manter `medicos.rqes` por compatibilidade (sem novas gravações).

## Frontend — `src/components/medicos/MedicoFormDialog.tsx`

1. Remover o bloco "RQE" (UI e estado `rqes` do form).
2. Na aba **Especialidades**, cada linha passa a ter:
   - Select da especialidade (como hoje)
   - Checkbox **"Tem RQE"**
   - Quando marcado: input **"Nº RQE"** (obrigatório)
   - Botão remover
3. `load`: hidratar `tem_rqe` e `rqe_numero` da query de `medico_especialidades`.
4. `handleSubmit`:
   - Validar: se "Tem RQE" estiver marcado, `rqe_numero` é obrigatório.
   - Ao gravar `medico_especialidades`, incluir `tem_rqe` e `rqe_numero`.
   - Remover envio dos campos `rqes`, `tem_rqe`, `rqe_especialidade` no payload de `medicos`.

## Fora de escopo

- Tela e CRUD de **Especialidades** (cadastro global) — a marcação de RQE é por médico/especialidade, não no cadastro da especialidade.
- Listagem de médicos, demais abas (Acesso, Banco, Repasse, etc.).
