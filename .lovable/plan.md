## Objetivo
Adicionar no cadastro de médicos um campo **RQE** (checkbox). Quando marcado, exibir um campo adicional **"Especialidade de RQE"** para o usuário preencher.

## Mudanças

### 1. Banco de dados (migration)
Adicionar duas colunas em `public.medicos`:
- `tem_rqe boolean NOT NULL DEFAULT false`
- `rqe_especialidade text` (texto livre, nullable, com limite de 200 caracteres)

### 2. Formulário do médico (`src/components/medicos/MedicoFormDialog.tsx`)
- Adicionar `tem_rqe` e `rqe_especialidade` ao estado `form`.
- Carregar esses valores ao editar (no `select` e no `setForm`).
- Renderizar na aba de dados profissionais (junto ao CRM/especialidades):
  - Checkbox "RQE"
  - Quando marcado: input de texto "Especialidade de RQE" (obrigatório se marcado)
- Incluir os campos no `payload` de insert/update.
- Se `tem_rqe` for desmarcado, limpar `rqe_especialidade` (gravar `null`).

### 3. Sem outras alterações
Não alterar listagens, repasses ou outras telas — apenas o formulário e o schema.

## Detalhes técnicos
- Texto livre em `rqe_especialidade` (sem FK para `especialidades`), pois RQE refere-se a uma área de atuação específica do CFM que pode não estar na tabela de especialidades.
- Validação no front: se `tem_rqe = true`, exigir `rqe_especialidade` não vazio antes de enviar.
