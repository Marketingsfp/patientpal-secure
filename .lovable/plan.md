# Fechar acesso de visitante — itens 1, 2 e 3 da revisão de segurança

## O que muda (em linguagem simples)
Hoje 8 funções do banco aceitam ser chamadas por quem não fez login. Elas já conferem por dentro quem está chamando, mas a porta de fora fica aberta. A mudança fecha essa porta. Nenhuma tela, texto, regra de negócio ou dado é alterado.

| Item | Funções | Depois da mudança |
|---|---|---|
| 1 | `pagar_cobranca_credito_clinica` | Só usuário logado. |
| 2 | `nina_trace_purgar`, `nina_execucoes_expurgo`, `integracao_verificacoes_limpar`, `coach_limpar_eventos_antigos` | Só o servidor (rotinas automáticas). Nem visitante nem usuário logado. |
| 3 | `integracao_criar_api_key`, `nina_instrucoes_publicar`, `revisar_limite_credito_clinica` | Só usuário logado. |

## Fora do escopo
- A conferência do papel de quem recebe no item 1 (caixa/financeiro/gestor/admin). Fica para depois que a clínica confirmar quais papéis podem receber — "Possível regra de negócio — validar com a equipe da clínica".
- Itens 4 a 15 da revisão, telas, dados e publicação.

## Riscos
- Baixo. As telas que usam os itens 1 e 3 já exigem login.
- Item 2: se alguma rotina automática chamar a limpeza como usuário comum, ela passaria a falhar em silêncio (é limpeza "best-effort", não derruba nada). Antes de aplicar, confirmo que a limpeza de verificações da integração roda pelo servidor; se não rodar, mantenho essa função liberada a usuário logado.

## Validação
- Consultar as permissões depois: visitante sem acesso às 8; usuário logado com acesso só às 4 dos itens 1 e 3.
- Conferir que nada mais mudou (total de funções abertas a visitante cai de 76 para 68).
- Typecheck e testes existentes.

## Detalhes técnicos
Migração única, só permissões, assinaturas exatas:
```text
REVOKE EXECUTE ON FUNCTION <8 assinaturas> FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION <4 de limpeza> FROM authenticated;
GRANT  EXECUTE ON FUNCTION <4 dos itens 1 e 3> TO authenticated;
GRANT  EXECUTE ON FUNCTION <8 assinaturas> TO service_role;
```
Reversível com o GRANT inverso.
