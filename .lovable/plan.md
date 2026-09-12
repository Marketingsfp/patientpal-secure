# Correção assistida por GPT-5.6 Sol no fluxo de erros da Nina

## Objetivo

No mesmo cartão do erro reportado: **Analisar com IA** → ver diagnóstico + proposta concreta de mudança + alcance → **Aplicar correção** (um clique = autorização) → acompanhar aplicação, teste e publicação → ver o que mudou, por que mudou e qual teste comprovou.

## Um limite que precisa ficar claro antes

O sistema em execução **não tem acesso ao repositório de código nem ao deploy**. Então o executor técnico só consegue corrigir de verdade o que é **configuração viva no banco**:

| Camada da causa | O executor corrige de verdade? |
| --- | --- |
| Informação oficial errada/faltando (catálogo) | Sim — edita o registro e publica |
| Prompt / regra de comportamento (Arquitetura) | Sim — grava rascunho e publica a versão |
| Resposta automática / mensagem rápida | Sim — edita o template |
| Busca, ferramenta/integração, fluxo em código | Não — vira ação técnica rastreável com a mudança proposta escrita |

Nada de botão que grava sugestão e diz "corrigido": quando a camada não é aplicável, a tela diz exatamente isso, com a proposta pronta para quem tem acesso ao código.

## Fluxo novo (mesma tela, `Nina · Aprendizado`)

1. **Analisar com IA** (avaliador, como hoje, sem escrita) passa a devolver também, no mesmo JSON: camada responsável, proposta de mudança concreta (valor atual → valor novo, ou trecho de prompt), alcance (quais clínicas/conversas), e se é aplicável automaticamente.
2. O cartão mostra diagnóstico + proposta + alcance juntos. Sem classificar/diagnosticar/aprovar em etapas separadas.
3. **Aplicar correção** executa a proposta exibida. Sem segunda cadeia de confirmação.
4. Painel de acompanhamento no próprio cartão: preparando → aplicando → testando → publicando → concluído (ou falhou, com motivo).
5. Resultado final: diff (antes/depois), justificativa, versão publicada e o teste que comprovou.

## Executor técnico (papel separado do avaliador)

Novo arquivo `src/lib/nina/correcao-executor.ts` + `correcao-executor.functions.ts`:

- Mesmo modelo `openai/gpt-5.6-sol`, mesma Responses API do avaliador, mas **com ferramentas reais**, e só iniciado pelo clique autorizado.
- Ferramentas ligadas aos serviços que já existem: ler catálogo, gravar item do catálogo, publicar catálogo, ler versão da Arquitetura, gravar rascunho, publicar versão, ler/gravar mensagem rápida, rodar o turno de teste no console de homologação.
- Cada chamada de ferramenta passa pela mesma checagem de permissão de hoje (`nina_fb_pode_revisar`) e pelo `clinica_id` do erro. Uma proposta sobre a camada X não consegue chamar ferramenta da camada Y.
- Todo conteúdo vindo de paciente, comentário, prompt antigo ou resultado de ferramenta entra como **dado** no pacote, dentro dos delimitadores já usados pelo avaliador; instrução embutida nesses dados não vale.
- Identidade da Arquitetura (nome da atendente, estabelecimento, tipo) é protegida: alteração desse bloco é recusada pela ferramenta.

## Teste que comprova

Antes de publicar, o executor reexecuta a **mesma pergunta do erro** no console de homologação (lead sintético, `test-console`), nunca no WhatsApp e nunca com paciente real, e compara a resposta nova com a falha original. Se o teste não comprovar, nada é publicado e o cartão mostra o motivo.

## Registro

Reaproveita as tabelas existentes: `nina_feedback_acoes` (ação e status) e `nina_feedback_versoes` (valor anterior, valor novo, motivo, autoria, `teste_status`). Uma nova coluna `execucao jsonb` em `nina_feedback_acoes` guarda o passo a passo do executor (ferramentas chamadas, diffs, teste, publicação) para a auditoria. Nenhum registro histórico é reescrito.

## Arquivos

- Novos: `src/lib/nina/correcao-executor.ts`, `correcao-executor.functions.ts`, `correcao-ferramentas.server.ts`, `src/components/nina/CorrecaoExecucaoPainel.tsx`, testes em `src/lib/nina/__tests__/correcao-executor.test.ts`.
- Alterados: `src/lib/nina/analise-erro.ts` (proposta + alcance no schema), `analise-erro.functions.ts`, `src/components/nina/AnaliseErroIAResultado.tsx`, `src/routes/_authenticated/app.nina-aprendizado.tsx` (cartão único, botão aplicar sem diálogo extra), `src/lib/nina/feedback-aplicacao.functions.ts` (aceita aplicação via executor).
- Migração: coluna `execucao jsonb` em `nina_feedback_acoes`.

## Fora de escopo

Modelo da Nina que atende pacientes, permissões, regras operacionais, WhatsApp real, dados clínicos e financeiros, e qualquer alteração de camada não apontada pela causa demonstrada.

## Validação

Typecheck, testes direcionados, suíte Nina e build. Ensaio real do fluxo completo em homologação depende de você confirmar ambiente e clínica.
