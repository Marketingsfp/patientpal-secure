## Contexto

Voc\u00ea escolheu a op\u00e7\u00e3o **B** para o erro que aparecia no cadastro do paciente SERGIO GARRIER DOS SANTOS mesmo com o cadastro completo, e informou que o endere\u00e7o dele j\u00e1 foi salvo agora. A corre\u00e7\u00e3o deve valer para **as 3 cl\u00ednicas** (POLICL\u00cdNICA MENINO JESUS, POLICL\u00cdNICA S\u00c3O FRANCISCO DE PAULA e a terceira unidade), sem feature flag por cl\u00ednica.

## O que ser\u00e1 feito

1. **Reproduzir o erro atual** no fluxo do SERGIO (agora com endere\u00e7o preenchido) para confirmar se o problema desapareceu s\u00f3 com o endere\u00e7o ou se persiste alguma outra valida\u00e7\u00e3o bloqueando.
2. **Aplicar a corre\u00e7\u00e3o da op\u00e7\u00e3o B** de forma global (todas as cl\u00ednicas), sem criar `clinica_feature_flags` para isolar.
3. **Revalidar** repetindo a a\u00e7\u00e3o que gerava o erro (venda / contrato / NFS-e / agendamento \u2014 conforme o fluxo original) para o SERGIO e para um paciente de outra cl\u00ednica, garantindo que:
   - N\u00e3o aparece mais a mensagem de erro.
   - Os cadastros considerados "completos" passam a ser aceitos.
   - Nenhum outro fluxo dependente foi quebrado.
4. **Resumo antes/depois** com o que mudou, quais arquivos/regra foram tocados e o que ainda precisa de valida\u00e7\u00e3o humana.

## Antes de eu executar \u2014 preciso confirmar 2 pontos

Como a janela de hist\u00f3rico est\u00e1 parcial, quero evitar aplicar a corre\u00e7\u00e3o errada:

- **Qual era exatamente a op\u00e7\u00e3o B?** (por exemplo: "relaxar a valida\u00e7\u00e3o no backend", "tornar o campo opcional no formul\u00e1rio", "normalizar o dado antes de validar", etc.)
- **Em qual tela/fluxo o erro aparecia?** (Cadastro do paciente? Emiss\u00e3o de NFS-e? Gera\u00e7\u00e3o de contrato? Agendamento?)

Se voc\u00ea confirmar esses dois pontos (ou colar novamente o print do erro), sigo direto com a implementa\u00e7\u00e3o global e a revalida\u00e7\u00e3o \u2014 sem tocar em regras de neg\u00f3cio que n\u00e3o foram pedidas.
