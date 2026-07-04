## Objetivo

Antes de pedir dados, o sistema (Nina no WhatsApp + telas internas de cadastro/agendamento) deve **verificar se o paciente já existe**, tratar corretamente **associados** (Cartão Benefícios) e respeitar o **status de importação de base** por unidade.

## Unidades (mapeadas no banco)

- **POLICLINICA MENINO JESUS** — 242.311 pacientes → base **importada**
- **POLICLINICA SAO FRANCISCO DE PAULA** — 79 pacientes → base **ainda não importada**
- **CLINICA CONSULTA HOJE** — 9 pacientes → base **ainda não importada**

Como isso pode mudar, vamos criar uma flag `base_importada` em `clinicas` (default = calculada por contagem, mas configurável manualmente).

## Regras a implementar

1. **Buscar antes de perguntar**: dado CPF, telefone ou nome, buscar em `pacientes` (dentro do escopo da clínica atual).
2. **Se encontrado + associado ativo** (existe registro em `contratos_assinatura` com `status = 'ativo'` para o `paciente_id`, dentro da vigência): informar o vínculo, aplicar regras/valores do convênio (não tratar como particular).
3. **Se não encontrado** e a clínica for **Menino Jesus** (base importada): pedir apenas os campos essenciais para cadastro/agendamento.
4. **Se não encontrado** e a clínica for **SFP ou Consulta Hoje** (base não importada): informar "Os dados desta unidade ainda não estão disponíveis" e oferecer encaminhamento para atendente humano.
5. **Só pedir dados completos** (endereço, contato completo etc.) quando houver **intenção clara** de agendamento, cadastro ou atualização — não em consultas informativas.

## Implementação

### 1. Banco (uma migração)

- Adicionar coluna `clinicas.base_importada boolean default false`.
- Setear `true` para Menino Jesus; `false` para as outras duas.
- Nova função SQL `buscar_paciente_contato(_clinica_id, _cpf, _telefone, _nome)` retornando `{ id, nome, cpf, telefone, associado, convenio_nome, convenio_id }` — usa `contratos_assinatura` para calcular `associado`. `SECURITY DEFINER`, `GRANT EXECUTE` para `authenticated` e `anon` (a webhook do WhatsApp usa admin client, mas mantemos coerente).

### 2. Backend Nina — WhatsApp (`src/lib/whatsapp.server.ts`)

- Nova função `identificarPacientePorMensagem(clinicaId, mensagem, telefoneRemetente)`:
  - Extrai CPF (regex), telefone (E.164/BR), nome candidato.
  - Prioridade: telefone do remetente → CPF citado → nome citado.
  - Chama `buscar_paciente_contato`.
- Em `gerarRespostaNina`:
  - Sempre carregar `base_importada` e o resultado da identificação.
  - Injetar no `systemPrompt` um bloco `CONTEXTO DO REMETENTE:` com:
    - status "identificado / não identificado"
    - se identificado + associado: nome do convênio, orientação de aplicar regra de associado (não particular)
    - se `base_importada = false` e não identificado: instrução para responder "Base ainda não disponível — vou te encaminhar para uma atendente" e não pedir cadastro
    - Regra: só solicitar dados completos após intenção explícita de agendar/cadastrar/atualizar.

### 3. UI interna — cadastro/agendamento

- No `PatientSearchInput` já existe busca por nome/CPF; adicionar:
  - Badge visual **"Associado — <convênio>"** no resultado quando o paciente tiver contrato ativo (nova consulta leve em `contratos_assinatura`, ou usar a nova RPC).
- No fluxo "novo paciente" (usado em `agendamentos` e `clientes`):
  - Antes de mostrar formulário completo, exibir passo curto "Verificar duplicidade" pedindo CPF **ou** telefone **ou** nome.
  - Se a clínica atual tem `base_importada = false` e a busca não retornar nada, mostrar aviso: *"Base desta unidade ainda não foi importada. Encaminhe para atendente para cadastro manual."* + botão "Cadastrar mesmo assim" (para casos manuais dos operadores).
  - Se encontrado + associado: preencher automaticamente e aplicar regras de associado no orçamento (integração com `cb-regras`).

### 4. Onde os componentes vivem

- `supabase/migrations/<timestamp>_paciente_lookup.sql` — coluna + função SQL.
- `src/lib/whatsapp.server.ts` — helper + integração no prompt.
- `src/lib/paciente-lookup.functions.ts` (novo) — server fn `buscarPacienteContato` usada pelas telas internas.
- `src/components/patient-search-input.tsx` — badge "Associado".
- `src/components/clientes/cliente-form.tsx` — passo prévio de verificação de duplicidade + aviso de base não importada.
- `src/routes/_authenticated/app.agenda.tsx` (fluxo "novo paciente") — reutilizar o mesmo componente de verificação.

## Fora de escopo (fica para depois)

- Importar de fato as bases de SFP e Consulta Hoje (é operacional, não código).
- Ajustar a versão interna da Nina (`chatNina`) — as regras são para paciente externo; a Nina interna já responde para equipe.
- Transferência automática para atendente humano — hoje a Nina só orienta a aguardar; manteremos essa orientação.
