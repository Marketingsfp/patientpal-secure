# Integração Health Hub Pro ↔ PoliCardMed — levantamento técnico

Levantado em 30/08/2026. **Somente leitura — nada foi alterado em nenhum dos dois bancos.**

---

## Resumo em uma página

O sistema satélite **já existe**: é o projeto Lovable `polycare-plus-hub`
(PoliCard+ Health Hub), com **banco de dados próprio e separado** do sistema da
clínica. Hoje ele tem 44 associados e 43 contratos de teste; o sistema principal
tem **1.882 contratos ativos e 19.211 mensalidades reais**. Não são dois sistemas
equivalentes: é um sistema em produção e um protótipo.

Os dois modelam o cartão de formas **incompatíveis**. Não existe caminho de
"ligar um no outro" sem escolher, dado por dado, quem manda.

**Recomendação:** API REST com dono único por dado, reaproveitando a
infraestrutura de integração que **já está construída e funcionando** no sistema
principal (`/api/public/integrations/v1`). O sistema principal continua dono de
contrato, titular, dependente e mensalidade; o satélite lê isso e é dono só do
que é exclusivo dele (score, cashback, saldo saúde, crédito, campanhas, Asaas).
A recepção não digita nada duas vezes.

**Existe um bloqueio a resolver antes de qualquer sincronização:** 50% dos
titulares ativos não têm CPF válido no cadastro. O CPF não pode ser a chave de
ligação entre os dois sistemas.

---

## 1. Como o cartão está modelado hoje no sistema principal

### 1.1 As tabelas, com o volume real de produção

| Tabela | Linhas | O que guarda |
|---|---:|---|
| `contratos_assinatura` | 1.991 (1.882 ativos) | O contrato do titular. É o "cartão". |
| `contrato_dependentes` | 723 (685 ativos) | Dependentes e agregados do contrato. |
| `contrato_mensalidades` | 19.211 (16.397 em aberto) | Parcela a parcela, com vencimento, status e pagamento. |
| `contrato_renovacoes` | — | Histórico de renovação, extensão e troca de plano. |
| `cb_convenios` | 8 | Os produtos do cartão (o que a gestão chama de "plano"). |
| `cb_convenio_regras` | **244** | O preço de cada benefício: por especialidade ou procedimento, com limite de uso, carência, gratuidade e regra de excedente. |
| `cb_convenio_valores` / `cb_convenio_faixas` | — | Mensalidade por número de dependentes / por faixa de vidas. |
| `procedimento_cb_convenio_valores` | — | Preço de exame específico dentro do convênio. |
| `planos_assinatura` | **0** | Tabela legada. Está vazia em produção. |
| `cartoes_convenio` | — | Tabela antiga de desconto percentual. Legado. |

### 1.2 Três coisas que precisam ficar claras para a gestão

**a) Não existe uma tabela "cartão".** O cartão é a combinação
`contrato_assinatura` + `cb_convenio`. Não há número de cartão, QR Code, validade
nem via impressa no banco — o cartão físico é gerado na impressão
([print-cartao.ts](src/lib/print-cartao.ts)) a partir do contrato. O satélite tem
uma tabela `policard_cartoes` com número, QR e token: **esse conceito não existe
no sistema principal e teria que ser criado.**

**b) O preço não está no cartão, está nas 244 regras.** Quem decide quanto o
paciente paga é [info-convenio-paciente.ts](src/lib/convenio/info-convenio-paciente.ts)
(1.339 linhas), lendo `cb_convenio_regras`. Essa é a peça mais delicada do
módulo: ela é usada tanto na Agenda quanto no Caixa, e já houve divergência entre
as duas no passado. Qualquer integração que tente recalcular preço do lado de
fora vai divergir do balcão.

**c) "Em dia" ou "inadimplente" é calculado na hora, não é um campo.** A regra
está em [cb-regras.ts](src/lib/cb-regras.ts): parcela vencida há mais de **5 dias
corridos** bloqueia o convênio; dentro dos 5 dias o cartão funciona normalmente.
A coluna `status` de `contratos_assinatura` **não** reflete isso. Um sistema
externo que ler a coluna `status` vai classificar gente errada.

### 1.3 O quanto o módulo está entranhado no resto do sistema

