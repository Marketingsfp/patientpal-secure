# Francisco — acompanhamento de orçamentos no OS ZAP

## Entrega

Área própria ao final do OS ZAP: Visão geral, Arquitetura, Voz, Mensagens,
Acompanhamento, Homologação e Histórico. Rota `/app/francisco`, com navegação por
hash. O módulo de permissão é `francisco`, independente de `nina`.

Configuração por clínica, rascunho e versão publicada, controle de revisão e
histórico. Quem tem escrita no módulo pode editar, registrar autorização e
homologar. Somente administrador pode publicar. Perfis existentes não ganham
acesso automaticamente. Administradores mantêm seu acesso total habitual.

Nada é acrescentado à tela de Orçamentos. O agente não altera orçamento,
paciente, preço, item, agenda ou financeiro. Pagamento permanece com a equipe.

## Comportamento desta versão

- D1: a partir de 24 horas após criar o orçamento; D4: a partir de 96 horas
  **da criação**, condicionado a D1 enviado quando essa etapa estiver habilitada.
- Horário inicial 09h–18h, segunda a sexta, `America/Sao_Paulo`, editável.
- Campanha inicia na primeira publicação, mesmo em simulação. Não recupera
  orçamentos anteriores. Não contata orçamento vencido ou com mais de sete dias.
- Orçamento aberto, com valor e itens, celular válido e opt-in documentado.
- Qualquer pagamento parcial/entrada, isenção ou item inaplicável impede a
  sequência. Recebimentos são conferidos por item, atendimento financeiro,
  agenda ligada ao orçamento e ponte agenda–item. Agendamento sozinho não paga.
- Conversa humana aberta ou entrada recente em conversa da Nina impede contato.
- No máximo um contato por telefone a cada 24 horas, inclusive entre orçamentos.
- Reserva única por orçamento/etapa; checagem financeira novamente na reserva
  e imediatamente antes de chamar a Meta. Erro de leitura bloqueia o envio.
- Qualquer resposta reconhecida interrompe os próximos contatos. Interesse em
  pagar/continuar e dúvidas usam o broker existente para encaminhar à equipe
  humana, preservando responsável humano, sem aviso automático ao paciente.
- Recusa explícita, como “não quero pagar”, “não tenho interesse” e `SAIR`,
  encerra em silêncio: não reabre conversa, não encaminha ao humano e não
  envia mensagem. A recusa bloqueia o acompanhamento por telefone na clínica,
  usando a RPC existente; uma nova autorização precisa ser registrada para
  acompanhamentos futuros. Conversas humanas existentes não são encerradas.
- Gemini 3.8 Flash (`google/gemini-3.8-flash`) interpreta respostas, com o
  template efetivamente enviado e as regras obrigatórias do system prompt.
  Recusas completas e inequívocas dispensam IA. Negações com continuidade,
  dúvidas, mídia sem transcrição e erro/saída inválida do modelo seguem ao
  humano. Recusa interpretada exige evidência literal no texto recebido.
  Não inicia uma conversa com a Nina e nunca envia texto produzido pelo modelo.
- A decisão é registrada de forma aditiva em `francisco_eventos`, por ID
  determinístico de clínica/mensagem. Retry reutiliza a mesma interpretação.
  O evento registra intenção, origem, modelo e uso quando informado pelo provedor.
  A RPC pausa os próximos contatos antes de aguardar IA; se o modelo reconhecer
  recusa, o contato também passa a recusado. O evento `resposta_classificada`
  registra o destino efetivo; o evento legado de registro da resposta não é
  comprovação de encaminhamento humano concluído.
- Resposta sem citação só é vinculada se não houve outro envio posterior ao
  Francisco. Uma citação explícita precisa corresponder ao remetente e à clínica.
- Envio sem confirmação completa fica `incerto`; sem reenvio automático.
  Reservas deixadas por interrupção também não são refeitas automaticamente.
- Estados de entrega são atualizados por webhook assinado, sem regredir
  mensagem lida/entregue por recibo atrasado.

