## Objetivo

Permitir que cada regra de preço de um convênio (aba **Regras** dentro do lápis do convênio) tenha:

1. **Carência** — a partir de quando o desconto vale para o contrato do paciente:
   - Imediato (ao ativar o contrato)
   - Após a 2ª mensalidade paga
   - Após a 6ª mensalidade paga
   - (campo numérico livre — "após N mensalidades pagas" — cobre outros casos)
2. **Gratuito** — marcar a regra como cortesia (valor 0), aparecendo com destaque no sistema em vez de "R$ 0,00" solto.

Enquanto a carência não é cumprida, o sistema **não aplica o desconto do convênio** — cobra o valor particular normal (o paciente ainda pode fazer, só não ganha o benefício).

## Onde aparece

Tudo dentro do modal de edição do convênio → aba **Regras/Valores** (`regras-tab.tsx`), na mesma linha onde hoje ficam Especialidade / Categoria / Modo / Valor / Prioridade / Limite. Adicionamos duas colunas novas:

- **Carência**: select com "Imediato / 2ª mens. / 6ª mens. / Personalizado…"
- **Gratuito**: checkbox (quando marcado, zera o valor e trava o campo de valor)

Nenhuma mudança na tela geral de Benefícios nem em outras áreas de cadastro.

## Regras de negócio

**Carência (contador = mensalidades pagas do contrato):**
- `carencia_mensalidades = 0` → vale desde o dia da ativação.
- `carencia_mensalidades = N` → vale a partir do dia em que existirem N registros em `contrato_mensalidades` com `status = 'pago'` para aquele contrato.
- Contratos legados (`tabela_legada = true`) e contratos antigos sem mensalidades registradas passam pela mesma checagem — se não há mensalidade paga, a carência não foi cumprida.
- Contrato `cancelado` ou `suspenso` → benefício não vale, independente da carência.

**Gratuito:**
- Salva como `modo = "valor_fixo"`, `valor = 0`, mais um flag `gratuito = true` para o sistema exibir "Gratuito" na agenda / caixa / recibo em vez de "R$ 0,00".

**Onde a checagem roda:**
- `app.agenda.tsx` → `obterInfoConvenioPaciente` (já centraliza a lógica). Vai receber também o `contrato_id` e passar por um novo helper `avaliarCarencia(regra, contrato)` que consulta `contrato_mensalidades`.
- Se a carência **não** foi cumprida, a função retorna `avisoCarencia` + valor particular, análogo ao que hoje faz com `avisoLimite`.
- Caixa fila usa outra fonte hoje; **não** mexemos agora (mesma decisão que fizemos para limite de uso). Posso replicar depois se você quiser.

## Mudanças técnicas

### Banco (`cb_convenio_regras`)

Adicionar colunas:
- `carencia_mensalidades int` (default 0)
- `gratuito boolean` (default false)

Migração via ferramenta de migração (aprovação sua).

### Código

- `src/lib/cb-regras.ts` — adicionar `carencia_mensalidades` e `gratuito` na interface `CbRegra`; helper `avaliarCarencia(regra, mensalidadesPagas): boolean`.
- `src/components/cartao-beneficios/regras-tab.tsx` — 2 colunas novas na tabela + persistência no upsert.
- `src/routes/_authenticated/app.agenda.tsx` — dentro de `obterInfoConvenioPaciente`: buscar `count` de `contrato_mensalidades` pagas do contrato do paciente, aplicar `avaliarCarencia`, retornar `avisoCarencia` + preço particular quando não cumprida; exibir "Gratuito" quando `regra.gratuito`.

Nenhuma alteração no fluxo geral de benefícios (`cb_beneficios`) — o campo `inicio_a_partir` que já existe lá continua como está.

## Fora do escopo (posso fazer depois se pedir)

- Replicar checagem de carência no caixa fila.
- Carência baseada em **dias corridos** desde a ativação (hoje uso mensalidades pagas — mais fiel ao "após a 2ª mensalidade").
- Relatório de "benefícios bloqueados por carência".
