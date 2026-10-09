# Relatórios históricos do atendimento humano — OS ZAP

## Comportamento

A aba **Atendimento → Dashboard** reúne somente resultados passados do atendimento
humano real. Presença, fila atual, urgências e contadores ao vivo permanecem no painel
TV; o dashboard não consulta essas fontes nem atualiza automaticamente.

- Abre nos últimos 30 dias completos, até ontem.
- Datas inicial e final livres, inclusivas, no fuso `America/Sao_Paulo`.
- Atalhos: ontem, semana passada, mês, bimestre, trimestre e ano anteriores.
- Agrupamentos independentes: dias, semanas, meses, bimestres, trimestres e anos.
- Semana de segunda a domingo. Bimestres jan/fev, mar/abr etc.; trimestres jan/mar etc.
- Recortes incompletos identificados e dias sem movimento incluídos como zero.
- O dia atual pode ser consultado como fotografia incompleta, com aviso; datas futuras são recusadas.
- `Consultar` aplica as datas. Trocar o agrupamento reaproveita a consulta sem buscar novamente.
- `Detalhar` em uma linha consulta aquele intervalo e recalcula seus horários.
- Tabela paginada de 50 em 50 linhas, sem perder totais; os resultados abrangem todo o intervalo.

## Contagem e fontes

Somente leitura das tabelas existentes; nenhuma migração, regravação histórica,
alteração de RLS ou efeito no envio de mensagens. Autorização existente
`can_manage_clinica` antes das consultas; cache separado por usuário, clínica e datas.

| Informação            | Definição                                                                                                                                                                    |
| --------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recebidas             | Mensagens `direction=in` em etapa humana comprovada pelos eventos da conversa. Exclui avisos e falhas.                                                                       |
| Enviadas              | Respostas `direction=out` com autoria humana (`enviada_por=humano` ou usuário), status `sent`, `delivered` ou `read`, excluindo remetentes automáticos e avisos `system`.    |
| Total                 | Recebidas + enviadas, com as duas quantidades também separadas.                                                                                                              |
| Volume por hora       | Soma das duas direções nas 24 horas de Brasília dentro das datas consultadas.                                                                                                |
| Períodos do dia       | Madrugada 00h–06h, manhã 06h–12h, tarde 12h–18h, noite 18h–24h. Limite final exclusivo.                                                                                      |
| Maior / menor volume  | Extremos do total, preservando empates. Mínimo inclui zero. Nenhum pico é anunciado quando todo o intervalo está zerado. Não presume horário comercial.                      |
| Conversas respondidas | IDs distintos de conversa com resposta humana enviada no intervalo.                                                                                                          |
| Encerramentos         | Eventos históricos `FINALIZADA` com `user_id` e sem `automatico=true`. Uma conversa pode encerrar mais de uma vez.                                                           |
| Transferências        | Eventos históricos `TRANSFERIDA` com autoria humana e sem `automatico=true`. Atribuições e avisos de protocolo não são transferências.                                       |
| Primeira resposta     | Tempo desde o início humano registrado até a primeira saída humana confirmada daquele ciclo. Inclui ciclos anteriores ao filtro se a primeira resposta estiver no intervalo. |
| Tempo até encerrar    | Tempo desde o início humano registrado até o encerramento humano no intervalo. Inclui espera; não mede trabalho ativo.                                                       |
| Resultados por pessoa | Autor da mensagem, encerramento ou transferência, inclusive supervisão/administração. Nunca atribui ações antigas ao responsável atual.                                      |

A reconstrução usa os eventos `HANDOFF_SOLICITADO`, `ENTROU_NA_FILA`, `ASSUMIDA`,
`TRANSFERIDA`, `DESATRIBUIDA`, `FINALIZADA`, `REABERTA`, `ATRIBUIDA_IA` e
`DEVOLVIDA_PARA_IA`. Os eventos técnicos de geração/anúncio de protocolo não iniciam
outra etapa. Encerramento, reabertura e devolução terminam a etapa anterior. São lidos
os eventos anteriores ao filtro e as respostas anteriores dos IDs envolvidos para
não reiniciar artificialmente os tempos na data inicial. IDs repetidos não duplicam a contagem.

O relatório não usa `resolved_at`, `resolved_by`, `assigned_at`, presença ou responsável
atual como fonte histórica: reabrir a conversa não faz desaparecer os encerramentos.
Os únicos nomes retornados são os da equipe. Não consulta corpo de mensagem, telefone,
resumo clínico nem o objeto completo de detalhes; projeta apenas três sinalizadores
dos eventos, além dos metadados de data/tipo/autoria.

## Limitações explícitas

- Registros recebidos sem evidência anterior de etapa humana ficam fora do volume,
  com a quantidade informada em aviso. Não há inferência baseada no dono atual.
- Não é possível reconstruir eventos que nunca foram gravados. Tempos sem início
  comprovado ficam sem medição; a interface informa o número de amostras válidas.
- Mensagens humanas sem autora identificada entram no total, mas não no resultado
  de uma pessoa. Mensagens sem conversa vinculada não inventam uma conversa respondida.
- Falhas/pending de envio são informados separadamente e não entram no volume enviado.
- As consultas leem todas as páginas, sem o antigo corte em 20 mil linhas. Intervalos
  extensos podem demorar; qualquer falha de página invalida a consulta, sem apresentar
  um total parcial como completo. Escala/latência do banco publicado não foi aferida.
- Falha na consulta mantém o relatório anterior identificado como anterior; no primeiro
  carregamento, não mostra números como se fossem zero. Falha de nomes preserva as contagens.
- Consultas de mensagens restringem clínica e `is_teste=false`; eventos restringem
  clínica e fazem join com conversas reais. Nenhuma fonte do painel TV é carregada.

## Validação e publicação

- Testes de calendário, fuso, dias vazios, empates, separação de direções, exclusão
  de automações, ciclos reabertos, autoria, transferências e paginação acima de 20 mil.
- Testes do backend verificam autorização prévia, filtros de clínica/ambiente e projeção
  de metadados. Usam serviços simulados, não o banco publicado.
- `scripts/check-dashboard-oszap.mjs`: componentes e React Query reais, transportes
  simulados. Verifica datas, seis agrupamentos, ano bissexto, paginação, detalhamento,
  consulta explícita, ausência de polling/foco/reconexão, vazio, erros, permissão,
  tema claro/escuro e tela móvel com texto a 135%.
- `scripts/preview-dashboard-oszap.tsx` gera somente dados fictícios identificados.
- TypeScript, lint dos módulos alterados e compilação cliente/servidor.

Após a publicação no Lovable, conferir com usuário de gestão um intervalo conhecido
contra o histórico das conversas. Validação local e push no GitHub não comprovam
publicação nem igualdade com dados reais. Reversão por revert do commit; não há
alterações de dados ou migrations para desfazer.
