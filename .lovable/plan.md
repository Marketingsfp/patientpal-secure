
## Escopo confirmado (resposta anterior)

- Clínica-alvo: **todas as 3 clínicas** (cada uma já tem seu próprio "CONVÊNIO FUNCIONÁRIO", isolado por `clinica_id`).
- Contratos antigos manuais: **mantidos como estão**, sem migração automática.
- Cobrança: **gratuito** (sem mensalidade, sem taxa de inclusão).
- Dependente: exige **grau de parentesco** e o paciente já precisa existir no cadastro de clientes.

## O que muda para o usuário

No menu **Recursos Humanos → Funcionário (editar)**, além de "Dados do contrato" e "Acesso ao sistema", passa a existir uma terceira aba **"Convênio"**:

1. Toggle **"Habilitar Convênio Funcionário"**.
   - Ao ligar: exige selecionar o **paciente titular** (o próprio funcionário no cadastro de clientes — busca por nome/CPF).
   - Se o funcionário ainda não estiver como paciente, mostra atalho para cadastrá-lo antes.
2. Lista de **Dependentes** (nome, parentesco, botão remover). Botão "Adicionar dependente" abre busca de paciente + campo parentesco obrigatório.
3. Ao desligar o toggle: pergunta confirmação e encerra o vínculo (titular + dependentes ficam inativos).

Regra de negócio: benefícios do "CONVÊNIO FUNCIONARIO" (regras já cadastradas em `cb_convenio_regras`) valem tanto para o titular quanto para os dependentes — o motor de preços da Agenda já resolve isso hoje via `contratos_assinatura` + `contrato_dependentes`, então reusamos essa mesma estrutura.

## Como será construído (parte técnica)

1. **Reuso de tabelas existentes** — sem schema novo pesado:
   - Criar/atualizar um `contratos_assinatura` "sombra" por funcionário habilitado:
     - `paciente_id` = paciente titular escolhido,
     - `convenio_id` = o CONVÊNIO FUNCIONARIO da `clinica_id` do funcionário,
     - `valor_mensalidade = 0`, `carencia_dias = 0`, `carencia_isenta = true`, `origem = 'rh_funcionario'`, `status = 'ativo'`,
     - **sem geração de mensalidades** (o gerador só roda quando `valor_mensalidade > 0` — a lógica atual já respeita isso; validar em `functions.sql`).
   - Vínculo com o funcionário: coluna nova `hr_contratos.convenio_contrato_id uuid null references contratos_assinatura(id) on delete set null` (migração enxuta, só isso).
   - Dependentes reaproveitam `contrato_dependentes` (o motor da Agenda já enxerga como "Associado — dependente").

2. **Migração SQL** (uma só):
   - Adiciona `hr_contratos.convenio_contrato_id`.
   - RPC `hr_toggle_convenio_funcionario(_contrato_hr uuid, _titular_paciente_id uuid, _habilitar bool)` — cria/ativa/desativa o `contratos_assinatura` sombra, escolhendo o `cb_convenios` do tipo "funcionário" da mesma `clinica_id`. Idempotente.
   - RPC `hr_convenio_add_dependente(_contrato_hr uuid, _paciente_id uuid, _parentesco text)` e `hr_convenio_remove_dependente(_dep_id uuid)` — delegam para a lógica de `incluir/excluir dependente` já existente, mas **sem cobrar taxa de inclusão** (flag `taxa=null`).
   - GRANTs para `authenticated` + `service_role`.

3. **UI** — nova aba em `src/routes/_authenticated/app.hr-contratos.$id.tsx`:
   - Novo componente `FuncionarioConvenioTab.tsx` (~200 linhas): toggle, busca de titular (reusa `PatientSearchInput`), lista de dependentes (reusa padrão de `contratos-page`), badge de prontuário ao lado do nome.
   - Chama as RPCs acima; mostra toasts amigáveis; bloqueia com mensagem clara se não existir CONVÊNIO FUNCIONARIO cadastrado na clínica.

4. **Nada muda na tela de Contratos** — os contratos-sombra ficam ocultos da listagem padrão (filtro `origem <> 'rh_funcionario'` no `contratos-page`), para não poluir a operação. Aparecem só via aba Convênio do funcionário.

## Fora do escopo

- Migrar automaticamente funcionários que já têm contrato manual no Cartão Benefícios (o usuário pediu para manter).
- Cobrança / mensalidade / taxa de inclusão para esse convênio.
- Alteração das regras de preço já cadastradas em `cb_convenio_regras` do "CONVÊNIO FUNCIONARIO".

## Validação após implementar

- Habilitar convênio para 1 funcionário de teste em cada clínica, adicionar 1 dependente, criar 1 agendamento e conferir se aparece "Associado — titular / dependente" e se o preço da regra do CONVÊNIO FUNCIONARIO é aplicado.
- Desligar o toggle e conferir que titular/dependentes deixam de receber o benefício em novos agendamentos.
