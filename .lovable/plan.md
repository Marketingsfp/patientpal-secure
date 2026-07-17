## Objetivo

Diferenciar visualmente qual paciente é o titular / dependente do contrato quando existem pacientes homônimos, exibindo o **código de prontuário** ao lado do nome (titular e dependentes) na tela de detalhes do contrato (`/app/cartao-beneficios/contratos` e `/app/contratos`).

## Onde vai aparecer

Em `src/components/pages/contratos-page.tsx`, na tela de detalhes do contrato:

1. **Título do contrato** (topo da página):
   `Contrato #20260978 — MARIA DA GLORIA DE SOUZA` + badge `Prontuário 12345` ao lado.
2. **Aba Dados → Paciente titular**:
   - Modo leitura: badge `Prontuário 12345` ao lado do nome.
   - Modo admin (com `PatientSearchInput`): badge abaixo do campo mostrando o prontuário do titular atualmente selecionado (o dropdown de busca já mostra o prontuário; a novidade é persistir a informação visível após a seleção).
3. **Aba Dados → Dependentes**: cada linha da lista passa a mostrar `• NOME — Prontuário 12345 — parentesco (tipo) — CPF … — Incluído: …`.
4. **Aba Resumo → aviso de "Titular financeiro"**: mesma badge de prontuário junto ao nome do titular.

Escopo mantido dentro desta tela — não altero o wizard de novo contrato (o dropdown já mostra o prontuário durante a busca) nem outras telas.

## Mudanças técnicas

- Estender o `select` do `pacienteFull` (dentro de `load()`) para incluir `codigo_prontuario` (hoje traz apenas `cpf, data_nascimento, telefone, email, endereço`).
- Estender o tipo `Dep` com `codigo_prontuario?: string | null`.
- No mesmo bloco que já busca `cpf` dos dependentes (`from('pacientes').select('id, cpf').in('id', pids)`), incluir `codigo_prontuario` e propagar no `map` que monta `depsRows`.
- Criar pequeno componente inline `ProntuarioBadge` (mesma aparência já usada em `PatientSearchInput` e em `app.clientes.$pacienteId.editar`: `text-xs font-mono px-1.5 py-0.5 rounded bg-muted`) e reutilizar nos 4 pontos acima.
- Nenhuma alteração de banco, RLS, regra de negócio, cálculo financeiro, impressão de contrato/carnê ou fluxo de inclusão/exclusão de dependentes. Puramente apresentação.

## Fora de escopo

- Wizard de criação de novo contrato (o autocomplete já mostra o prontuário durante a busca).
- Impressão do contrato / cartão / carnê — os textos impressos continuam iguais.
- Demais telas que exibem nome de paciente.

## Validação

- Build + typecheck.
- Conferir visualmente na tela do contrato mostrado na imagem (com titular real que tem `codigo_prontuario`) que a badge aparece nos 4 locais e que pacientes sem prontuário cadastrado não quebram o layout (badge é omitida quando o valor é `null`).
