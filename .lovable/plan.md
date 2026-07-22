# Ajustes nas Regras dos Convênios (Cartão Benefícios)

## Análise (governança — 4 eixos)

- 💰 **Financeiro**: elimina risco de aplicar desconto de benefício sem repassar o custo real do cartão (taxas de máquina) → protege margem em pagamentos não-dinheiro.
- ⏱️ **Operacional**: uma única configuração por convênio substitui ter que cadastrar dois valores diferentes (dinheiro/outros) em cada regra.
- 😊 **Paciente**: valor apresentado no atendimento e no orçamento passa a refletir corretamente o preço final por forma de pagamento — sem surpresa no caixa.
- 🛡️ **Segurança**: mudança usa campos novos com default 0 (nenhum convênio existente muda de comportamento até o admin configurar).

## O que vai mudar

### 1. Remover botão "Apagar todas as regras"
Na aba **Benefícios → Regras** do convênio, o botão vermelho "Apagar todas as regras" (e o diálogo de confirmação) some. Excluir regra segue sendo possível linha a linha.

### 2. Novo acréscimo por convênio: "Valor de cartão com acréscimo de"
Um novo bloco aparece **logo abaixo do painel "Regras de preços automáticas"**, para **todos os cartões benefícios EXCETO o Convênio Funcionário** (mesma detecção já existente `isConvenioFuncionario`).

Campos:
- Tipo: **Percentual (%)** ou **Valor fixo (R$)** — mesmo padrão de switch usado nas outras regras.
- Valor: número (`%` ou `R$`, conforme o tipo).
- Botão **Salvar acréscimo**.

Comportamento:
- Toda vez que o benefício for aplicado e a forma de pagamento **não for dinheiro** (ou seja: PIX, débito, crédito ou qualquer outra), o sistema soma o acréscimo sobre o valor do benefício já calculado.
- Se a forma for **dinheiro**, o valor do benefício segue igual, sem acréscimo.
- Convênio Funcionário nunca aplica esse acréscimo (regra explícita do usuário).

Onde o acréscimo entra em ação (todos os pontos que já usam `computeValor`/`findRegra`):
- **Agenda** (`app.agenda.tsx`) — cálculo do valor no momento de agendar/pagar.
- **Catálogo de Procedimentos** (`app.procedimentos.tsx`) — pré-visualização e "Reaplicar regras a todos os serviços", gravando o acréscimo dentro de `procedimento_cb_convenio_valores.valor_outros`.
- Segunda via / comprovantes e demais telas que leem `valor_outros` continuam corretas porque o acréscimo é embutido no próprio `valor_outros`.

## Detalhes técnicos

### Banco (migration)
Adicionar em `public.cb_convenios`:
- `acrescimo_cartao_modo text` — `'percentual'` | `'valor_fixo'` | `null` (default `null` = desativado).
- `acrescimo_cartao_percentual numeric(10,2)` default `0`.
- `acrescimo_cartao_valor numeric(10,2)` default `0`.

Sem alteração de RLS/GRANT (tabela já configurada).

### Helper `src/lib/cb-regras.ts`
Adicionar tipo `CbAcrescimoCartao` e função utilitária:
```ts
applyAcrescimoCartao(valorOutros: number, acr: CbAcrescimoCartao | null): number
```
Retorna o próprio `valorOutros` quando `acr` é nulo ou o convênio é Funcionário. Uso em `computeValor` (nova assinatura opcional) e nos pontos que consomem `{ dinheiro, outros }`.

### UI `src/components/cartao-beneficios/regras-tab.tsx`
- Remover: `apagarTodasOpen`, `apagandoTodas`, função `apagarTodas`, botão (linha 558) e `<AlertDialog>` (linha 889).
- Novo componente `AcrescimoCartaoBox` renderizado após o cabeçalho de "Regras de preços automáticas" — só monta quando `!isConvenioFuncionario(convenioNome)`.
- Carrega/salva os 3 campos em `cb_convenios` (update simples pelo `convenioId`).

### Aplicação do acréscimo
- Nos cálculos que já resolvem `computeValor(...)`, encadear `applyAcrescimoCartao(out.outros, acr)`.
- Em `reaplicar()` (regras-tab): buscar `acr` do convênio uma vez e aplicar no `valor_outros` antes do upsert.

### Escopo
- Puramente **UI + regra de cálculo**; nenhuma mudança em fluxo financeiro (parcelas, repasse, NFS-e, caixa).
- Nenhum convênio existente sofre mudança até que o admin configure o acréscimo (default 0/null).

## Pontos que precisam da sua confirmação (regra 1.10 do AGENTS.md)

1. **Clínicas alvo**: a capacidade nasce disponível para as 3 clínicas (é código compartilhado), mas o valor do acréscimo é configurado por convênio. Confirmar: liberar o campo nas 3 clínicas (Menino Jesus, SFP e Sant Marché)? Sim/Não.
2. **Formas equivalentes a "não dinheiro"**: tratar **PIX, débito e crédito** todos como "cartão" para efeito do acréscimo? (Padrão do sistema já agrupa como `valor_outros`.) Sim/Não.
3. **Acréscimo em regras "Gratuito"**: se o benefício é cortesia (valor 0), o acréscimo do cartão fica **zerado também** (não cobrar acréscimo sobre 0). Concorda?
