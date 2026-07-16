## Diagnóstico primeiro (antes de qualquer alteração)

Verifiquei no banco os pagamentos das mensalidades dos últimos 30 dias:

| Caso | Vai pro caixa hoje? |
|------|--------------------|
| Mensalidade paga via "Registrar pagamento" (LancamentoDialog) | **Sim** — todas as 9 amostras têm movimento de caixa vinculado ao usuário que fez |
| Taxa de adesão (RPC separada) | **Sim** — mesmo RPC atômica, movimento no caixa do operador |
| Consulta com desconto do cartão (Agenda → Pagamento) | **Sim** — mesmo LancamentoDialog |
| Mensalidade marcada como "paga historicamente" (botão Other) | **Não** — é intencional; regra da governança "sem gerar receita" |
| Pagamentos importados / MJ / manuais antigos (`forma = manual`, sem `lancamento_id`) | **Não** — legados anteriores ao RPC atômico |

**Conclusão sobre o caixa:** o fluxo padrão já cai no caixa do usuário logado. Não precisa código novo — a RPC `fn_registrar_lancamento_e_caixa` já abre sessão automaticamente pro operador se não houver uma aberta. Vou apenas confirmar isso na resposta e deixar a regra visível.

**Gap real → NFS-e:** hoje **não existe botão de "Emitir NFS-e" nas telas onde esses pagamentos são feitos**:
- Mensalidade e taxa de adesão (aba Parcelas do contrato) — só imprime GR, sem emissão fiscal.
- Consulta com desconto do cartão benefício → **já tem** botão de NFS-e na Agenda e em Financeiro › Atendimentos (herda do fluxo padrão, reaproveita `pickTomador` com % e endereço).

## Escopo desta alteração

Só código de UI (front). Nenhuma alteração em RPC, tabela, RLS, contrato, financeiro core ou regra de repasse.

### 1. Botão "Emitir NFS-e" na aba Parcelas (mensalidade + taxa adesão)

Em `src/components/pages/contratos-page.tsx`, na linha de cada parcela paga:
- Adicionar botão `Emitir NFS-e` visível apenas quando `status = pago` E `lancamento_id != null` (parcelas históricas/manuais ficam sem botão, com tooltip "não gera NFS-e — pagamento fora do sistema").
- Se a parcela já tem NFS-e emitida (procurar `nfse.pagamento_id = lancamento_id`), o botão troca por link "NFS-e nº X • PDF" + botão "Cancelar" (fora do escopo desta rodada).
- Fluxo idêntico ao já existente: chama `pickTomadorNfse` (bloqueia endereço, escolhe % — o operador escolhe no momento) → `pedirDescricaoNfse` → `emitirNfse` → grava `pagamento_id = lancamento_id` na nfse.
- Descrição sugerida:
  - Mensalidade: `Mensalidade N/12 — Cartão Benefício <Convênio> — Contrato #<numero> — <Paciente>`
  - Taxa adesão: `Taxa de adesão — Cartão Benefício <Convênio> — Contrato #<numero> — <Paciente>`

### 2. Confirmar botão NFS-e na Agenda para consulta paga com cartão

Já existe. Vou apenas verificar que a descrição sugerida inclua o rótulo "Cartão Consulta" quando `isCartaoConsultaDesc(descricao_lancamento)` for verdadeiro, pra o operador identificar rapidamente na hora de confirmar.

### 3. Emitente

Reusa o mesmo picker de emitente. Regra existente no `emitirNfse` já força o CNPJ correto (consulta → CASA DE SAUDE; exame → MA IMAGENS). Mensalidade e taxa de adesão não batem em nenhum dos dois filtros — sai no emitente escolhido pelo operador. **Confirmar com você:** hoje as mensalidades devem sair em qual CNPJ? Se sempre no mesmo, adiciono a mesma regra automática (detecção pela descrição `MENSALIDADE`/`ADESAO`) — se não, deixo livre.

## Impacto (4 eixos)

- 💰 **Financeiro:** neutro — só emite documento fiscal já existente no banco (o pagamento já está lançado). Nenhum risco de duplicidade porque grava `pagamento_id = lancamento_id` e checa antes.
- ⏱️ **Operacional:** elimina 4-5 cliques (hoje precisa ir em Financeiro › Notas e criar tudo manualmente).
- 😊 **Experiência:** paciente recebe NFS-e da mensalidade automaticamente (email) sem passar de novo na recepção.
- 🛡️ **Segurança:** respeita `usePodeEscrever("financeiro")` no botão, mesmo controle de acesso das outras emissões.

## Fora do escopo (proponho tratar depois se quiser)

- Cancelamento/estorno de NFS-e a partir da aba Parcelas.
- Emissão em lote de várias mensalidades de uma vez.
- Regra "auto-emitir NFS-e ao dar baixa" (checkbox no LancamentoDialog já existe, mas não dispara nada hoje).
- Backfill de NFS-e para mensalidades já pagas antes desta alteração.

## Ponto que preciso confirmar

**Qual emitente (CNPJ) deve ser usado para mensalidade e taxa de adesão do cartão benefício?** Opções:
1. Sempre um CNPJ específico (me diga qual, mesmo padrão de "consulta → 31.919.483/0003-18").
2. Deixar o operador escolher no diálogo (mesmo comportamento atual das notas avulsas).

Aguardo essa resposta antes de aplicar.