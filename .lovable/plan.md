## Problema

No cadastro/edição de benefícios do Cartão Convênio, o seletor **"Quando exceder, cobrar"** oferece a opção **"Aplicar regra padrão do convênio"**, mas o banco rejeita esse valor com o erro `cb_convenio_regras_limite_ck` (violação de CHECK). Isso faz aparecer o toast **"Configuração de limite inválida nesta regra…"** ao salvar.

Causa raiz: incoerência entre a UI (que oferece 5 opções) e a trava do banco (que só aceita 4: `percentual_particular`, `valor_fixo`, `particular`, `bloquear`). Além disso, nenhum consumidor da regra (agenda, aviso de limite) trata esse modo hoje.

## O que vai ser feito

Aplicar globalmente (todas as 3 clínicas), com semântica **"herdar da regra genérica do convênio"** conforme sua escolha.

### 1. Banco de dados — migration

- Recriar a constraint `cb_convenio_regras_limite_ck` incluindo `regra_padrao_convenio` na lista de valores válidos para `excedente_modo`.
- Atualizar o `COMMENT` da coluna descrevendo o novo modo.
- Sem alteração em dados existentes (apenas relaxa a trava). Aditivo, sem risco para regras já cadastradas.

### 2. Motor de aplicação da regra

Ajustar os dois pontos que hoje leem `excedente_modo` para tratar `regra_padrao_convenio` como fallback:

- **`src/routes/_authenticated/app.agenda.tsx`** (cálculo do valor da consulta quando o paciente excede o limite)
- **`src/lib/agenda/aviso-limite-pendentes.ts`** (texto do aviso mostrado ao operador)

Lógica de fallback:

1. Se `excedente_modo === 'regra_padrao_convenio'`, procurar entre as regras já carregadas do mesmo `convenio_id` uma regra **genérica** — sem `procedimento_id` e sem `especialidade_id` (regra "coringa" do convênio).
2. Se encontrar, usar o `excedente_modo` / `excedente_percentual` / `excedente_valor` dessa regra genérica no lugar.
3. Se **não** encontrar regra genérica, aplicar `bloquear` como fallback seguro (impede uso sem contrapartida definida) e registrar no aviso: "Regra padrão do convênio não configurada — bloqueado".

Nenhum outro consumidor usa esse campo hoje (validei com busca em `src/`).

### 3. UI — `src/components/cartao-beneficios/regras-tab.tsx`

- Manter a opção **"Aplicar regra padrão do convênio"** nos dois formulários (linhas 964 e 1424).
- Adicionar dica curta abaixo do Select quando esse modo estiver selecionado: *"Ao exceder, o sistema usa o excedente da regra genérica deste convênio (a que não especifica procedimento nem especialidade). Se não houver, o benefício é bloqueado."*
- Ocultar os campos "Percentual" e "Valor fixo" quando esse modo estiver selecionado (já são ocultados hoje para modos que não os usam — só preciso incluir o novo caso).

### 4. Tipagens

- Atualizar o comentário do tipo em `src/lib/cb-regras.ts` e `src/lib/agenda/aviso-limite-pendentes.ts` incluindo o novo modo.

## Validação após implementar

- Reabrir a regra de Mamografia do "Cartão Consulta + Seguros" (MENINO JESUS), selecionar "Aplicar regra padrão do convênio" e salvar → deve gravar sem erro.
- Simular na Agenda: paciente com limite estourado nessa regra → o valor cobrado deve refletir a regra genérica do convênio (ou bloqueio, se não houver).
- Sanity check: regras existentes com os 4 modos antigos continuam funcionando exatamente como antes (sem regressão).

## Fora de escopo

- Não altero dados existentes das regras.
- Não mexo em outros seletores do cadastro (Modo, Prioridade, Carência, Cortesia, Limite de uso, Grupo de gratuidade).
- Não crio regra genérica automaticamente para convênios que não tenham — se faltar, é o admin que cadastra (a UI vai avisar).
