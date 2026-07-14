# AGENTS.md — Regras permanentes para agentes

> Este arquivo define **regras invioláveis** para qualquer agente (humano ou IA)
> que atue neste repositório. Regras aqui têm prioridade sobre qualquer pedido
> pontual em chat.

## 1. Entendimento, comunicação e execução

Estas regras existem para reduzir retrabalho em um projeto com vários
colaboradores, prompts de qualidade variável e risco real de interpretação
errada. Elas se aplicam a qualquer alteração de código, UI, banco, regra de
negócio, documentação ou teste operacional.

### 1.1 Entendimento obrigatório do pedido

Antes de editar qualquer arquivo, o agente deve entender com clareza:

- qual problema o colaborador quer resolver;
- qual comportamento esperado depois da mudança;
- quais telas, fluxos, módulos ou arquivos estão no escopo;
- se o pedido é correção de bug, regra de negócio, erro de código/sintaxe,
  ajuste visual/UX, problema de dados, performance ou segurança.

Se o agente não entender o que deve ser corrigido, ele **deve perguntar ao
usuário antes de editar**. Se houver mais de uma interpretação plausível, deve
listar as opções de entendimento e pedir confirmação.

O agente nunca deve inventar regra de negócio. Quando não for possível separar
com segurança regra de negócio de erro técnico, deve dizer isso claramente e
pedir validação do time.

Frases padrão obrigatórias:

- Para incerteza técnica: "Não foi possível confirmar com segurança".
- Para comportamento funcional ambíguo: "Possível regra de negócio — validar
  com a equipe da clínica".

### 1.2 Explicação antes de qualquer alteração

Antes de alterar arquivos, o agente deve explicar em linguagem simples:

- o que vai alterar;
- por que vai alterar;
- quais arquivos, telas, fluxos ou tabelas podem ser afetados;
- o que deve mudar no comportamento do sistema;
- quais riscos ou dependências existem, quando houver.

Para mudanças pequenas e localizadas, essa explicação pode ser curta. Para
mudanças amplas, sensíveis ou com risco de impacto em produção, o agente deve
apresentar um plano antes da edição.

### 1.3 Resumo de antes e depois

Depois de qualquer alteração, o agente deve apresentar um resumo objetivo:

- **Antes:** como era o comportamento, problema ou limitação.
- **Depois:** o que passou a acontecer após a alteração.
- **Validação:** quais checagens foram executadas e qual foi o resultado.
- **Pendências:** o que não foi validado ou depende de confirmação humana.

O agente não deve dizer que algo foi corrigido se apenas aplicou uma tentativa
sem validação mínima. Quando a validação não for possível, deve dizer isso de
forma direta.

### 1.4 Controle de contexto e qualidade do prompt

Se o prompt for muito longo, misturar muitos problemas diferentes ou incluir
muitas imagens/evidências de uma só vez, o agente deve avisar que isso pode
reduzir a qualidade da análise e das modificações.

Nesses casos, o agente deve recomendar dividir o trabalho em partes menores e
sugerir uma ordem de execução. O agente não deve fingir alta confiança quando
o volume de contexto puder comprometer a precisão.

### 1.5 Classificação do tipo de pedido

Sempre que responder sobre uma correção ou alteração, o agente deve indicar,
em linguagem simples, se o pedido parece envolver:

- regra de negócio;
- erro de código ou sintaxe;
- erro visual ou de experiência do usuário;
- inconsistência de dados;
- permissão, segurança ou RLS;
- performance;
- integração externa;
- documentação ou organização.

Quando houver mistura de categorias, o agente deve separar o que é fato
observado no código, o que é interpretação e o que precisa de validação do
time.

### 1.6 Testes de fluxo em produção

Este projeto pode ser testado em ambiente de produção. Por isso, qualquer teste
de fluxo real exige cautela extra.

Se o usuário pedir uma simulação como estorno, cancelamento, baixa,
faturamento, agendamento, check-in, atendimento, repasse, cobrança ou outro
fluxo operacional, o agente deve:

1. explicar antes o que será simulado;
2. informar quais registros, módulos ou integrações podem ser impactados;
3. executar apenas o necessário para validar o fluxo;
4. usar dados rastreáveis e identificáveis como simulação sempre que possível;
5. apresentar um relatório claro do teste realizado;
6. remover ou desfazer a simulação ao final, sempre que isso for seguro e
   possível.

Se não for possível limpar ou desfazer a simulação com segurança, o agente
deve avisar isso **antes** de executar o teste e pedir confirmação explícita.

O agente nunca deve usar teste em produção como desculpa para criar dados sem
rastreabilidade, acionar integrações reais desnecessárias ou deixar resíduos
operacionais sem avisar.

### 1.7 Linguagem simples para o time

O agente deve explicar mudanças, riscos e resultados em linguagem simples do
dia a dia. Linguagem técnica deve ser usada apenas quando:

- o colaborador pedir explicitamente;
- a precisão técnica for necessária para evitar erro;
- o assunto envolver segurança, banco, permissão, infraestrutura, integração
  externa ou comportamento crítico.

Clareza tem prioridade sobre formalismo. A resposta deve ajudar o colaborador a
entender o impacto prático da mudança, não apenas os detalhes internos do
código.

### 1.8 Escopo, suposições e trabalho em equipe

Antes de mudanças relevantes, o agente deve deixar claro:

- o que está dentro do escopo;
- o que ficará fora do escopo;
- quais suposições foram feitas;
- quais arquivos ou áreas não serão tocados.

O agente deve preservar padrões existentes do projeto, evitar refatorações não
solicitadas e não misturar correção de bug com reorganização ampla sem
autorização.

Se perceber alterações de outros colaboradores, o agente deve trabalhar ao
redor delas. Não deve sobrescrever, apagar, reverter ou "limpar" trabalho alheio
sem pedido explícito.

### 1.9 Impacto em áreas críticas

Qualquer alteração que possa afetar agenda, financeiro, permissões, dados
clínicos, faturamento, prontuário, LGPD, auditoria, integrações ou produção
deve ser sinalizada explicitamente antes da execução.

O agente deve preferir mudanças pequenas, rastreáveis e reversíveis. Quando a
correção tiver risco de impacto operacional, deve propor validação antes de
ampliar o escopo.

---

## 2. Outras regras herdadas

As regras contidas em `mem/preferences/governanca.md`,
`mem/constraints/governanca-dados-imutaveis.md` continuam válidas e
complementam este arquivo. Em caso de conflito, prevalece a interpretação
**mais restritiva**.
