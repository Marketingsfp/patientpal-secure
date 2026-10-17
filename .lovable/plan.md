# Atualizar modelos antigos sem publicar

## Resultado da verificação

**Carência:** `contratos_assinatura.carencia_desde` já existe como `date` no banco atual. Uma consulta somente leitura ao campo executou sem erro. O alerta de coluna ausente foi encerrado como desatualizado. Nenhuma alteração no banco, na carência ou em contratos é necessária para esse alerta; isso não comprova todos os demais comportamentos do convênio.

**IA:** o catálogo autenticado confirmou modelos antigos ainda usados no código. A disponibilidade do espaço de trabalho foi verificada (`workspace_models: included`). O catálogo não informou mapeamentos automáticos de substituição; portanto não foi possível confirmar redirecionamentos. Nenhuma interrupção futura será anunciada com base apenas nos registros históricos ou em datas sem significado de retirada explicitamente confirmado.

## Mudanças propostas

1. Trocar `google/gemini-2.5-flash` por `google/gemini-3.8-flash` nas chamadas de assistência de atendimento, consulta, exames, resumo/aviso de transferência, projeção financeira, leitura de pedidos médicos, leitura de imagem/áudio do WhatsApp e extração de informações da NFS-e. Preservar permissões, prompts, limites de saída, formatos de resposta, tempos de espera e tentativas existentes, exceto incompatibilidades efetivamente comprovadas do novo modelo.
2. Trocar a transcrição `openai/gpt-4o-transcribe` por `openai/gpt-transcribe`, conferindo os campos aceitos, português, dica de vocabulário e resposta esperada pela tela.
3. Para a voz, verificar o contrato de `google/gemini-3.1-flash-tts-preview` como candidato ao `openai/gpt-4o-mini-tts` da Nina e do fallback do painel de senhas. A mudança não é apenas um nome: Nova e as outras vozes OpenAI, velocidade, orientações e MP3/Opus/WAV precisam de equivalentes verificados. Não modificar preferências gravadas nem substituir vozes silenciosamente. Se não houver equivalente que preserve os recursos, manter essas chamadas intactas e informar a limitação; não bloquear o funcionamento atual.
4. Atualizar os padrões antigos dos scripts de homologação para o modelo atual da Nina. Preservar modelos de execuções históricas, exemplos históricos e testes que deliberadamente mencionam versões antigas. Corrigir somente identificações de arquitetura que descrevam chamadas atuais migradas.

## Impactos e limites

- **Financeiro:** sem mudança de cobranças, contratos, pagamentos ou notas emitidas. No catálogo, Gemini 3.8 Flash custa US$ 0,75 por milhão de tokens de texto de entrada e US$ 3,75 de saída, contra US$ 0,30 e US$ 2,50 do 2.5 Flash: entrada 2,5 vezes e saída 1,5 vez o preço. A transcrição nova cobra US$ 0,0045 por segundo de áudio; a antiga usa tokens, portanto não há comparação exata sem uma amostra. TTS Gemini 3.1 cobra por tokens de texto/áudio; confirmar custo da amostra antes de concluir equivalência.
- **Operação e paciente:** preservar os recursos existentes, inclusive fallback local do painel de senhas e resposta em texto quando o áudio falha. Qualidade, voz e velocidade percebida precisam de testes; não há promessa de ganho de latência.
- **Segurança:** as superfícies propostas de chat, transcrição e fala têm retenção `zero` no catálogo. Não migrar para Gemini Interactions, que tem retenção diferente. Confirmar região e acesso nas chamadas de teste. Sem alteração de autorização ou isolamento entre clínicas.
- **Risco técnico:** mudança em vários módulos, com risco maior na voz por incompatibilidade de controles e formatos. Implementar em grupos pequenos e revisáveis.
- **Regras de negócio:** nenhuma alteração. As mudanças de NFS-e limitam-se à chamada de IA; não emitir, reenviar nem reparar notas.
- **Tempo:** execução em etapas, dependendo da confirmação dos formatos de voz e das verificações reais.
- **Ganho esperado:** reduzir dependência de modelos marcados como antigos, sem modificar os modelos já suportados.

## Validação

- Testes locais das chamadas afetadas, com respostas simuladas e dados fictícios; verificar entradas, histórico, JSON, erros e formatos de áudio, sem testes de textos ou aparência.
- Uma amostra real e curta por contrato de chamada alterado, exclusivamente fictícia; transcrição com fala real sintetizada de teste e imagem/PDF de pedido fictício. Essas chamadas usam créditos de IA, mas não gravam dados clínicos, enviam mensagens a pacientes nem movimentam financeiro.
- Conferir os recursos pela prévia com uma conta autorizada quando necessário. Relatar como pendente qualquer fluxo não acessível ou contrato não confirmado, sem declarar verificação completa com apenas testes isolados.
- Executar testes existentes afetados e lint dos arquivos alterados; conferir o resultado automático da compilação e da checagem de tipos, sem iniciar compilação manual.
- Negativa de acesso, recusa ou indisponibilidade encerra o teste afetado, sem trocar modelos ou repetir a chamada para contornar a negativa.
- Encerrar o alerta de IA como corrigido somente depois de verificar as mudanças aplicáveis e explicitar eventuais chamadas mantidas por falta de equivalente compatível.

## Detalhes técnicos

- Chat: preservar `/v1/chat/completions`, incluindo entradas multimodais e identificação de modelo nos registros de auditoria das chamadas migradas.
- Transcrição: preservar `/v1/audio/transcriptions`; adaptar apenas os campos exigidos pelo modelo ativo.
- Voz: consultar os exemplos/formato Gemini antes da implementação, verificar compatibilidade dos consumidores e não alterar configuração persistida por inferência.
- Sem migração de banco, publicação, recuperação de commits, refatoração geral ou alterações da Área do Paciente.