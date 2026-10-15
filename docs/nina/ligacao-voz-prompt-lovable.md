# Comando para a Lovable — ligar o GPT-Live 1 na aba "Ligação"

Cole o texto abaixo no chat da Lovable depois que a branch `nina/ligacao-voz-demo` estiver no GitHub.

---

Conecte o modelo de voz GPT-Live 1 (Lovable AI, live voice) à aba "Ligação" do OS ZAP, que já está pronta no código.

**Contexto**
- A tela é `src/components/nina/LigacaoNina.tsx` e as funções de servidor estão em `src/lib/nina/ligacao/ligacao.functions.ts`.
- As instruções da Nina, as regras e as ferramentas já são montadas em `src/lib/nina/ligacao/contrato-ligacao.server.ts`. Não altere esse arquivo.
- A sessão usa delegação para um modelo de apoio. Esse modelo recebe as instruções (`instrucoesApoio`) e as ferramentas, e as chamadas de ferramenta são executadas pelo navegador via `executarFerramentaLigacaoNina`.

**O que fazer (somente nestes dois arquivos)**
1. `src/lib/nina/ligacao/sessao-live.server.ts`: ajuste `abrirSessaoLive` para abrir a sessão do GPT-Live 1 pelo gateway da Lovable com a `LOVABLE_API_KEY`. Confirme o endereço (`ENDPOINT_SESSAO_LIVE`), o corpo (`corpoSessaoLive`), o id do modelo de voz (`MODELO_VOZ_LIGACAO`), o id do modelo de apoio (`MODELO_APOIO_LIGACAO`) e o formato da resposta (SDP de resposta e id da sessão). Mantenha a voz em `audio.output.voice`, `store: false`, a delegação com as instruções e ferramentas recebidas e o transporte WebRTC com a oferta SDP do navegador.
2. `src/lib/nina/ligacao/conexao-live.ts` e, se preciso, os nomes de eventos em `src/lib/nina/ligacao/eventos-ligacao.ts`: confirme o nome do canal de dados (`CANAL_EVENTOS_LIVE`) e o formato dos eventos. Os formatos esperados são:
   - transcrição em `session.input_transcript.delta` e `session.output_transcript.delta`;
   - chamada de ferramenta em `response.output_item.done` dentro de `response.event`;
   - resultado devolvido com `response.item.create` (`function_call_output`) seguido de `response.create`;
   - encerramento com `session.close`, aguardando `session.closed`.

**Não fazer**
- Não altere instruções, regras, ferramentas, permissões, menu, flag nem a tela.
- Não crie migration nem tabela.
- Não grave o áudio e não registre em log o conteúdo das instruções nem as falas.
- Não exponha a `LOVABLE_API_KEY` ao navegador.

**Critério de aceite**
- Com a flag `nina_ligacao_demo` ligada na clínica, a aba "Ligação" abre. "Ligar" pede o microfone, a voz se apresenta e as falas aparecem na transcrição.
- Ao perguntar por um exame ou consulta, os "Bastidores" mostram "Consultou o catálogo publicado" e a resposta falada usa os dados do catálogo.
- Desligar encerra a sessão.