Os contatos ativos são templates de texto. System prompt e temperatura são
próprios do Francisco; o modelo é Gemini 3.8 Flash. Personalizações ficam
subordinadas às regras obrigatórias de interpretação; não reescrevem
o template aprovado. Voz tem configuração e prévia próprias, usando somente o
transporte de síntese compartilhado. Não se envia áudio ativo nesta versão.

## Banco e segurança

### Homologação por conversa

A aba Homologação começa com **Iniciar com template** (D1 ou D4). O template
é renderizado exatamente a partir do rascunho com o nome da clínica, sem Meta,
número real ou criação de orçamento. Depois, o operador escreve como
Paciente Teste. A homologação autenticada usa o mesmo interpretador do
atendimento real e pode consumir IA. A decisão fica no evento da ação para
que retomadas não chamem o modelo novamente. Interesse e dúvidas mostram o
destino humano; recusa mostra encerramento silencioso. Os avisos de sistema
do teste são internos: nenhuma mensagem de fechamento é enviada ao paciente.
Eventos antigos preservam o resultado da regra anterior; novas ações registram
a versão das regras, sem reescrever o histórico.

**Avançar para D4** simula a passagem para 96 horas sem resposta/pagamento;
**Simular pagamento** interrompe os próximos templates, sem alterar o financeiro.
Um novo teste preserva o anterior. Cada conversa mantém uma cópia do rascunho
usado no início; mudanças posteriores só entram em novos testes. Templates de
etapas desativadas não iniciam teste. A homologação não exige publicação nem
aprovação da Meta e não valida entrega, aprovação ou elegibilidade financeira real.

O histórico reaproveita `francisco_eventos`, com eventos aditivos
`homologacao_chat_inicio` e `homologacao_chat_acao`. Não exige migração.
Consultas e ações são autorizadas por clínica, módulo e usuário; o teste de um
operador não é retomado por outro. Conversas são paginadas de 20 em 20 e ações
são relidas em páginas sem truncamento. Comandos têm UUID para retomada sem
duplicar mensagens. Testes não escrevem em contatos, envios reais ou filas
humanas. Na prévia local, ficam somente em memória até sair da aba, sem IA;
apenas recusas diretas são reconhecidas e as demais respostas simulam o humano.

O teste auxiliar de interpretação permanece separado e recolhido, exibindo a
decisão do mesmo classificador em vez de gerar propostas de mensagem.

Migração aditiva `20261008193000_francisco_orcamentos.sql`:

| Tabela               | Finalidade                                                      |
| -------------------- | --------------------------------------------------------------- |
| `francisco_config`   | Rascunho, publicado, revisão, início e cursor da rotina         |
| `francisco_eventos`  | Versões, autorização, homologação e respostas                   |
| `francisco_contatos` | Autorização/recusa/interrupção por clínica e telefone           |
| `francisco_envios`   | Reserva, texto/configuração usados, ID Meta, entrega e resposta |

Leitura exige vínculo ativo e permissão do módulo. Escrita/RPCs somente pelo
servidor com autorização. O navegador não recebe credenciais da Meta, chave de
IA ou token da rotina. Os novos tipos devem ser regenerados após aplicar a
migração; até lá, as consultas às novas tabelas ficam isoladas no servidor.

Template é conferido na Meta por nome/idioma/status `APPROVED` e corpo exato.
Suporta BODY e FOOTER sem parâmetros extras; `{{1}}` é o nome da clínica.
Não há submissão automática de template. Não há nomes, exames ou valores do
paciente no primeiro contato proposto.

## Implantação e ativação separadas

Esta alteração começa desativada. A migração não agenda nem envia mensagens.

1. Revisar/aplicar a migração em ambiente isolado e publicar o código.
2. Liberar o módulo aos perfis necessários na tela de permissões.
3. Publicar a configuração em **simulação** para fixar o início da campanha.
4. Homologar o modelo e a voz; conferir candidatos, pagamentos, autorização,
   pausas, duplicidade e encaminhamento com dados de teste.
