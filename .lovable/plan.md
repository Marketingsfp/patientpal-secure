# NFS-e parte 1b — corrigir alíquota e ISS das notas antigas pelo XML oficial

## Tipo e risco
- Tipo: dados fiscais errados guardados no sistema (a nota tem os valores do cadastro, não os autorizados). Qual alíquota é a correta continua sendo decisão fiscal.
- Área crítica: altera `aliquota_iss`, `valor_iss` e `retorno_conferencia` de notas **emitidas**. Você autorizou isso de forma explícita neste pedido. Nenhum outro campo é alterado.

## Situação no banco agora
- 2.733 notas `emitida`, todas com caminho do XML. Nenhuma tem `retorno_conferencia`. ISS gravado hoje: R$ 8.152,87.
- (Você citou 2.903 linhas, mas esse número conta todos os status. Só as 2.733 emitidas entram.)

## O que será construído
1. **Uma rotina que corrige um lote por vez** (server function, só admin da clínica):
   - pega até 100 notas `emitida` da clínica escolhida, com XML e com `retorno_conferencia` vazio;
   - baixa cada XML na Focus, até 5 ao mesmo tempo, com limite de 10 s por download (só leitura);
   - lê a alíquota e o ISS com `lerXmlNfse`, a mesma leitura que já existe;
   - se tiver os dois: grava `aliquota_iss` e `valor_iss` do XML e `retorno_conferencia = { origem: "backfill_xml_1b", conferido_em, xml_lido: true, anterior: {aliquota, iss}, divergencia_aliquota }`;
   - se falhar: grava só `retorno_conferencia = { origem, falha: "xml_nao_baixou" | "xml_sem_campos" | "sem_caminho" }`, e alíquota e ISS **não mudam**;
   - devolve as contagens do lote: corrigidas, com divergência, falhas por motivo, e ISS antes e depois.
   - Vou usar a mesma condição `retorno_conferencia is null` para o lote pular o que já foi feito. Rodar de novo não refaz nada. Para tentar de novo uma nota que falhou, existe a opção "tentar de novo as falhas".
2. **Um botão "Corrigir ISS pelo XML"** na tela de NFS-e (só aparece para admin):
   - Antes de tudo, "Rodar amostra (20 notas)".
   - Depois, "Continuar": um lote por clique, ou vários lotes seguidos com 3 s de pausa entre eles.
   - Mostra o total acumulado: notas corrigidas, ISS antes e depois, falhas por motivo.
   - **Trava de divergência:** se, depois dos primeiros 100, mais de 50% das notas vierem com alíquota diferente da gravada, a rotina para e mostra um aviso. Ela só continua se você marcar "Entendo, continuar". Esse limite de 50% foi escolha minha, então confirme se está bom.
3. Os testes do módulo puro ganham casos para: a nota corrigida, o XML sem campos e a nota que já tem conferência (é pulada).

## O que não muda
Não mexo em `payload_envio`, `payload_resposta`, no cadastro do emitente, na emissão, em pagamento, boleto, split nem contas a receber. Notas canceladas e com erro ficam de fora. Nada roda sozinho ao abrir o sistema. Nada é publicado.

## Como rodar
Depois de aprovado, eu mesmo rodo **só a amostra de 20 notas**, confiro no banco e te mostro o resultado. As outras você roda pelo botão, ou eu rodo se você pedir. No fim, informo quantas notas foram corrigidas, o ISS antes e depois e as falhas por motivo.

## Detalhes técnicos
- Novo `src/lib/nfse-backfill.ts` (função pura: `resultadoBackfill(xml|null, gravado)`), `src/lib/nfse-backfill.functions.ts` (`corrigirIssLote`, `requireSupabaseAuth` + `has_role admin`, update via `supabaseAdmin` só nas colunas `aliquota_iss, valor_iss, retorno_conferencia`, com filtro `status='emitida' and retorno_conferencia is null`).
- O token segue a mesma regra de `consultarNfse` (produção/homologação conforme o emitente). O download usa `url_xml` ou `payload_resposta.caminho_xml_nota_fiscal`.
- Sem migração: as colunas já existem.
