# Busca completa do catálogo com e sem acentos

Correção de código autorizada em 19/09/2026, aplicável a todas as clínicas.

## Problema confirmado

Na homologação, a pergunta “Olá, gostaria de saber como funciona o atendimento para nebulização.” recebeu encaminhamento por ausência no catálogo, embora NEBULIZAÇÃO estivesse publicada. A recuperação normalizava o termo, mas aplicava ILIKE sobre o texto acentuado no banco. O fallback comparava apenas os primeiros 40 serviços; o registro não estava entre eles. Os profissionais também tinham um corte antecipado em 60 registros.

## Alteração

- A busca percorre um índice de campos públicos de todos os registros PUBLICADOS da clínica, em páginas de até 250, ordenadas por ID. O cursor continua até uma página vazia, inclusive quando o servidor devolve menos registros que o limite solicitado.
- Pergunta, nomes, descrições, especialidades e filtro de médico são comparados sem acentos e sem diferença de caixa. A grafia original é preservada na apresentação.
- Relevância e filtro de dia são aplicados antes do limite de resultados. Só os IDs selecionados têm seus detalhes públicos recuperados e enviados ao modelo; o limite existente de 6 por padrão e 12 no máximo por categoria permanece.
- “Como”, “funciona”, “funcionam” e “funcionamento” são palavras genéricas de conversa, evitando correspondência com outro procedimento apenas por esses termos.
- Cada página e a recuperação dos detalhes repetem os filtros de clínica e publicação. Notas internas e rascunhos continuam excluídos na seleção das colunas. Erro de leitura interrompe a consulta: não é tratado como ausência confirmada.
- A evidência registra quantidade examinada, comparação normalizada, candidatos relevantes e IDs selecionados. O histórico anterior permanece intacto.

Nenhum cadastro, preço, agenda, lançamento financeiro ou prompt foi alterado. Não há migração de banco. SFP, nomes genéricos e encaminhamento por ausência real mantêm as regras existentes. A leitura do índice cresce com o catálogo; os detalhes e o contexto enviados ao modelo continuam limitados.

## Validação local

- 142 testes passaram em oito arquivos: recuperação do catálogo, ausência e encaminhamento, fonte única, resposta, contrato e regras do catálogo/fluxo.
- 12 novos casos cobrem a pergunta original, acentos nas duas direções, caixa e Unicode decomposto, mais de 1.100 serviços, mais de 260 profissionais, páginas reduzidas pelo servidor, seleção por relevância e dia, nome próprio acentuado, isolamento por clínica/publicação e falha numa página posterior.
- `bun run typecheck` e `git diff --check` passaram.
- A compilação Vite local não chegou à aplicação: o plugin `@lovable.dev/mcp-js` rejeitou o caminho Windows de `src/routes` por comparar separadores `/` e `\\`. A configuração compartilhada e as dependências não foram alteradas para contornar esse problema.

A validação acima é automatizada e local; não comprova implantação no servidor nem novo teste com modelo real. A publicação depende da compilação e implantação do projeto no Lovable.