5. Submeter os templates pelos canais da clínica e aguardar aprovação da Meta.
   Conferir os nomes, texto e idioma na aba Mensagens.
6. Confirmar o departamento humano ativo, opt-ins e atendimento preparado.
7. Somente após revisão, configurar `FRANCISCO_ENVIO_REAL=true` no **servidor**,
   publicar modo real com rotina habilitada e ativar o agendamento.

Endpoint preparado: `POST /api/public/hooks/francisco`, sem parâmetros de envio
fornecidos pelo cliente. Autenticação constante no tempo por `x-job-token`,
obtido em `sistema_job_tokens`, nome `francisco-orcamentos`. Não expor esse token.

Para pg_cron/pg_net já instalados, preparar o agendamento abaixo com a origem
real da implantação. Executar somente após as validações acima. Não usar um
host de preview efêmero. O endpoint sempre aplica as travas do servidor e da
configuração publicada.

```sql
SELECT cron.schedule('francisco-orcamentos', '*/10 * * * *', $job$
  SELECT net.http_post(
    url := 'https://ORIGEM_DA_IMPLANTACAO/api/public/hooks/francisco',
    headers := jsonb_build_object(
      'Content-Type','application/json',
      'x-job-token',(SELECT token FROM public.sistema_job_tokens WHERE nome='francisco-orcamentos')
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 60000
  );
$job$);
```

Leitura com cursor em lotes de 20, até 100 examinados por rodada, retomada na
rodada seguinte. Não há teto total de orçamentos. Até 40 tentativas por rodada,
padrão 20, com orçamento de tempo de 40 segundos e timeout de 15 segundos por
envio. Meta/financeiro indisponível interrompe ou bloqueia o processamento.

Pausar: desativar/publicar a rotina ou remover a liberação do servidor;
desativar também o job cron. Preservar registros e tabelas para auditoria.
Rollback do código: retornar ao commit anterior, mantendo o envio real
desligado. Não apagar a migração/tabelas ou eventos históricos.

## Limites de verificação

Testes locais executam as funções da migração em PostgreSQL WASM (PGlite), sem
conectar ao banco real ou enviar WhatsApp. Prévia visual local em
`/dev/francisco`, bloqueada em produção. Serviços reais de IA/voz/Meta e entrega
final exigem homologação na implantação com credenciais já configuradas.

Validação anterior da entrega inicial: 63 testes, TypeScript e build passaram.
Na atualização de recusa silenciosa, 130 testes distintos do escopo e regressão
passaram, cobrindo interpretação, preservação do histórico, decisões concorrentes
e consumo da entrada sem chamar Nina ou enviar fechamento. TypeScript e build
de produção passaram; lint do escopo sem erros, com avisos de tipagem existentes.
Playwright local verificou recusa, SAIR, interesse, negação
com continuidade, D4, pagamento, modelo/prompt e tela móvel. Esses testes usam
serviços simulados; não comprovam classificação pelo Gemini real, aprovação
dos templates ou implantação. A matriz geral de permissões tinha três falhas
preexistentes (`nina-jev` e `painel-tv-atendimento`), fora deste escopo.

O envio externo e um pagamento que ocorre simultaneamente não podem formar
uma única transação. A checagem final reduz essa janela; aceite pela Meta
seguido de falha local exige conciliação humana, sem repetir o disparo.
Histórico mostra `incerto` e o ID Meta quando este pôde ser persistido.

## Impactos

- Financeiro: só leitura; bloqueia contato após entrada/recebimento e não cobra.
- Operação: aproveita número WhatsApp e fila humana; configuração independente.
- Paciente: apresentação breve, cadência limitada e opção de saída.
- Segurança/auditoria: escopo por clínica, módulo próprio, versões e reservas.
- Ganho: acompanhamento consistente sem interferir no atendimento da Nina.
- Risco principal: vínculos financeiros antigos incompletos ou falha após aceite
  do provedor; homologar esses dados e conciliar estados incertos antes de ativar.
