# Assistente de escrita do atendimento humano

No cabeçalho do chat do OS ZAP e da Central de conversas, **Assistente de escrita** abre um painel compacto. A barra de composição continua com texto e envio. A consulta à base e o assistente abrem alternadamente para preservar espaço no histórico.

- **Corrigir português**: corrige o rascunho com mudanças mínimas.
- **Melhorar clareza**: reorganiza o rascunho mantendo o sentido.
- **Sugerir resposta**: usa até 16 mensagens recentes da conversa autorizada e até 8 registros públicos relevantes do cadastro oficial. O assunto opcional direciona a busca; sem ele, usa as últimas três entradas do paciente.

O resultado aparece para revisão. **Usar no rascunho** substitui o texto original somente se ele continua igual e a conversa continua autorizada. **Descartar sugestão** mantém o texto anterior. Nenhuma dessas ações envia WhatsApp, altera fila, aciona Nina, agenda ou confirma vagas. O envio normal continua sob controle da atendente e pelas verificações existentes.

## Modelo e custo

Configurado `openai/gpt-5.6-luna`, raciocínio `low`, usando o mesmo transporte Lovable já utilizado no projeto. É independente do modelo configurado para a Nina. Chave `LOVABLE_API_KEY` somente no servidor. Cada clique gera no máximo uma chamada, sem repetição automática, com limite de 20 segundos na chamada completa ao modelo e 2.500 tokens de saída. O painel mostra a duração real do processamento, não uma estimativa comercial.

É uma escolha inicial para uma tarefa curta e frequente, não uma afirmação de que seja o modelo mais rápido em todas as condições. Documentação: [seleção de modelos OpenAI](https://developers.openai.com/api/docs/guides/model-selection) e [redução de latência](https://developers.openai.com/api/docs/guides/latency-optimization). Qualidade e latência com a credencial publicada ainda precisam de teste real. Sem troca automática para outro modelo em caso de erro.

## Contexto, revisão e fonte

Correção e clareza enviam só o rascunho ao provedor; não carregam histórico nem base. Não verificam a veracidade dos fatos. Saída inválida, vazia, truncada ou com números alterados é recusada. A preservação de sentido, nomes e negações também é instruída no prompt e depende da revisão humana; não é uma garantia determinística de correção semântica.

Sugestão consulta `lerFonteOperacional` e os formatadores públicos de `consulta-base-chat`, com cache de até 60 segundos. Não usa notas internas nem transforma dinheiro em Pix. Horários habituais não comprovam disponibilidade. A busca é parcial, limitada em tamanho e não comprova ausência de um serviço. A IA recebe instrução para esclarecer ambiguidades, não inventar dados e citar somente índices fornecidos. O servidor valida esses índices; isso **não** certifica que todo o texto gerado é verdadeiro. Os registros citados e seus campos ficam visíveis para conferência antes do envio.

Os dados enviados são tratados como conteúdo, nunca instruções. Não há ferramentas/autonomia concedidas ao modelo. Nenhum acesso a prontuário ou alteração de cadastros.

## Proteções

Autenticação pelo middleware existente; `assertAcessoConversa` com banco do usuário antes de fonte/modelo e novamente após a resposta. Todas as consultas de mensagens filtram clínica e conversa. Mensagens operacionais do sistema são excluídas. Nenhuma escrita histórica, migration ou mudança de permissão.

Uma solicitação por usuário de cada vez e intervalo de 2 segundos após conclusão, por processo do servidor. Esse limite local não é um limitador distribuído; o limite global de uso permanece no gateway. Requisições abandonadas pela interface podem concluir no servidor e consumir a chamada já iniciada, mas seu resultado não é aplicado.

Troca de paciente/clínica ou fechamento desmonta o painel e invalida resultados pendentes. Edição de rascunho ou atualização do histórico após pedir sugestão desabilita sua aplicação. Revalidação do rascunho também ocorre no componente pai. Falhas mantêm o rascunho.

## Validação e publicação

- Testes unitários de autorização, limites, escopo, dados enviados, referências, números, fonte e concorrência em `assistente-escrita.test.ts`; regressão da consulta à base.
- `scripts/check-assistente-escrita.mjs`: componente real em Chrome com transporte e IA simulados; revisão explícita, troca de paciente durante chamada, edição concorrente, nova mensagem, bloqueio, falha, fontes, Escape, claro/escuro e celular com texto ampliado.
- TypeScript, ESLint dos arquivos de produção e build cliente/servidor.

Prévia gerada em `work/oszap-design-preview/assistente-escrita.html` é fictícia e não envia mensagens. Testes simulados não medem qualidade ou latência do modelo real. A entrega Git não comprova publicação do Lovable; depois da implantação, conferir o botão na revisão publicada e revisar um rascunho de teste, sem envio ao paciente.
