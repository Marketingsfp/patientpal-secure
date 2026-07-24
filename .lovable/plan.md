## Diagnóstico solicitado — desconto percentual na cobrança

**Escopo:** somente leitura no banco. Não alterei schema, código nem dados.

**Tipo do problema:** inconsistência de regra financeira/cobrança, com possível impacto na Agenda/Caixa e nos Cartões Benefícios.

## 1. Regras percentuais ativas

Consulta executada sobre `cb_convenio_regras` com `ativo = true` e `modo = 'percentual_desconto'`.

**Resultado consolidado:**

- Total de regras percentuais ativas: **54**
- Convênios com regras percentuais: **5**
- Regras com `limite_qtd` preenchido: **0**
- Regras com `percentual` nulo ou zero: **6**

**Por convênio:**

| convênio_id | regras | percentual vazio/zero | limite_qtd preenchido | menor % | maior % |
|---|---:|---:|---:|---:|---:|
| `04228b0d-942d-4902-a96c-60ff703dcaa9` | 5 | 0 | 0 | 10% | 40% |
| `36af070b-dad7-4013-b3e7-3ff343535c4f` | 17 | 0 | 0 | 5% | 10% |
| `4fdce541-5b2b-4816-ba7d-911b36741b7d` | 17 | 0 | 0 | 5% | 10% |
| `b019027f-fcd4-4e8b-8979-505f246b2043` | 10 | 6 | 0 | 0% | 50% |
| `b4a56318-13ae-4b5b-b099-1e64440bc3eb` | 5 | 0 | 0 | 10% | 40% |

**Regras problemáticas encontradas:**

As 6 regras com `percentual = 0` pertencem ao convênio **CONVÊNIO FUNCIONARIO**, todas vinculadas a procedimentos odontológicos:

- BLOCO DIRETO
- BLOCO EM ART GLASS
- BLOCO DE CEROMERO
- BLOCO EM RESINA
- BLOCO DE RMF
- BLOCO DE CERAMICA

Essas regras estão cadastradas como desconto percentual, mas com percentual zero. Na prática, elas aplicam **0% de desconto**.

## 2. Função `fila_caixa_hoje`

A definição atual da RPC foi lida com `pg_get_functiondef`.

**Confirmações:**

- Ela **aplica a fórmula percentual**:
  - dinheiro: `base_dinheiro * (1 - percentual / 100)`
  - cartão: `base_cartao * (1 - percentual / 100)`
- Ela **ignora regras que tenham `limite_qtd` definido**, porque filtra `rr.limite_qtd is null`.
- Ela faz o casamento do procedimento por **nome exato em maiúsculas**:
  - `pn.up_nome = upper(f.proc_nome)`
  - a base vem de `distinct on (upper(pp.nome))`

**Trecho confirmado:**

```sql
when rp.modo='percentual_desconto'
then round((b.base_dinheiro * (1 - coalesce(rp.percentual,0)/100.0))::numeric,2)

when rp.modo='percentual_desconto'
then round((b.base_cartao * (1 - coalesce(rp.percentual,0)/100.0))::numeric,2)
```

**Observação importante:** nomes como `CONSULTA (CARDIOLOGIA)`, `CONSULTA (GINECOLOGIA)`, `CONSULTA 2 (NEUROLOGIA)` e `RAIO-X` não encontraram procedimento por nome exato na consulta da fila. Nesses casos a RPC caiu como `particular` com base zerada, porque não conseguiu achar `procedimento_id` nem preço base.

## 3. Teste real com agendamento e contrato ativo

Usei um caso real em que a própria RPC retornou origem `convenio_regra` percentual.

**Agendamento testado:**

- Clínica: POLICLINICA MENINO JESUS
- Paciente: QUEDIMA SUELEN
- Data: 01/06/2026
- Procedimento: ECOCARDIOGRAMA (ADULTO)
- Convênio: CARTÃO CONSULTA + SEGUROS
- Contrato: ativo

**Preço particular do procedimento:**

| forma | particular | desconto | esperado | retornado pela RPC |
|---|---:|---:|---:|---:|
| dinheiro | R$ 152,00 | 5% | R$ 144,40 | R$ 144,40 |
| cartão | R$ 180,00 | 5% | R$ 171,00 | R$ 171,00 |

**Conclusão desse teste:** a RPC `fila_caixa_hoje` aplicou corretamente o desconto percentual nesse caso.

## 4. Contrato e mensalidades do teste

Contrato testado:

- Status: **ativo**
- Convênio: **CARTÃO CONSULTA + SEGUROS**
- Mensalidades pagas: **13**
- Mensalidades em atraso na data do agendamento: **0**
- Carência exigida pela regra: **2 mensalidades**

**Conclusão:** nesse caso, o paciente estava apto ao benefício e o desconto foi aplicado corretamente.

## Causa mais provável do valor total não bater

Pelo diagnóstico, a função de fila **não parece ser a causa principal quando o procedimento casa corretamente**: ela aplica `base * (1 - percentual/100)` corretamente.

Os pontos que explicam o desconto aparecer visualmente mas o total sair cheio ou errado são:

1. **Casamento por nome exato do procedimento**
   - A RPC depende de `upper(nome)` igual ao texto gravado no agendamento.
   - Procedimentos com sufixos, por exemplo `CONSULTA (CARDIOLOGIA)`, não casam com o cadastro base `CONSULTA`.
   - Quando não casa, a função não encontra `procedimento_id`, não encontra regra específica/especialidade e pode cair em valor particular/zerado.

2. **Possível diferença entre o valor visual e a origem usada na cobrança final**
   - A RPC retorna `valor` e `valor_cartao` com desconto quando encontra a regra.
   - Se a tela de pagamento recalcula usando o procedimento/preço particular em vez de usar o valor retornado pela fila, o desconto pode ficar apenas visual.
   - Isso precisa ser confirmado no código da cobrança, mas não alterei código nesta etapa.

3. **Regras percentuais com 0% no CONVÊNIO FUNCIONARIO**
   - Existem 6 regras ativas com `percentual = 0`.
   - Essas regras não dão desconto real, mesmo aparecendo como regra percentual.

4. **Atraso/carência pode impedir desconto em alguns casos**
   - A RPC exige `carencia_mensalidades <= mensalidades pagas`.
   - Vi vários agendamentos com mensalidades atrasadas, mas a função atual não bloqueia explicitamente por atraso; ela só considera carência por quantidade de mensalidades pagas.
   - Se a regra de negócio esperada é suspender por atraso, isso pode estar em outra parte do sistema ou não estar aplicado nessa RPC.

## Próximo passo recomendado, sem executar ainda

Se você aprovar uma etapa de correção depois, eu investigaria o código da tela de pagamento da Agenda/Caixa para confirmar se o botão de cobrança usa `fila_caixa_hoje.valor` / `valor_cartao` ou se recalcula pelo valor particular do procedimento.