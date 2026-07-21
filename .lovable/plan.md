## Objetivo
Permitir selecionar vários serviços de uma vez ao adicionar exceções (sem desconto) no convênio FUNCIONARIO.

## Clínica-alvo
Confirmar: aplicar em **todas as clínicas** (SFP, Menino Jesus, Ergoclínica) já que o convênio FUNCIONARIO existe nas três? Assumo que sim — o comportamento é o mesmo do convênio interno.

## Escopo
Apenas o bloco "Exceções (sem desconto)" em `src/routes/_authenticated/app.cartao-beneficios.convenios.tsx`.

## Mudanças
1. Trocar o `Select` de serviço único por um seletor de **múltipla seleção** com busca:
   - Campo de busca (mesma UX atual).
   - Lista com checkbox por serviço.
   - Contador "N selecionado(s)" no botão.
2. Botão "Adicionar exceção" → "Adicionar exceções (N)":
   - Cria uma regra `cb_convenio_regras` (percentual=0, prioridade=999) por serviço selecionado, em lote.
   - Ignora serviços que já possuem exceção cadastrada (evita duplicidade).
   - Toast final: "X exceções adicionadas" (e, se houver, "Y já existiam").
3. Limpar seleção após o insert e recarregar a lista.

## Fora do escopo
- Regras normais (bloco "Regras" continua com adição individual).
- Motor de cálculo (não muda).
- Outras clínicas/convênios (comportamento restrito ao FUNCIONARIO, como já está).

## Riscos
Baixo — apenas UI + inserts em lote na mesma tabela já usada. Sem migration.