# Novo ciclo de revisão e métricas

Solicitação: zerar Revisão de Aprendizados e Métricas para iniciar novos registros.

Marco: **2026-09-16T21:29:49.000Z** (16/09/2026, 18:29:49 em Brasília).
Aplica-se a todas as clínicas, tanto produção quanto homologação/testes.

O reinício é lógico: registros anteriores continuam preservados no banco para
auditoria, mas não entram nas listas, contadores, agrupamentos, autores, métricas
e histórico do analista destas telas. Não há DELETE, alteração de timestamps,
migração, mudança de permissões nem edição de mensagens, agenda, cadastro,
conhecimento, instruções ou correções já aplicadas.

`src/lib/nina/ciclo-aprendizado.ts` define o marco único. As consultas de métricas
intersectam cada janela solicitada com o novo ciclo antes de consultar o banco.
Períodos totalmente anteriores retornam zero registros. Selecionar datas antigas
não faz os números antigos voltarem. Novos registros são contabilizados normalmente.
O painel informa a data do ciclo; taxas sem denominador permanecem indisponíveis.

O histórico de análises anteriores deixa de aparecer. O limite diário de uso do
analista permanece baseado no consumo real, pois reiniciar métricas não desfaz
custo de IA já incorrido. Auditoria individual por ID continua disponível.

Rollback: reverter este commit restaura a visualização anterior sem recuperar dados
de backup, pois nenhum registro foi apagado. A ativação depende da publicação do código.
