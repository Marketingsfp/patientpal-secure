# Defeito registrado — blocos `user` duplicados na montagem do contexto

Status: **registrado, não corrigido** (fora do escopo da FASE 5).

## O que foi observado

Caso de referência: o paciente enviou **uma** mensagem (`TESTE-ARQUITETURA-9381`)
e o resumo do turno registrou corretamente **1 mensagem recebida**. A requisição
registrada (etapa `contexto_modelo`), porém, continha **dois blocos `user` com o
mesmo conteúdo**.

## O que a FASE 5 fez

- Separou, no painel, "mensagens recebidas no turno" de "entradas enviadas ao
  modelo".
- **Preservou** a duplicação na evidência e passou a apontá-la explicitamente,
  em vez de deduplicar a visualização e esconder o problema.

## O que a FASE 5 NÃO fez

- Não alterou a montagem do contexto nem qualquer parte da geração da resposta.
- Não removeu, reescreveu ou deduplicou evidências já gravadas.

## Onde investigar quando o defeito for corrigido

- `src/lib/whatsapp.server.ts` — montagem do histórico e da mensagem do turno.
- `src/lib/nina/prompt-composer.ts` — composição final das mensagens.
- `src/lib/nina/ai-gateway.server.ts` — ponto onde o `messages` final é
  registrado como evidência (`contexto_modelo`).

Critério de encerramento: para uma mensagem recebida sem rajada, a requisição
registrada deve conter um único bloco `user` com o texto do paciente.