O cartão é lido por **48 arquivos** fora do próprio módulo: Agenda, Caixa,
Financeiro, Movimento de Caixa, Odontologia, Boletos, NFS-e, cálculo de repasse
médico, impressões (carnê, contrato, GR, cartão), Painel Executivo, Clientes,
convênio de funcionário e convênio de médico.

Consequência prática: **o módulo de cartão não é destacável.** Tirar a fonte da
verdade dele de dentro do sistema principal quebraria o preço no balcão.

---

## 2. Os caminhos técnicos possíveis

Antes das opções, o retrato do satélite (consultado no banco dele em 30/08):

- 96 tabelas, banco Supabase **separado**;
- 44 associados, 43 contratos, **1 dependente, 1 cartão, 4 parcelas**;
- várias tabelas centrais ainda vazias (`beneficio_regra`, `beneficio_uso`,
  `asaas_charges`, `contratos_associados`);
- flags `is_homologacao` / `ambiente` espalhadas — ou seja, é ambiente de teste;
- modelo próprio: `associates`, `contrato_adesao`, `policard_*`, `plano_catalogo`,
  `units` (MJ / SFP / CH), `movements`;
- conceitos que **não existem** no sistema principal: saldo saúde, cashback,
  score, crédito interno, cobrança via Asaas, multi-unidade.

### Opção A — compartilhar o mesmo banco / schema Supabase

**Não recomendo.** Motivos concretos:

1. São dois projetos Lovable com bancos distintos. Unir significa migrar um dos
   dois — na prática, mover 252.338 pacientes e todo o histórico clínico.
2. Dar ao satélite acesso ao banco da clínica é dar acesso a prontuário, exame e
   agenda. O RLS separa por clínica, **não separa por módulo**: uma chave válida
   no banco enxerga muito além do cartão. Isso contraria a regra já adotada no
   projeto de nunca expor dado de saúde fora do necessário, e é exposição
   desnecessária sob a LGPD.
3. O satélite tem 96 tabelas com nomes que colidem conceitualmente
   (`especialidades`, `medicos`, `profiles`, `user_roles`, `audit_log`,
   `whatsapp_templates` existem nos dois, com colunas diferentes).

### Opção B — replicação bidirecional (webhook nos dois lados gravando no outro banco)

**Não recomendo como primeira etapa.** Sincronização bidirecional de verdade
significa dois sistemas donos do mesmo dado. Em mensalidade isso produz cobrança
duplicada — e o módulo **já tem histórico disso**: o levantamento
[CARTAO-6-CASOS-COBRANCA-DUPLA-2026-08-27.md](CARTAO-6-CASOS-COBRANCA-DUPLA-2026-08-27.md)
documenta 85 pessoas com dois contratos ativos e 6 delas cobradas em duplicidade,
com uma única fonte de escrita. Com duas fontes, o problema multiplica.

Bidirecional só é seguro depois de resolvido "quem manda em cada campo" — que é
justamente o que a Opção C define.

### Opção C — API REST com dono único por dado ✅ recomendada

O sistema principal **já tem a infraestrutura pronta**, construída em agosto e em
uso: [api.server.ts](src/lib/integracoes/api.server.ts) e
[agendamentos-v1.server.ts](src/lib/integracoes/agendamentos-v1.server.ts),
publicados em `/api/public/integrations/v1/*`. Já funcionam hoje:

- autenticação por chave de API com hash SHA-256 no banco (`integracao_api_keys`);
- escopos por chave (`exigirEscopo`);
- limite de chamadas por minuto e por dia (`integracao_rate_limit`);
- idempotência de POST via cabeçalho `Idempotency-Key` (`integracao_idempotencia`)
  — é exatamente o mecanismo que impede cobrança dupla por reenvio;
- log de todas as requisições (`integracao_requisicoes`);
- toda escrita passa pelos mesmos núcleos que as telas usam, então a API nunca
  calcula preço por conta própria.

Hoje existe **1 chave cadastrada**, de homologação, com escopos de agenda. O
trabalho é acrescentar recursos do cartão a essa mesma API — **não construir uma
integração nova do zero.**

---

## 3. Recomendação

### 3.1 Quem é dono de quê

