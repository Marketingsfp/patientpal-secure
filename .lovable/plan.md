# Revisão de segurança completa — 12/10/2026 04:10 UTC (somente leitura)

Nada foi alterado. Cada correção abaixo depende de aprovação, uma por vez.

## Foco das últimas 24h

### 1. Foto do pedido pelo celular (`/p/pedido/<código>`, `orcamento_foto_sessoes`)
Conferido: RLS ligada; visitante sem acesso (REVOKE ALL de anon); funcionário só vê, cria e apaga a própria sessão da própria clínica; sem UPDATE pelo navegador; código de 48 caracteres aleatórios (não dá para adivinhar); validade de 10 min; até 5 fotos por sessão; reserva atômica evita leitura dupla; a foto não é guardada.

- **Média — sessão com dados do paciente pode ficar até ~1h10 no banco.** `resultado` guarda nome do paciente, médico e exames. Se o computador não buscar o resultado, a linha só é apagada quando alguém envia outra foto e já passou 1h do vencimento. Sem envio novo, fica indefinidamente.
  Correção: incluir a limpeza das sessões vencidas no agendamento de retenção (ou um agendamento próprio a cada 10 min) e reduzir a margem de 1h.
- **Baixa — rota pública sem limite por IP.** Cada sessão válida permite 5 leituras de IA. Só funciona com um código válido gerado por um funcionário logado, então o risco é baixo. Correção: limite por IP/minuto, como já existe no totem.
- **Baixa — tamanho de envio de até 12 MB.** O celular já comprime para 8 MB, mas o servidor aceita até 12 MB. Correção: baixar o limite do servidor para cerca de 9 MB.

### 2. Retirada do motor de confiança
Conferido: o código não usa mais as tabelas (passo anterior). No banco, as 3 tabelas continuam com RLS e só membros da clínica leem.
- **Baixa — permissões antigas sobrando.** `nina_confianca_propostas` ainda aceita INSERT/UPDATE de membros, e `nina_confianca_propostas_guard` pode ser chamada por visitantes (função comum, sem efeito sozinha). Ninguém usa isso. Correção: já está coberta pelo SQL de exclusão pendente; até lá, sem ação.

### 3. Retenção de 6 meses (`nina_zap_retencao_executar`)
Conferido: SECURITY DEFINER com `search_path` fixo; executar só pelo sistema (revogado de PUBLIC, anon e authenticated); agendamento `nina-zap-retencao-dados` ativo no minuto 23; lotes limitados por execução; `nina-resumos-retencao-7-dias` intacto.
- **Informativo:** a exclusão é permanente e inclui conversas, mensagens do WhatsApp e confirmações de consulta com mais de 6 meses. Possível regra de negócio — validar com a equipe da clínica se 6 meses atende à guarda exigida para comunicação com o paciente.

## Achados gerais (varredura de 09/10 e consultas de hoje)

| Severidade | Achado | Local | Correção sugerida |
|---|---|---|---|
| Alta (já corrigida, falta publicar) | Voz da Nina sem login | `src/routes/api/nina-voz.ts` | Publicar a correção já feita; depois marcar como resolvido |
| Média | Funcionário pode mandar falas "da assistente" para o modelo | `src/routes/api/nina-fala.ts` | Aceitar só o papel `user`/`assistant` validado e montar o histórico no servidor |
| Média | Texto livre do médico entra como instrução de sistema | `src/lib/consulta-ia.functions.ts` | Enviar `contexto` como mensagem de usuário, não de sistema; validar papéis |
| Média | Homologação do Francisco aceita instrução do navegador | `src/lib/francisco/functions.ts` | Ler a instrução salva no banco, não a do pedido |
| Média | Código pode rodar na impressão da composição corporal | `src/components/medico/paciente-dialogs.tsx` | Escapar os textos antes de montar a página de impressão |
| Média | Mensagens de qualquer site chegam na agenda do orçamento | `src/routes/_authenticated/app.orcamentos-agenda.tsx` | Conferir a origem da mensagem e não usar `"*"` como destino |
| Baixa | Busca de aprendizados aceita sintaxe de filtro | `src/lib/nina/aprendizado.functions.ts` (linha 55) | Usar `sanitizePostgrestSearch` antes do `.or()` |
| Baixa | Exportação CSV da agenda pode virar fórmula no Excel | `src/lib/export-csv.ts` | Prefixar com `'` células que começam com `= + - @` |
| Baixa | Tabelas de cópia com permissão de leitura para visitante, mas sem regra | `backup_nina_cat_servicos_20261010_pedido`, `integracao_idempotencia`, `nina_remarcacoes_pendentes` | Hoje fechadas pela RLS; revogar a permissão de anon para não depender só disso |
| Pendente (já conhecido) | Permissão por módulo aplicada na tela, não em todo o banco | várias tabelas antigas | Seguir a migração gradual para `assertAcessoModulo`/`has_module_access` |

Sem achado novo de segredo exposto: o token da Sufficit e as chaves de integração seguem só no servidor.

## Não verificado nesta rodada
- Dependências: a varredura de pacotes não foi rodada agora.
- Teste com usuário logado de verdade na rota da voz e na foto pelo celular.

## Ordem sugerida
1. Publicar a correção da voz (com autorização).
2. Limpeza automática das sessões de foto vencidas.
3. Instruções de IA vindas do navegador (`nina-fala`, `consulta-ia`, Francisco).
4. Impressão e mensagens entre janelas.
5. Itens baixos.
