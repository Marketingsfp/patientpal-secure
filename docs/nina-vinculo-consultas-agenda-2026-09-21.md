# Nina — vínculo de Obstetrícia e Oftalmologia com a agenda

## Evidência e causa

Nos retestes de 21/09/2026, as sessões 48 (Obstetrícia, Sérgio Satoshi) e
49 (Oftalmologia, Marina Almeida) terminaram com
`ATENDIMENTO_AGENDA_NAO_VINCULADO`. As evidências das execuções mostram que
o vínculo entre cada profissional publicado e seu médico ativo na agenda
foi resolvido corretamente. A falha não comprovava falta de vagas.

Ao solicitar `proxima_vaga` apenas pelo ID do médico, o executor precisava
recuperar também a consulta a partir das referências da sessão. A última
pesquisa estava salva como o nome do médico ou simplesmente `consulta`.
O caminho alternativo exigia uma única grafia de procedimento, mas havia
várias referências ao mesmo registro: por exemplo, `Consulta — OFTALMOLOGIA`,
`Consulta Oftalmologia` e `consulta oftalmologia`. Isso impedia a associação
das vagas à consulta, mesmo com o médico já identificado.

## Correção

- Revalidar as referências em conjunto no catálogo publicado da clínica.
- Comparar o ID do registro e o nome da especialidade, normalizando acentos,
  capitalização, espaços e o prefixo `Consulta`.
- Usar o nome oficial atual na vaga e no agendamento.
- Manter cada especialidade como candidato separado. Duas especialidades
  reais do mesmo médico continuam exigindo desambiguação.
- Preservar a modalidade escolhida: uma consulta retirada da publicação não
  é substituída silenciosamente por outra referência da sessão.

A alteração vale para todas as clínicas e compartilha o executor usado na
homologação e no WhatsApp. Não exige migração ou alteração do conteúdo da
base, dos preços, dos médicos ou das vagas existentes.

## Validação

As quatro reproduções (duas consultas em dois canais) falhavam antes da
correção na obtenção da vaga. Após a mudança, passam pelo fluxo de vaga,
escolha, coleta de dados, confirmação e uma única reserva em banco simulado.
A Oftalmologia também preserva o pré-agendamento por ordem de chegada.

Foram aprovados 280 testes em seis arquivos, incluindo referências de outra
clínica ou sessão, registro arquivado ou substituído, especialidades
distintas, modalidade retirada da publicação e separação entre consulta e
procedimento. A validação não criou agendamentos reais nem enviou mensagens
a pacientes. O catálogo e as execuções reais foram consultados somente para
leitura; a reprodução completa utilizou dados fictícios.

`npm run typecheck`, a compilação de produção com Vite e `git diff --check`
também passaram.

Comando de regressão:

```sh
bun test src/lib/nina/__tests__/consulta-agenda-executor.test.ts src/lib/nina/__tests__/jornada-selecao-agenda-integracao.test.ts src/lib/nina/__tests__/pesquisa-medico-sessao.test.ts src/lib/nina/__tests__/confirmacao-medico-fluxo.test.ts src/lib/nina/__tests__/agendamento-escolha.test.ts src/lib/nina/__tests__/cadastro-paciente-gate.test.ts
```

Reversão: reverter o commit desta correção e republicar a aplicação. Não há
alteração de dados para desfazer.
