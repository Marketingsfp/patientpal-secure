# Departamentos do OS ZAP

Implementação na `main` local, autorizada em 09/10/2026 para desenvolvimento e testes locais.
Aplicação da migração em produção e ativação global ainda dependem de validação visual e promoção autorizada.

## Regras confirmadas

- Aba exclusiva dos perfis `admin` e `supervisor`, sujeita à matriz de acesso.
- Somente membros ativos com perfil `telefonia` são listados para vínculo. Administradores não recebem conversas.
- Os setores são fixos: Recepção, Laboratório e Tomografia e Ressonância. A tela não permite criar ou renomear setores.
- Uma atendente possui exatamente um setor operacional por clínica. Novas pessoas de Telefonia entram na Recepção até que a gestão as mova.
- Transferência por departamento sorteia entre atendentes vinculadas, elegíveis e com estado manual `ONLINE`.
- Offline, Pausa e Pausa para saída não recebem transferência por departamento.
- Sem destino disponível, a transferência é recusada e toda a conversa permanece intacta com a responsável atual.
- A troca de departamento de uma pessoa vale para novos encaminhamentos; não redistribui suas conversas atuais.
- A regra vale para todas as clínicas. O controle de publicação é global.

## Antes e depois

Antes, o sistema permitia múltiplos vínculos operacionais e tinha fallback para atendentes fora do setor. Na transferência sem disponibilidade, removia a responsável antes de tentar distribuir.

Depois da ativação, um vínculo operacional próprio define o setor da atendente. O banco escolhe o destino e grava conversa, transferência e evento na mesma transação. Ausência de destino ou falha no histórico desfaz a operação inteira. Encaminhamentos automáticos com departamento também passam pelo filtro estrito do pool; a distribuição inicial sem setor preserva seu critério de menor carga.

## Relatório da migração

Arquivo: `supabase/migrations/20261009190000_oszap_departamentos.sql`.

| Objeto | Alteração |
| --- | --- |
| `atend_departamento_atendentes` | Nova tabela: `id`, `clinica_id`, `user_id`, `departamento_id`, `created_at`, `atualizado_em`, `atualizado_por`. |
| Índices | Chave primária `id`; unicidade de `(clinica_id,user_id)`; índice de busca `(clinica_id,departamento_id,user_id)`. |
| Referências | Clínica existente; departamento existente. Exclusão de departamento vinculado é recusada. |
| RLS | Leitura dos vínculos restrita a Admin/Supervisor com acesso à opção; escrita direta recusada para `authenticated`. RPCs verificam clínica, perfil e matriz. |
| Triggers | Validação de vínculo ativo/Telefonia/mesma clínica; auditoria de novos vínculos e mudanças de departamentos. |
| `atend_departamentos` | Mantém cadastros anteriores para histórico e publica os três setores fixos. Tomografia e Ressonância antigos ficam inativos após a união no setor `Tomografia e Ressonância`. |
| `atend_departamento_membros` | Somente leitura para compatibilidade e bloqueio de fila. Vínculos de supervisão permanecem intactos. |
| Importação de vínculos | Copia vínculos inequívocos, une vínculos de Tomografia/Ressonância em `TR` e coloca Telefonia sem setor na Recepção. |
| `atend_conversas` | Conversas ainda abertas dos setores antigos de Tomografia/Ressonância passam ao setor combinado. Conversas encerradas não são reescritas. |
| Histórico | `atend_transferencias`, `atend_conversa_eventos` e `audit_log` recebem somente registros novos. Nenhuma auditoria histórica é reescrita. |
| Pool | `atend_pool_canonico` conserva assinatura e comportamento legado quando o controle global está desligado. Quando ligado, consulta o vínculo novo e impede fallback fora do setor, inclusive em setor vazio/inativo. |

Funções novas: `atend_departamentos_habilitados`, `atend_gerencia_departamentos`, `atend_acesso_departamentos`, `atend_nome_departamento`, `atend_validar_departamento_atendente`, `atend_auditar_departamentos`, `atend_inicializar_departamentos`, `atend_salvar_departamento`, `atend_vincular_departamento`, `atend_transferir_departamento`, `atend_listar_departamentos`.

