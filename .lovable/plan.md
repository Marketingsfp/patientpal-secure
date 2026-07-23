## Causa

A renovação do contrato do paciente **RODRIGO SABADIM SANTANA DA SILVA** falhou porque foi acionado o fluxo de **Renovar contrato atual** (extensão, mesmo convênio), que chama a função `renovar_contrato_extensao` no banco. Essa função tenta gravar o histórico da renovação usando nomes de coluna que **não existem** na tabela `contrato_renovacoes`.

Colunas reais da tabela: `contrato_id`, `contrato_novo_id`, `tipo`, `convenio_anterior_id`, `convenio_novo_id`, `valor_anterior`, `valor_novo`, `parcelas_geradas`, `periodo_inicio`, `periodo_fim`, `usuario_id`, `observacao`, `dependentes_incluidos`.

A função está tentando inserir em: `contrato_original_id`, `contrato_novo_id`, `tipo`, `periodo_inicio`, `periodo_fim`, `valor_mensal`, `num_parcelas`, `observacao`, `criado_por` — daí o erro `column "contrato_original_id" of relation "contrato_renovacoes" does not exist`.

Como a função roda numa única transação, o rollback desfez tudo (não gerou mensalidades, não atualizou `data_fim`), o número do contrato continua o mesmo (o fluxo de extensão nem cria contrato novo — apenas prorroga o atual, exatamente como você quer).

O fluxo de "Troca de convênio" (`renovar_contrato_troca_plano`) já usa os nomes corretos e não é afetado.

## Correção proposta

Uma única migração ajustando **apenas o INSERT final** da função `renovar_contrato_extensao` para usar as colunas corretas:

- `contrato_original_id` → `contrato_id`
- `valor_mensal` → `valor_novo` (e preencher também `valor_anterior` com `v_contrato.valor_mensal`)
- `num_parcelas` → `parcelas_geradas`
- `criado_por` → `usuario_id`
- Incluir `clinica_id` (obrigatório na tabela) e `convenio_anterior_id` / `convenio_novo_id` iguais (é o mesmo convênio, é uma extensão)

Nenhuma outra lógica da função é alterada: continua prorrogando o mesmo contrato, mantendo o **mesmo número**, gerando novas 12 parcelas a partir do dia de vencimento, tratando dependentes e taxa de inclusão exatamente como hoje.

Aplica em todas as 3 clínicas (é correção puramente técnica de coluna; sem regra de negócio nova). Após aplicar, refaço a renovação do contrato do RODRIGO para validar.

## Escopo

- Dentro: migração corrigindo o `INSERT INTO contrato_renovacoes` dentro de `renovar_contrato_extensao`.
- Fora: nada de frontend, nada em `renovar_contrato_troca_plano`, nada na estrutura da tabela `contrato_renovacoes`.
