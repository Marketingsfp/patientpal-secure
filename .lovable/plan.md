## Objetivo
Cadastrar descontos automáticos de funcionário (titular + dependentes) reaproveitando 100% o motor do **Cartão Benefícios**, sem código novo de regra de negócio.

## Como funciona (linguagem simples)
- Criamos **um convênio chamado "Funcionário"** em cada clínica (SFP, Menino Jesus, Ergoclínica).
- Esse convênio já suporta cadastrar descontos **por serviço, por especialidade ou por categoria/tipo**, em **percentual ou valor fixo** — é a mesma tela de **Cartão Benefícios → Regras** usada hoje.
- Cada funcionário vira um **contrato** desse convênio, com dependentes vinculados. Quando o paciente (titular ou dependente) for atendido, o sistema já busca as regras do convênio automaticamente na Agenda / no Pagamento e aplica o desconto.
- **Sem carência e sem mensalidade**: o convênio nasce com `valor_mensal = 0`, `taxa_adesao = 0`, `num_parcelas = 0`, `fidelidade_meses = 0`, e o contrato entra com carência isenta.

Vantagem: nada quebra em outros módulos (Agenda, Pagamento, Estorno, NFS-e). Já testado — é o mesmo caminho de qualquer convênio.

## O que eu vou fazer

### 1. Migration (cria a base nas 3 clínicas)
- Inserir 1 registro em `cb_convenios` por clínica com nome "Funcionário", ativo, sem mensalidade, sem carência, sem taxa de adesão.
- Sem alteração de schema — só dados de configuração.

### 2. Ajuste mínimo no fluxo de novo contrato
- No cadastro de contrato do convênio "Funcionário", pular a geração de mensalidades (já acontece hoje quando `num_parcelas = 0`, mas confirmo por segurança).
- Marcar automaticamente `carencia_isenta = true` para todo contrato desse convênio, com justificativa "Convênio de funcionário".

### 3. Cadastro das regras (sem código)
- Cada clínica entra em **Cartão Benefícios → Convênio "Funcionário" → Regras** e cadastra os descontos que já pratica:
  - por serviço específico (ex.: TC Crânio 50%),
  - por especialidade (ex.: Cardiologia 30%),
  - por categoria/tipo (ex.: Consulta 100%, Imagem 40%).
- Regras podem ser percentual **ou** valor fixo — o motor já resolve especificidade (serviço > especialidade+tipo > especialidade > tipo).

### 4. Vincular funcionários
- Na tela de contratos, criar o contrato do funcionário como titular do convênio "Funcionário" e adicionar cônjuge/filhos como dependentes. Isso já existe hoje.

## O que NÃO muda
- Motor de cálculo (`findRegra` / `computeValor` em `src/lib/cb-regras.ts`) permanece intacto.
- Agenda, Pagamento, Estorno e Repasse continuam iguais.
- Cartão Benefícios comercial dos pacientes normais não é afetado.

## Impacto (4 eixos)
- 💰 **Financeiro**: descontos padronizados, rastreáveis, sem risco de a recepção esquecer ou aplicar percentual errado.
- ⏱️ **Operacional**: recepção não precisa lembrar do desconto — sistema aplica sozinho ao selecionar o funcionário no atendimento.
- 😊 **Experiência**: funcionário e dependentes atendidos sem fricção, mesmo desconto todo mês.
- 🛡️ **Auditoria**: cada aplicação de desconto fica registrada no lançamento com o `cb_convenio_id` — auditável em qualquer relatório.

## Riscos
- Baixos. É a mesma trilha já validada do Cartão Benefícios; a única diferença é `valor_mensal = 0`.
- Um funcionário que já tenha Cartão Benefícios comercial poderia ter **2 contratos** — combinamos: prevalece a regra do "Funcionário" quando for o mesmo paciente (posso implementar preferência por nome do convênio se você quiser, mas não é obrigatório na entrega inicial).

## Pendências para você confirmar antes de eu executar
1. Nome exato do convênio nas 3 clínicas: **"Funcionário"** ou prefere outro (ex.: "Colaborador", "Equipe")?
2. Posso já criar o convênio nas 3 clínicas na mesma migration ou você quer testar antes só em uma?
3. Regras iniciais (percentuais e valores) você quer cadastrar pela tela ou me passa uma planilha e eu carrego direto no banco?