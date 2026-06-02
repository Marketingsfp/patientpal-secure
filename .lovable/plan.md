## Objetivo

Cadastrar as regras do **CARTÃO CONSULTA + SEGUROS** extraídas do documento, aplicá-las a todos os serviços já existentes e fazer com que novos cadastros recebam os valores automaticamente (você ainda pode editar caso a caso).

## 1. Nova tabela `cb_convenio_regras`

Armazena as regras de preço por convênio. Estrutura:

- `convenio_id` → convênio (ex: Cartão Consulta + Seguros)
- `especialidade_id` (opcional) → ex: Cardiologia
- `tipo` (opcional) → consulta / exame / procedimento
- `modo` → `valor_fixo` ou `percentual_desconto`
- `valor` (numeric) → ex: 9.99
- `percentual` (numeric) → ex: 10 (significa 10% de desconto)
- `prioridade` (integer) → regra mais específica vence

Regra de aplicação: para cada (serviço × convênio), procura a regra de maior prioridade que casa com (especialidade, tipo). Se `valor_fixo`, define `valor_dinheiro = valor_outros = valor`. Se `percentual_desconto`, calcula `valor_dinheiro = base_dinheiro × (1 - %/100)` e `valor_outros = base_outros × (1 - %/100)` separadamente.

Migration cria a tabela com RLS (gerentes editam, membros leem) e índices.

## 2. Seed das regras do Cartão Consulta + Seguros

```text
Consultas clínicas (R$ 9,99 fixo)
  Angiologia, Cardiologia, Clínica Médica (Clinico Geral),
  Dermatologia, Endocrinologia, Gastroenterologia, Geriatria,
  Ginecologia, Ortopedia, Otorrinolaringologia, Obstetrícia,
  Pediatria, Urologia × tipo=consulta → R$ 9,99

Franquia R$ 60 (consultas)
  Psicologia, Nutrição × tipo=consulta → R$ 60,00

Franquia R$ 80 (consultas)
  Alergologia, Fonoaudiologia, Mastologia, Nefrologia,
  Neurologia, Oftalmologia, Pneumologia, Proctologia,
  Psiquiatria, Reumatologia × tipo=consulta → R$ 80,00
  (Cardiologia Infantil, Endocrinologia Infantil e Podologia
   serão criadas como especialidade se você confirmar — hoje
   não existem na base)

Exames com 10% de desconto
  LABORATORIO, RAIO-X, MAMOGRAFIA, DENSITOMETRIA OSSEA × tipo=exame
  + exames cujo nome contenha "PREVENTIVO" ou "ELETROCARDIOGRAMA"

Exames com 5% de desconto
  ODONTOLOGIA, ULTRASSONOGRAFIA, TOMOGRAFIA COMPUTADORIZADA,
  FISIOTERAPIA × tipo=exame
  + exames cujo nome contenha "RESSONANCIA", "ECOCARDIOGRAMA",
    "ELETROENCEFALOGRAMA", "ERGOMETRICO", "ENDOSCOPIA",
    "RPG" ou "ACUPUNTURA"
```

## 3. Aplicar agora aos serviços existentes

Script de bulk update: para cada serviço da clínica, calcula o valor pela regra e faz upsert na tabela `procedimento_cb_convenio_valores` (a que já criamos). Executa para todos os serviços do convênio Cartão Consulta + Seguros. Resultado imediato na coluna do convênio na tela de Serviços.

## 4. Auto-preenchimento ao cadastrar novo serviço

No formulário "Novo serviço" da tela de Serviços:

- Quando você escolhe a **especialidade** e o **tipo** (consulta/exame/procedimento), os campos do bloco "Valores por convênio" são preenchidos automaticamente pela regra.
- Mudar o valor base (Dinheiro / Pix·Déb·Créd) recalcula em tempo real os convênios baseados em percentual.
- Você ainda pode sobrescrever manualmente qualquer campo antes de salvar — o valor manual é respeitado.

## 5. Onde gerenciar as regras

Em **Cartão Benefícios > Convênios**, cada convênio ganha um botão "Regras de preço" que abre um modal/painel listando as regras existentes e permitindo:

- adicionar/editar/remover regras (especialidade, tipo, valor fixo ou %)
- botão "Aplicar a todos os serviços" para reprocessar em lote

## 6. Observações / pontos a confirmar

- O documento cita **Cardiologia Infantil**, **Endocrinologia Infantil** e **Podologia** que não existem hoje como especialidades. Posso criá-las junto com as regras, ou ignorá-las até você cadastrar.
- O documento também menciona benefícios que são **regras de uso** (carência, 1 consulta por dia, gratuidade após 6ª mensalidade, 1 exame anual, telemedicina a 50%). Esses **não entram** como valor de serviço — se quiser, faço uma seção posterior com elegibilidade/limites por contrato (precisaria criar entidades de contrato / mensalidade).
- Para o convênio **Cartão Consulta** e **Cartão Terapêutico**, faço o mesmo motor; basta me enviar os documentos correspondentes.

## Detalhes técnicos

- Migration: tabela `cb_convenio_regras` + função `apply_convenio_rules(clinica_id, convenio_id)` (Postgres) que reaplica as regras a todos os serviços.
- Frontend: hook `useConvenioRules(convenioId)` + helper `computeConvenioValor(servico, rules)` reutilizado no form e na tela de regras.
- Server function `recalcConvenioValores({ clinicaId, convenioId })` para o botão de bulk apply.
- Ordenação de prioridade: regra com `especialidade_id + tipo` (10) > só `especialidade_id` (8) > só `tipo` (5) > genérica (1).
