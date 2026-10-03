# Dashboard do atendimento humano — OS ZAP

## Antes / depois

Antes, fila, equipe e resultados eram consultados em telas separadas. A nova aba
**Atendimento → Dashboard** reúne somente atendimento humano, no ambiente real.
Não apresenta indicadores de Nina, modelos, confiança, prompt, testes ou aprendizagem.

O acesso usa a autorização existente `can_manage_clinica`: administração e supervisão.
Telefonia não vê o item nem abre o dashboard por link direto. O servidor também valida
a autorização antes de consultar dados. Não há nova permissão, migração ou alteração de RLS.

## Informações e fontes

| Bloco | Origem e significado |
| --- | --- |
| Fila agora | Conversas reais abertas sob responsabilidade humana, atribuídas ou sem responsável. Mesma regra central da TV. |
| Esperas e urgências | RPC `atend_espera_por_conversa`; faixas centralizadas: menos de 5 min, de 5 a 10 min, acima de 10 min. |
| Equipe agora | Mesma seleção da TV: perfil telefonia ativo; administrador prevalece em vínculo duplo. Online, pausas e offline com carga. Presença manual não prova conexão. |
| Encerradas hoje | Conversas reais com `resolved_by` preenchido e `resolved_at` no dia civil de Brasília. A contagem por pessoa usa quem encerrou. Não herda o total de encerramentos automáticos da TV. |
| Mensagens no período | Saídas reais de autoria humana, sem avisos internos e remetentes automáticos. Enviadas = `sent`, `delivered` ou `read`. Falhas e outros estados aparecem separadamente. |
| Conversas respondidas | Conversas distintas com pelo menos uma resposta humana enviada no período. |
| Primeira resposta | Média de `sla_first_response_seg`, pela data de `primeiro_resp_em`. Só valores válidos medidos; zero é válido, ausência não vira zero. |
| Encerramentos no período | Data `resolved_at` e evidência de atendimento humano. Autoria ausente fica separada; não é atribuída ao responsável atual. |
| Tempo até encerrar | De `handoff_em`, ou `assigned_at` disponível, até `resolved_at`. Inclui espera; não é tempo de trabalho ativo. Só durações válidas medidas. |
| Transferências manuais | `atend_transferencias` com pessoa de origem, verificando que cada conversa pertence à clínica e não é de teste. |
| Resultados por pessoa | Mensagens atribuídas ao autor; encerramentos atribuídos a `resolved_by`, inclusive administração/supervisão. A lista de resultados é distinta da equipe atual de telefonia. |
| Evolução | Respostas humanas enviadas por dia e por hora, em São Paulo, nos 7, 30 ou 90 dias selecionados. |
| Departamentos | Distribuição atual das conversas humanas abertas. Sem responsável é um subconjunto das abertas, não um total adicional. |
| Histórico | Contagens em todas as datas de conversas com evidência humana; encerradas são os registros atualmente fechados. |

Todas as consultas de conversas e mensagens restringem a clínica e `is_teste=false`.
Agregações leem metadados; não retornam textos, telefones ou nomes de pacientes.
Os únicos nomes exibidos são os dos integrantes da equipe.

## Atualização e limites

- Fila a cada 30 segundos e período a cada 60 segundos, enquanto a aba está ativa.
- Cache separado por usuário, clínica e período; fila depende da autorização inicial.
- Falhas em blocos não viram zero: aparecem indisponíveis. Dados anteriores mantêm
  sua data. Falha na contagem diária não impede a visualização da fila.
- Consultas agregadas são paginadas até 20 mil registros. Uma leitura extra detecta
  truncamento; o painel sinaliza amostra parcial. Contagens do histórico usam total exato.
- Encerramentos usam os metadados atuais. Não reconstrói sessões antigas cujos campos
  de resolução foram apagados em reinícios. Sem registro de autoria, não inventa quem encerrou.
- O painel é somente leitura. Não dispara mensagens, resolve conversas, altera a Nina
  nem modifica módulos fora do OS ZAP.

## Validação

- 15 testes passaram nos arquivos de dashboard, acesso às telas e seleção da equipe da TV.
  Cobrem datas, autoria, isolamento por clínica, exclusão de testes/automáticos,
  paginação, permissão, falha parcial e contagem diária humana.
- TypeScript verificado com `tsc --noEmit`.
- Build completo cliente/servidor passou com Vite/Nitro. O projeto emitiu avisos
  de APIs depreciadas e empacotamento, sem erro de compilação.
- `scripts/check-dashboard-oszap.mjs` monta os componentes reais com React Query e
  serviços simulados, testa filtros, atalhos, falhas, autorização, tema claro/escuro,
  leitura de atalhos no escuro e celular a 135%, sem envio ao WhatsApp.
- `scripts/preview-dashboard-oszap.tsx` contém somente dados fictícios e aviso visível.
  Não constitui teste do banco publicado nem comprovação de publicação no Lovable.

## Pendências e reversão

Após sincronização/publicação, validar manualmente no Lovable com usuário de gestão:
abrir a aba, comparar resultados com as conversas reais e conferir acesso da telefonia.
Não foi realizado teste com dados reais nesta implementação.
Reversão por revert do commit do dashboard; não exige desfazer dados ou migrações.
