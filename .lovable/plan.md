## Diagnóstico (confirmado no banco)

**Paciente:** Ana Maria Miranda Alves — contrato ativo no convênio `CARTÃO CONSULTA` na clínica **Menino Jesus** (não SFP, apesar do print).
**Serviço:** TC CRANIO (Tomografia Computadorizada), agendamento `6c0d5bfa…`.

Verificado nas regras `cb_convenio_regras` do convênio:
- Especialidade **Tomografia Computadorizada** → **5%** (correto, prioridade 10).
- Existem outras regras de **10%** por especialidade: Raio-X, Mamografia, Laboratório.

O agendamento tem `especialidade_id = NULL` e `medico_id` apontando para o "médico placeholder" da unidade, que tem **52 especialidades** cadastradas (inclui Mamografia, Raio-X e Tomografia).

### Causa raiz

Em `src/routes/_authenticated/app.agenda.tsx` (linhas 490–498), a busca da regra faz:

```ts
for (const eid of espsTentativa) {
  const r = findRegra(regrasCb, eid, procedimentoTipo, procedimentoId);
  if (r) { regraMatch = r; break; }
}
```

O loop varre TODAS as especialidades do médico e para no **primeiro match**. Como o placeholder tem Mamografia (regra 10%) antes de Tomografia (regra 5%) na lista, o sistema aplica **10%** em vez de 5%. O mesmo padrão pode afetar qualquer procedimento cujo médico tenha múltiplas especialidades com regras diferentes.

### Escopo do impacto

Bug técnico global. Ocorre sempre que:
1. O agendamento não tem `especialidade_id` preenchida; **e**
2. O médico do slot tem várias especialidades cadastradas com regras de desconto diferentes no convênio.

Não é regra de negócio — é seleção incorreta de regra.

## O que vou alterar

**Frontend apenas** (`src/routes/_authenticated/app.agenda.tsx`, função de resolução de desconto do convênio):

1. Quando o `procedimentoId` for conhecido, consultar `procedimento_especialidades` para obter a(s) especialidade(s) **do próprio procedimento** e usar essas como preferência antes das do médico.
2. Trocar o `for … break` por uma coleta de todos os matches candidatos e escolher o **mais específico** com o critério já existente em `findRegra` (procedimento > especialidade > tipo > genérico; empate desempata por `prioridade`).
3. Manter o fallback atual (especialidades do médico + `null`) apenas quando a especialidade do procedimento não estiver cadastrada.

Sem mudanças em banco, em `cb-regras.ts`, no Caixa nem em regras de negócio.

## Validação

1. Reabrir o modal de pagamento da Ana Maria (TC CRANIO) — deve exibir `-5%`.
2. Simular outro procedimento com médico multi-especialidade para confirmar que a especialidade correta é escolhida.
3. Rodar a Agenda em consulta simples (fluxo `tipo=consulta`, valor_fixo) para garantir que não regrediu.

## Fora do escopo

- Nada de UPDATE em lote nos lançamentos históricos que já foram pagos com 10%. Se você quiser corrigir retroativos, me diga quais e faço caso a caso.
- Não vou preencher `especialidade_id` nos agendamentos antigos automaticamente.
- Não vou mexer no cadastro do "médico placeholder".

## Clínica-alvo

A correção é técnica (erro de seleção de regra), sem regra de negócio nova. **Confirma que posso aplicar globalmente** (Menino Jesus, SFP e Ergoclínica)? Se preferir restringir só à Menino Jesus, aplico via feature flag.
