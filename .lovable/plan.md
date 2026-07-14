# Diagnóstico e correção — procedimentos do Dr. Samuel

## Antes de qualquer coisa: os dados NÃO foram perdidos

Consultei o banco: o Dr. Samuel José Souza (POLICLÍNICA MENINO JESUS) tem **27 procedimentos vinculados**, todos ativos, todos com `grupo = ULTRASSONOGRAFIA` — exatamente a especialidade cadastrada para ele. A auditoria (`audit_log`) não registra nenhuma remoção em `medico_procedimentos` para este médico.

**Não é necessário "restaurar de versão antiga"**. Restaurar por cima causaria duplicidade e risco.

## Causa provável do "sumiço" visual

Na aba **Procedimentos** do cadastro do médico (`src/components/medicos/MedicoFormDialog.tsx`), existe um `useEffect` (linha 235) que **filtra automaticamente** os procedimentos exibidos, deixando somente os que "batem" com as especialidades selecionadas. Esse filtro tem uma condição de corrida:

- Ele roda assim que a lista de procedimentos (`procs`) carrega.
- Mas não espera a lista de especialidades (`esps`) chegar.
- Se `procs` chega antes de `esps`, o conjunto `especialidadesSelecionadasNomes` fica vazio, o filtro considera "nenhum procedimento válido" e a tela mostra **"Nenhum serviço selecionado"** — mesmo com os 27 vínculos no banco.

Em outras palavras: os procedimentos **existem**, mas a tela mostra vazio por uma condição de carregamento.

## Riscos importantes

- Se o usuário clicar em **Salvar** enquanto a tela está mostrando vazio por causa desse bug, o código de save (linhas 658–701) faz `DELETE` de todos os `medico_procedimentos` do médico e depois `INSERT` só do que estiver no formulário → **os 27 registros seriam apagados de verdade**. Precisamos corrigir antes que isso aconteça.

## O que vou alterar

**Arquivo:** `src/components/medicos/MedicoFormDialog.tsx`

**Mudança 1 — proteger o filtro contra condição de corrida (linha ~235):**
Só rodar o filtro de "remover procedimentos que não batem com a especialidade" quando **as duas listas** (`procs` e `esps`) estiverem carregadas E o formulário já tiver sido populado com as especialidades. Enquanto qualquer uma dessas condições estiver pendente, não mexer em `form.procedimentos`.

**Mudança 2 — proteção extra no save (linhas ~658 e ~691):**
Se, no momento de salvar, o formulário tiver 0 procedimentos mas o médico já tinha vínculos no banco, exibir uma confirmação: *"Você está prestes a remover todos os X procedimentos deste médico. Confirma?"*. Isso protege contra qualquer bug futuro similar.

## Validação após a correção

1. Abrir o cadastro do Dr. Samuel → aba **Procedimentos** → conferir se aparecem os 27 procedimentos USG.
2. Conferir na tela de agendamento que o picker de procedimento continua listando as opções dele.
3. Rodar `SELECT COUNT(*) FROM medico_procedimentos WHERE medico_id = ...` antes e depois para garantir que nada foi tocado no banco.

## Fora do escopo

- Não vou mexer nas 27 linhas existentes no banco (não precisa).
- Não vou alterar o comportamento do filtro por especialidade em si — só a proteção contra rodar antes da hora.
- Não vou refatorar a aba Procedimentos além do necessário para o fix.

## Perguntas antes de executar

Nenhuma bloqueante. Só confirme se posso prosseguir com esses dois ajustes.
