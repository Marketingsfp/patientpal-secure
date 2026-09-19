# Omissão de cargos e equipes na identificação do profissional

Regra de negócio solicitada em 19/09/2026. Aplica-se ao WhatsApp e à homologação, para todas as clínicas. A edição dos registros da base de conhecimentos foi expressamente deixada pelo usuário para um próximo comando; nenhum registro do catálogo foi alterado aqui.

## Comportamento

Antes, a proteção reconhecia somente técnico/técnica. “Enfermagem” podia aparecer como nome do profissional, como no caso do eletrocardiograma enviado pelo usuário.

Agora, a Nina apresenta nomes próprios publicados na identificação. Cargos, equipes e setores como técnico, técnica, enfermagem, enfermeiro, enfermeira ou equipe de enfermagem são omitidos. O exame/procedimento passa a ser o título, sem linha “Profissional:” vazia e sem nome inventado. Dias, horários, valores, modalidade, critérios, preparo e orientações são preservados.

A regra também cobre resumos e confirmações. Em listas mistas, os nomes próprios são mantidos. SFP continua sujeito ao encaminhamento humano silencioso prioritário.

## Implementação

- `regras-catalogo.ts`: amplia o reconhecimento de marcadores completos de cargo/equipe e a remoção de identificações genéricas em texto simples ou formatado. Não remove palavras que façam parte de nomes próprios nem descrições como “técnica de ultrassom”.
- A projeção dos dados fornecidos ao modelo filtra campos de nome e listas de profissionais. Mantém IDs internos, a mensagem do paciente, especialidades e orientações de preparo; não modifica o objeto de origem nem grava no catálogo.
- O catálogo sinaliza a omissão usando o mesmo reconhecimento. A finalização compartilhada do WhatsApp/homologação e os templates de agendamento usam a mesma proteção.
- As instruções de fallback e a instrução publicada foram alinhadas, incluindo a regra de escolha da data para profissional único.

## Publicação e validação

Na Arquitetura, a versão encontrada era a v34, sem rascunho pendente. Foram alterados somente o item de omissão de nomes na LING-02 e a referência correspondente da CONV-07. Rascunho v35 e **v36 publicada em 19/09/2026 às 09:19 (America/Sao_Paulo)**. Após recarregar, o texto persistido foi comparado integralmente com o preparado: 39.631 caracteres. O histórico das versões foi preservado.

- **209 testes passaram**, em sete arquivos: regras do catálogo, fluxo compartilhado de geração, preservação de resposta com nome próprio, composição do prompt, executor e continuidade da agenda. Incluem os casos Enfermagem e Equipe de Enfermagem nos dois ambientes, formatos de mensagem, resumo/confirmação, listas mistas, manutenção de dados e regressão do SFP.
- `bun run typecheck` e `git diff --check` passaram.
- Homologação com modelo real: Paciente Teste 10, sessão 20, ciclo `71b1f64a`. Enviada a mesma pergunta da imagem: “Olá, gostaria de saber como funciona o eletrocardiograma.” A resposta usou Eletrocardiograma como título, sem identificação Enfermagem, mantendo os horários de comparecimento, R$ 51,00 no dinheiro, R$ 60,00 no cartão, critério e ordem de chegada sem agendamento prévio.
- O rastreio confirmou prompt 36 e `consultar_base_conhecimento` concluída. O ciclo foi resolvido às 09:22, preservando o histórico; o lead ficou na sessão 21, nova e sem mensagens.
- Não houve envio ao WhatsApp nem criação de paciente ou agendamento. A implantação da proteção adicional em código é separada da publicação do prompt; a verificação na interface comprova o comportamento da instrução publicada.
