# Fluxo completo e detalhado do ClinicaOS

Já existem 8 arquivos em `/mnt/documents/fluxo-sistema/` (índice + 7 módulos), mas em nível de visão geral. Vou **reescrever e expandir** cada um para conter o fluxo ponta-a-ponta com: telas, ações do usuário, tabelas tocadas, RPCs/server functions, regras de negócio, integrações externas e diagramas Mermaid por subfluxo.

## Estrutura final (em `/mnt/documents/fluxo-sistema/`)

```text
00-indice.md                      Índice navegável + diagrama macro do sistema
01-visao-geral.md                 Stack, multi-clínica, RLS, auth, layout autenticado
02-cadastros.md                   Pacientes, médicos, enfermagem, procedimentos, splits
03-agenda-atendimento.md          Disponibilidade, agendamento, check-in, triagem, IA
04-orcamentos-cartao.md           Orçamentos, consumo parcial, Cartão Benefícios, contratos
05-financeiro-nfse.md             Caixa, pagamentos, splits, boletos, NFS-e (DPS Nacional)
06-enfermagem-odonto-extras.md    Recursos enfermagem, odontograma, CRM, Nina IA, estoque
07-rh-marketing-portais.md        RH/Ponto, LMS, Marketing, Portal Paciente, Totem, Face
08-integracoes-webhooks.md        Focus NFe, WhatsApp, ViaCEP, Gemini, Whisper, pg_cron
09-seguranca-rls.md               user_roles, has_role, políticas RLS, GRANTs, auditoria
```

(2 arquivos novos: `08-integracoes-webhooks.md` e `09-seguranca-rls.md`.)

## O que cada arquivo passa a conter

Para cada módulo, na ordem:

1. **Mapa de telas** — rotas em `src/routes/_authenticated/app.*` com finalidade.
2. **Fluxo do usuário passo a passo** — clique a clique, do início ao fim.
3. **Diagrama Mermaid** do fluxo principal + sub-diagramas para ramificações.
4. **Camada de dados** — tabelas Supabase tocadas (insert/update/delete), RPCs e server functions (`*.functions.ts`) chamadas em cada passo.
5. **Regras de negócio** — validações, cálculos, hierarquias (ex.: regra de preço CB, splits, consumo parcial de orçamento, código tributário 3 dígitos).
6. **Integrações** — quando o passo dispara chamada externa (Focus NFe, ViaCEP, Gemini Vision, Whisper, WhatsApp).
7. **Erros conhecidos e tratamento** — ex.: E0014/E0160/E0712 da NFS-e, auto-sync de RPS, fallback de paciente órfão no agendamento por orçamento.
8. **Permissões** — quais roles/permissions liberam cada ação (`permissoes-presets.ts`, `has_role`).

## Diagramas-chave

- **Macro** (00): autenticação → escolha de subsistema → módulos clínicos/financeiros/RH.
- **Cadastro/busca de paciente** (02): `buscar_pacientes_agenda` RPC, índice de prefixo, autocomplete.
- **Agendamento completo** (03): disponibilidade → slot → check-in → triagem → atendimento IA → prontuário.
- **Orçamento → Agenda** (04): criação, divisão por item, consumo parcial, status verde/âmbar.
- **Cartão Benefícios** (04): venda, dependentes, faixas de preço, mensalidades, repasse de cartão consulta.
- **Pagamento + NFS-e** (05): caixa → split → boleto/PIX → emissão DPS Nacional → polling Focus → webhook → DANFSE.
- **Webhooks** (08): Focus NFe (auth header), WhatsApp por clínica, callbacks públicos sob `/api/public/*`.

## Entrega

Substituo os 8 arquivos existentes pelos 10 novos arquivos detalhados em uma única rodada (em paralelo). O índice (`00-indice.md`) ganha uma tabela com link, finalidade, principais tabelas e principais rotas de cada módulo.

## Confirmações antes de executar

1. **Tamanho**: cada módulo deve ficar em ~400–700 linhas (denso, mas legível). Posso reduzir se preferir resumido.
2. **Formato adicional**: quer também um **PDF consolidado** ou um único Markdown gigante além dos arquivos por módulo?
3. **Diagramas**: mantenho tudo em Mermaid embutido nos `.md`, ou gero também arquivos `.mmd` separados em `/mnt/documents/fluxo-sistema/diagramas/` para você abrir no draw.io?
