## Problema
Na aba **Dados** do contrato, quando o admin troca o convênio pelo select `admConvenioId`, as **faixas de pessoas** (`cb_convenio_faixas`) continuam mostrando as do convênio original. Isso porque o `load()` só carrega faixas uma vez por `contrato.convenio_id`, e nada recarrega quando `admConvenioId` muda.

## Correção
Arquivo único: `src/components/pages/contratos-page.tsx`.

Adicionar um `useEffect` que, sempre que `admConvenioId` mudar (e for diferente do convênio atualmente carregado), refaz a consulta a `cb_convenio_faixas` para o novo convênio e atualiza o state `faixas`. O effect já existente que sincroniza `admFaixaId` com o `valor_mensal` continua funcionando, mas com o novo convênio a lista pode não conter nenhuma faixa cujo valor bata — nesse caso ele já cai para `faixas[0]`, o que é o comportamento desejado (a UI mostra as opções do novo convênio para o admin escolher).

Também garantir que, ao salvar em `salvarDadosAdmin`, o `valor_mensal` continue vindo da faixa escolhida quando o novo convênio tiver faixas — isso já acontece via `faixaEscolhida` (linha 1812), então nada muda.

## Validação
- Typecheck.
- Abrir um contrato existente → aba Dados → trocar convênio para outro que tenha faixas → confirmar que o select "Faixa de pessoas" aparece/atualiza com as faixas do novo convênio.
- Trocar para convênio sem faixas → confirmar que o select some e volta ao "Valor mensal" do convênio.

## Fora do escopo
- Não altero o fluxo de criação nem `regerarFuturas`.
- Não mexo no contrato cancelado (o usuário só precisa que futuros ajustes funcionem).