# FASE 6 — Score auditável e vinculado à mensagem certa

## Antes

- O indicador da mensagem era buscado por `execucao_id`; não havia vínculo com
  a mensagem que o paciente realmente recebeu.
- Evidência estruturada de conflito era descartada pela sanitização.
- A calibração podia marcar como errada qualquer decisão da mesma conversa.
- Não havia taxa de erro em alta confiança por faixa de score.
- Mensagem gerativa podia exibir 100%.

## Depois

- `nina_confianca_decisoes` guarda `outgoing_message_id`, `nina_session_id`,
  `engine_version`, `evidence_coverage` e `conflitos`.
- Após enviar (produção e homologação), o snapshot é ligado ao id da mensagem
  enviada; a leitura prefere esse vínculo e só cai para a execução em registros
  antigos. Sem snapshot válido: "Não avaliada", nunca 100%.
- A sanitização preserva conflito em formato fechado: whitelist de chaves,
  profundidade 2, limite de itens/tamanho, sem PII, sem prompt, sem raciocínio.
  O painel mostra campo, origem A/valor A e origem B/valor B.
- Detalhes compactos: confiança, nível, cobertura de evidências, status por
  dimensão, motivos, política, motor e ambiente.
- Calibração e métricas correlacionam erro por mensagem ou execução; conversa
  só para reportes legados sem nenhum dos dois.
- Novas métricas: High Confidence Error Rate e faixas 90–99, 75–89, 50–74,
  0–49 com previsto x observado.
- Teto visual de 99% para resposta gerativa (proteção de interface; o score
  gravado não muda).

## Validação executada

- `bunx tsgo --noEmit`: sem erros.
- `bun test src/lib/nina`: 1.048 testes, 0 falhas.
- Migration aplicada no banco (apenas colunas novas; nenhuma permissão/RLS
  alterada). O linter retornou 243 avisos pré-existentes, não introduzidos aqui.

## Pendências

- Não houve fluxo vivo: nenhum envio de WhatsApp, agendamento, handoff real ou
  teste transacional foi executado.
- O vínculo pós-envio e as faixas de calibração precisam de dados reais
  acumulados para conferência estatística.