| Dado | Dono | O outro lado |
|---|---|---|
| Contrato, titular, dependente | **Health Hub Pro** | PoliCardMed lê |
| Mensalidade e baixa de pagamento | **Health Hub Pro** | PoliCardMed lê e propõe baixa |
| Preço / regra de benefício (244 regras) | **Health Hub Pro** | PoliCardMed nunca recalcula |
| Score, cashback, saldo saúde, crédito | **PoliCardMed** | Health Hub Pro só exibe, se quiser |
| Campanhas, NPS, Asaas, B2B | **PoliCardMed** | não sincroniza |

Regra de ouro: **o balcão continua sendo a única boca de entrada.** A recepção
cadastra contrato e recebe mensalidade exatamente onde já faz hoje. Zero
retrabalho — é o critério que a gestão pediu.

### 3.2 O que construir, em ordem

**Etapa 1 — leitura (a maior parte do valor, o menor risco)**

Novos escopos na API existente:

- `contracts:read` → `GET /contracts`, `GET /contracts/{id}`
- `members:read` → titulares e dependentes de um contrato
- `billing:read` → parcelas, com o campo `situacao` já calculado pela régua dos
  5 dias (`paga` / `a_vencer` / `inadimplente` / `cancelada`), para o satélite
  **nunca** ter que reimplementar a regra

Com isso o PoliCardMed monta dashboard, ranking por unidade, inadimplência e
relatórios sem escrever nada.

**Etapa 2 — aviso de mudança (webhook de saída)**

O sistema principal avisa o satélite quando muda algo: contrato criado,
cancelado, renovado; parcela paga. Evita o satélite ficar varrendo a API.

**Etapa 3 — escrita, só depois das duas anteriores estáveis**

- `billing:write` → o satélite informa um pagamento recebido por ele (Asaas/PIX),
  obrigatoriamente com `Idempotency-Key`, e a baixa é feita pelos mesmos núcleos
  do Financeiro. **Atenção:** pagamento recebido fora do balcão não pode entrar na
  gaveta do caixa do dia — vale a mesma regra já adotada para lançamento
  retroativo.

### 3.3 O bloqueio que precisa ser resolvido antes

**Qual campo liga o mesmo paciente nos dois sistemas?** O satélite usa CPF
(`associates.cpf`). Conferi no banco de produção do sistema principal:

- **942 de 1.882 titulares ativos (50%) estão sem CPF válido**
- **109 de 685 dependentes ativos** sem CPF válido
- **14 CPFs duplicados** entre pacientes

Casar por CPF hoje deixaria metade da base de fora e criaria vínculos errados nos
duplicados. **Solução recomendada:** o satélite guarda o `id` (UUID) do contrato e
do paciente do sistema principal como identificador externo — é o padrão
`id_externo` que a API v1 já usa para agendamentos. O CPF fica como dado de
conferência, não como chave.

Isso não impede a Etapa 1 de começar; impede a Etapa 3.

### 3.4 Duas observações para a gestão

- `planos_assinatura` está **vazia em produção**. O conceito de "plano" hoje vive
  em `cb_convenios` (8 produtos) + `cb_convenio_regras` (244 regras). O satélite
  modelou `plano_catalogo`/`plans` com 10 planos que não correspondem aos 8 do
  sistema real — precisa de um de-para antes de qualquer carga.
- O satélite tem 3 unidades (MJ, SFP, CH). O sistema principal tem **1 clínica**
  cadastrada. Se a ideia é operar as três unidades no cartão, essa decisão é
  anterior à integração e muda bastante o escopo.

---

## Anexo — origem dos números

Todos consultados em 30/08/2026 via MCP do Lovable, somente `SELECT`:

- Health Hub Pro (`patientpal-secure`, projeto `9cab2db5…`): contagens das
  tabelas do módulo, cobertura de CPF e duplicidade.
- PoliCard+ (`polycare-plus-hub`, projeto `76ba98c6…`): lista de 96 tabelas do
  schema `public`, contagem de linhas e colunas de `associates`,
  `contrato_adesao`, `policard_cartoes` e `units`.
- Acoplamento do módulo: varredura do repositório por referências a
  `contratos_assinatura`, `contrato_mensalidades`, `cb_convenios` e
  `paciente_cartao_status`.