Todas as operações operacionais novas usam a trava de distribuição da clínica já existente. A transferência também trava a conversa, o departamento, o vínculo, o perfil e a presença; confere a responsável esperada para impedir uma troca feita sobre seleção desatualizada. Não há intervalo em que a conversa fica sem responsável.

Auditoria registra autor autenticado, data/hora, registro, ação e valores antes/depois. O IP de origem é derivado pelo servidor dos cabeçalhos de proxy, sem campo editável na tela, e fica em `_auditoria.ip_origem` nos registros de cadastro/vínculo e nos detalhes do evento de transferência. Ausência de cabeçalho confiável fica nula; não se inventa IP. Chamadas diretas à RPC podem informar metadados, mas não trocar a autoria autenticada; o IP é contexto informativo, não uma prova de identidade.

## Impactos e riscos

- Financeiro: sem alteração de valores, cobranças, pagamentos ou documentos fiscais.
- Operação: reduz encaminhamentos à equipe incorreta. Um setor sem atendente disponível exige manter o atendimento com a responsável atual.
- Paciente: preserva a continuidade da conversa quando o destino está indisponível.
- Risco técnico: implantação deve coordenar controle do aplicativo e do banco; vínculos legados ambíguos precisam ser escolhidos pela supervisão e configurados na promoção.
- Regra de negócio: o sorteio aplica-se à transferência por setor. A atribuição inicial sem setor continua seguindo a distribuição existente.
- Fora do escopo: migração de conversas antigas, exclusão de departamentos, alterações no financeiro, agenda, prontuário ou prompts da Nina/Francisco.

## Prévia e validação

`http://127.0.0.1:8080/dev/departamentos` apresenta o componente real com dados fictícios em memória. A rota é bloqueada em produção. Alterações da demonstração desaparecem ao recarregar e não acessam banco ou WhatsApp.

Testes de SQL usam PostgreSQL embarcado (PGlite) inteiramente local, com migração real e registros sintéticos. Cobrem acesso, isolamento de clínica, matriz de leitura/edição, auditoria, nomes duplicados, exclusividade de vínculo, sorteio com cargas diferentes, offline/pausas, perda de perfil, setor vazio/inativo, seleção obsoleta e rollback de falha no histórico. Essa execução não comprova concorrência entre conexões de um PostgreSQL de produção.

A validação visual cobre seleção única, busca/filtros, erro recuperável e apresentação em computador e celular, bloqueando acesso ao Supabase. Antes da promoção, validar também concorrência com conexões independentes em homologação e o fluxo autenticado com transporte real, sem envio a pacientes.

Resultado local: 89 testes passaram nas suítes de departamentos, acesso, matriz do OS ZAP, presença e preservação de leitura. Verificação de tipos, lint dos arquivos alterados e compilação de produção passaram. O lint mantém avisos de tipagem legados. Playwright passou em computador/celular e confirmou que a prévia anterior da TV continua funcionando. Nenhuma migração foi aplicada a um banco remoto.

## Promoção controlada e reversão

1. Validar a prévia visual com o usuário.
2. Conferir em leitura os vínculos legados múltiplos e o cadastro de pessoas com perfil Telefonia.
3. Aplicar as migrations em homologação. A migration de setores fixos publica o recurso e faz a atribuição padrão na Recepção.
4. Fazer a validação autenticada e de concorrência em homologação.
5. Mediante autorização de implantação, aplicar em produção e publicar o aplicativo. O recurso fica ativo por padrão.
6. Para reversão imediata, republicar com `VITE_OSZAP_DEPARTAMENTOS=false` e restaurar `atend_departamentos_habilitados()` para `SELECT false`.

O rollback desliga o comportamento futuro sem apagar tabelas, vínculos ou auditorias. Transferências já concluídas continuam registradas e não são desfeitas automaticamente.
