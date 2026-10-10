# Foto de pedido MAPA — sessão 921 / MJ-867

Análise de 10/10/2026. Classificação: erro de identificação antecipada e apresentação de motivos internos.

## Evidência do teste existente

Consulta somente de leitura à homologação da Policlínica Menino Jesus, sessão 921, protocolo MJ-867, resposta registrada em 10/10/2026 às 08:55 (Brasília).

- A foto contém solicitação escrita de MAPA 24h. Não é necessário interpretar a indicação clínica para identificar o item solicitado.
- “O que o paciente enviou” mostrou a transcrição: `Enviei a foto de um pedido médico com: MAPA 24h.`
- Leitura da foto: `google/gemini-2.5-flash`, resposta bem-sucedida, 2,7 segundos.
- Jev classificou intenção `exame`, confiança 0,88. Sua decisão de encaminhamento não foi aplicada.
- A pré-busca registrou `tipo: profissional`, `termo: MAPA`, ferramenta `buscar_medicos`.
- O núcleo acionou `solicitar_atendente_humano` com `HORARIOS_HABITUAIS_NAO_INFORMADOS: MAPA. A equipe deve conferir a escala; não consultar vagas nem substituir o profissional.`
- Foram registradas zero rodadas do modelo de conversa. O aviso foi produzido pelo sistema de encaminhamento, com transferência simulada.

Portanto, a imagem foi identificada. O encaminhamento não ocorreu por foto ilegível, pedido de atendente ou decisão do modelo de conversa. A pré-busca pode associar uma palavra distintiva do nome solicitado a um recurso cadastrado entre os profissionais quando o título completo do serviço não coincide literalmente com a transcrição.

A explicação interna reproduzia o motivo gravado, mas chamava o recurso MAPA de profissional. Ela não comprova que faltavam horários do exame correto. Não foi possível confirmar com segurança a escala publicada do MAPA: o navegador autenticado ficou indisponível antes dessa conferência.

## Alteração local

- Transcrição de foto sem correspondência por nome completo no catálogo de serviços segue à identificação normal. Não buscar um profissional antecipadamente por palavra do item fotografado.
- Serviço inequívoco continua elegível à pré-busca. Busca por profissional explicitamente informado em mensagens comuns mantém seu comportamento.
- A apresentação de falta de escala passa a mencionar “atendimento identificado”. O código e o motivo original continuam disponíveis na auditoria.
- `FOTO_NAO_LIDA_APOS_NOVA_TENTATIVA`: **Foto não identificada** — não foi possível identificar com segurança o pedido na nova foto após solicitar uma imagem mais nítida; a equipe deve conferir o documento anexado.
- `FOTO_FALHA_TECNICA_PERSISTENTE`: **Falha técnica no processamento da foto** — falha após reenvio ou limite de itens excedido; a legibilidade não foi confirmada e a equipe deve conferir o anexo.
- Conteúdo fora da leitura administrativa permanece em `FOTO_REQUER_AVALIACAO_HUMANA`.

Sem reclassificar registros antigos, alterar catálogo, agenda, banco, permissões ou prompt publicado. Mantidas as tentativas de leitura, a confirmação de seleção de exames, as validações de escala/consentimento e a transferência simulada da homologação. Mudança comum a todas as clínicas; a pré-busca conserva seu controle existente `nina_prefetch_cadastro`.

## Validação e limites

Testes locais verificam a colisão MAPA 24h / MAPA 24 HORAS / recurso MAPA, preservação de serviços inequívocos, motivos em evento/grupo/marcador e imutabilidade dos registros apresentados. As regressões de fotos e escala usam o núcleo real com serviços externos simulados. Não comprovam nova interpretação visual ou resposta do modelo publicado.

- 132 testes aprovados nas seis suítes de pré-busca, motivos, apresentação interna, fotos e escala.
- Lint dos cinco arquivos de código/testes alterados e formatação: sem erros.
- Playwright: componentes reais renderizados com registros fictícios, três causas, desktop e celular; sem erro de JavaScript, transbordamento horizontal ou acesso à rede externa. Prévia e capturas locais em `output/nina-foto-motivos-*` (ignorados pelo Git).
- Tipagem global (`tsc --noEmit`): reprovada por 11 diagnósticos no Dashboard OS ZAP (`DashboardOsZapView`, `dashboard-oszap-periodos`, `dashboard-oszap` e testes do Dashboard). Esses arquivos têm alterações locais de outro trabalho e foram preservados. Nenhum diagnóstico nos arquivos desta mudança. Registro completo local em `output/nina-foto-mapa-typecheck.log`.
- Conferência para envio ao Git: tipagem completa aprovada em uma cópia exata do conteúdo preparado para o commit, sem incluir as alterações locais do Dashboard. As suítes desta mudança passaram novamente junto às de simulação/departamentos (307 testes no conjunto). Registros locais em `output/git-simulacao-*`.

Pendente publicar o código e validar um novo turno de homologação na versão implantada. A consulta feita não enviou mensagens, criou reservas ou alterou a sessão existente. Nenhuma nova chamada real de IA foi executada.
