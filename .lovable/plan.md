## Situação atual

Há três submenus no grupo **Cadastros** que se sobrepõem:

| Menu | Rota | O que faz |
|---|---|---|
| Equipe | `/app/equipe` | Cadastra usuário do sistema (nome, email, senha, função) — só login |
| Funcionários | `/app/hr-contratos` | Cadastra contrato (cargo, setor, salário, admissão) + opção "criar login" |
| Médicos | `/app/medicos` | Cadastra médico (CRM, especialidades, repasses, convênios) + opção "criar login" |

## Mudanças propostas

### 1. Menu lateral (`app-shell.tsx`)
- Manter apenas **Equipe** no grupo Cadastros.
- Remover **Funcionários** e **Médicos** do menu.
- As rotas `/app/medicos` e `/app/hr-contratos` continuam existindo (links internos e edição funcionam normalmente).

### 2. Tela `/app/equipe` (reformulada)
Vira o hub único da equipe com **duas abas**:

- **Aba "Funcionários"** — lista atual de `hr-contratos` (mesmas colunas e ações de editar).
- **Aba "Médicos"** — lista atual de `medicos` (mesmas colunas e ações).

Um único botão **"+ Novo cadastro"** no topo abre um diálogo de escolha:

```text
┌─ O que você quer cadastrar? ─┐
│  [ 👤 Funcionário ]          │
│  [ 🩺 Médico       ]          │
└──────────────────────────────┘
```

- Clicar em **Funcionário** → abre o formulário de funcionário (mesmo de hr-contratos hoje, com opção "criar login do sistema").
- Clicar em **Médico** → abre o formulário de médico (mesmo de medicos hoje, com opção "criar login do sistema").

A criação de usuário/login do sistema continua acontecendo dentro de cada formulário (já existe o checkbox "criar login" nos dois).

### 3. Tela atual de Equipe (cadastro simples de login)
- O formulário antigo "Cadastrar usuário" (só nome/email/senha/função) **será removido**, pois agora todo login nasce vinculado a um Funcionário ou Médico.
- A aba "Funcionários" da nova Equipe permite editar função e ativar/desativar acesso, cobrindo o que a tela antiga fazia.

### 4. Comando de voz e busca
- "equipe", "usuário", "médico", "funcionário", "profissional" → todos passam a abrir `/app/equipe`.

## Fora de escopo
- Estrutura de banco (tabelas `medicos`, `hr_contratos`, `clinica_memberships` permanecem como estão).
- Lógica de repasse, convênios, cargos, setores.
- Tela de Perfis/Permissões.

## Confirmar antes de implementar
- Tudo OK assim? Ou prefere alguma variação (ex.: manter o cadastro avulso de login dentro da Equipe como terceira opção "Apenas acesso ao sistema")?
