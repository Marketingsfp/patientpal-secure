# Revisão de segurança completa — 13/10/2026 04:07 UTC (somente leitura)

Nada foi alterado. Cada correção depende de aprovação, uma por vez.

## Foco: código novo desde 12/10/2026 04:00 UTC (PRs #26 a #35)

### 1. Atendimentos estruturados: conversão em lote, sincronização e edição com IA (`src/lib/nina/catalogo.functions.ts`)
Conferido: todas as funções exigem login no servidor (`requireSupabaseAuth`); as que gravam ou chamam IA conferem admin/gestor no servidor (`exigirAdmin`); conversão confere a flag `catalogo_estruturado` no servidor; toda leitura e gravação filtra pela clínica do pedido e roda como o próprio usuário (sem chave de serviço), e as regras do banco de `nina_cat_servicos`/`nina_cat_profissionais` também exigem admin/gestor para gravar; conferência de versão (`updated_at`) evita sobrescrever edição de outra pessoa; prévia não grava.

- **Média — duas fontes de papel diferentes.** O catálogo lê o papel em `clinica_memberships.role`; as regras das flags (`clinica_feature_flags`) leem em `user_roles` (`has_role`). Uma pessoa pode ser gestora numa fonte e não na outra. Correção: unificar a fonte (mesmo achado antigo de `is_financeiro_clinica`).
- **Baixa — a flag não é barreira contra gestor.** Qualquer admin/gestor da clínica pode ligar `catalogo_estruturado` sozinho pelas regras do banco. Serve como liberação gradual, não como proteção. Correção (se a flag precisar ser barreira): gravar flags só pelo administrador da plataforma. Possível regra de negócio — validar com a equipe da clínica.
- **Baixa — publicação com IA aceita os dados vindos do navegador.** `publicarEdicoesCatalogoIA` grava o `dados` enviado pela tela, não a proposta gerada no servidor. Só admin/gestor chega aqui e ele já pode editar à mão, então não amplia acesso. Correção: guardar a proposta no servidor e publicar por referência.
- **Baixa — texto da clínica vai para a IA.** O texto colado é delimitado por marcas e o pedido fica como mensagem de usuário. Risco só de resultado estranho na prévia, que precisa de confirmação humana. Sem ação.

### 2. Agendamento por item do catálogo (`src/lib/nina/fluxo-agendamento-item.ts`)
Conferido: o módulo é puro (sem banco, sem rede); só decide o próximo passo. A reserva continua no executor já existente do WhatsApp.
- **Não verificado:** o executor de vagas/reserva em `src/lib/whatsapp.server.ts` não foi relido linha a linha nesta rodada (amarração da clínica e do paciente à conversa).

### 3. Orçamentos com filtro de período (`src/routes/_authenticated/app.orcamentos.tsx`)
Conferido: lotes de 150 ids por consulta, pelo navegador com as regras do banco; a busca por nome passa por `sanitizePostgrestSearch` antes do `.or()`. Sem achado.

### 4. Retorno compacto do catálogo e remoção de blocos de prompt
Conferido por nomes de arquivo: mudanças só em texto/regras da Nina, sem nova rota, tabela ou permissão. Sem achado de segurança; risco é de comportamento, não de acesso.

## Achados gerais (banco consultado agora)

| Severidade | Achado | Local | Correção sugerida |
|---|---|---|---|
| Alta (corrigida, falta publicar) | Voz da Nina sem login | `src/routes/api/nina-voz.ts` | Publicar a correção já feita |
| Média | Sessão da foto do pedido pode ficar no banco com nome do paciente | `orcamento_foto_sessoes` | Limpeza agendada das vencidas |
| Média | Falas "da assistente" vindas do navegador | `src/routes/api/nina-fala.ts` | Montar histórico no servidor |
| Média | Texto do médico como instrução de sistema | `src/lib/consulta-ia.functions.ts` | Enviar como mensagem de usuário |
| Média | Homologação do Francisco aceita instrução do navegador | `src/lib/francisco/functions.ts` | Ler instrução salva no banco |
| Média | Impressão da composição corporal sem escapar texto | `src/components/medico/paciente-dialogs.tsx` | Escapar antes de montar a página |
| Média | Mensagens entre janelas aceitam qualquer origem | `app.orcamentos-agenda.tsx` | Conferir origem; não usar `"*"` |
| Média | 71 funções privilegiadas chamáveis por visitante (igual a 10/10) | banco | Revogar acesso de visitante em lotes |
| Baixa | 1 função sem `search_path` fixo; 6 extensões no esquema público | banco | Fixar `search_path`; mover extensões |
| Baixa | 19 tabelas com proteção ligada e sem regra (fechadas) | banco | Revogar permissão de visitante |
| Baixa | Busca de aprendizados sem saneamento | `src/lib/nina/aprendizado.functions.ts` | `sanitizePostgrestSearch` |
| Baixa | CSV da agenda pode virar fórmula | `src/lib/export-csv.ts` | Prefixar `'` em `= + - @` |
| Pendente | Permissão por módulo só na tela em tabelas antigas | várias | Migração gradual |

Nenhum segredo exposto novo; tabelas sem proteção: 0.

## Não verificado
- Executor de reserva da Nina linha a linha.
- Varredura de dependências.
- Teste com usuário logado (gestor e recepção) nas telas novas do catálogo.

## Ordem sugerida
1. Publicar a correção da voz (com autorização).
2. Unificar a fonte do papel (catálogo x flags x financeiro).
3. Limpeza das sessões de foto vencidas.
4. Instruções de IA vindas do navegador.
5. Itens baixos.
