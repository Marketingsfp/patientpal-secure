## Etapa B — exclusão definitiva de `planos_assinatura`

Aplicação: **global (3 clínicas)** — é limpeza técnica, sem regra de negócio nova.

### Vínculo com repasse: NÃO existe

Verifiquei no banco: `planos_assinatura` tem apenas nome, tipo, valor mensal, taxa de adesão, dependentes, fidelidade, vigência, parcelas, benefícios, template e ativo — **nenhum campo de repasse**.

O repasse do médico é calculado por outra via, já migrada: modalidade do convênio (`cb_convenios.modalidade` → cartão consulta / cartão desconto), regras por serviço em `medico_convenios` e o padrão do médico. Ou seja, excluir a tabela de planos **não afeta nenhum cálculo de repasse**. Nada a fazer nessa frente.

### O que precisa ser ajustado antes de excluir (descoberto agora)

Seis funções do banco ainda citam plano, e três delas usam **JOIN obrigatório** com `planos_assinatura` — se a tabela sumir sem ajuste, essas telas quebram:

- `contrato_publico` — link público do contrato (assinatura pelo paciente)
- `meus_cartoes` — portal do paciente (cartões)
- `pendencias_paciente` — pendências do paciente
- `contrato_dependentes_validar` — limite de dependentes
- `renovar_contrato_troca_plano` e `trocar_convenio_contrato` — copiam `plano_id` ao gerar o novo contrato

Observação importante: como o JOIN é obrigatório, hoje **contratos sem plano já não aparecem** nessas telas. Trocar para convênio na prática corrige isso.

### Passos

1. **Reconferência final** (no momento da execução): nenhum contrato com plano e sem convênio. Se aparecer algum, paro e reporto antes de seguir.
2. **Arquivo morto**: criar `planos_assinatura_arquivo` (cópia somente leitura do conteúdo atual, acessível só a administradores) — o CSV já foi exportado na Etapa A.
3. **Reescrever as 6 funções** para lerem nome/tipo/vigência/limite de dependentes de `cb_convenios` (via `convenio_id`), e parar de copiar `plano_id` nas rotinas de renovação/troca.
4. **Remover a coluna** `plano_id` de `contratos_assinatura` (derruba a chave estrangeira).
5. **Excluir a tabela** `planos_assinatura`.
6. **Código**: tirar `planos_assinatura` da lista da rotina de backup diário (`src/routes/api/public/hooks/backup-diario.ts`) e regenerar os tipos do banco.

Os passos 2–5 vão em **uma migração única aprovada por você**; os itens de código entram logo depois.

### Riscos e reversão

- Áreas sensíveis: link público de contrato, portal do paciente, renovação e troca de convênio. Mudança é de **origem do nome/tipo**, nenhum valor financeiro é tocado.
- Nenhum valor de Cartão Consulta é alterado (Regra 1.11).
- Reversão: pelo arquivo morto + CSV da Etapa A.

### Validação após aplicar

- Abrir um link público de contrato (um antigo e um recente) e conferir nome do convênio.
- Portal do paciente: aba de cartões.
- Renovar um contrato de teste e trocar convênio de um contrato de teste, conferindo que o novo contrato nasce correto.
- Adicionar dependente e conferir o limite.
- Rodar o backup diário e confirmar que não acusa tabela ausente.
