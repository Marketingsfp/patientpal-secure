---
name: Identidade configurável do atendimento (aba Arquitetura)
description: Bloco [IDENTIDADE DO ATENDIMENTO] no prompt publicado define nome da atendente, nome e tipo do estabelecimento; sem cadastro paralelo
type: feature
---

## Objetivo

Definir, dentro do próprio prompt publicado na aba Arquitetura:

- Nome da atendente virtual
- Nome do estabelecimento usado no atendimento
- Tipo do estabelecimento (Clínica, Policlínica, Hospital ou texto livre)

Bloco editável, parte da MESMA versão publicada do prompt:

```
[IDENTIDADE DO ATENDIMENTO]
Nome da atendente virtual: Nina
Nome do estabelecimento: Menino Jesus
Tipo do estabelecimento: Policlínica
[/IDENTIDADE DO ATENDIMENTO]
```

Depois da implementação inicial, trocar esses dados exige apenas editar e publicar
na Arquitetura — sem código, deploy ou configuração em outros módulos.

## Regras

- Campos visuais de edição são bem-vindos, desde que editem esse mesmo conteúdo.
  Proibido criar cadastro independente/concorrente para a identidade.
- Escopo: identidade de APRESENTAÇÃO ao paciente. Preservar identificadores
  técnicos, vínculos, permissões, consentimento e validações operacionais.
- Não renomear tabelas, arquivos ou funções só porque se chamam "Nina".
- O nome de apresentação não altera cadastro administrativo, documentos, agenda,
  endereço nem dados reais do estabelecimento.
- O prompt `whatsapp` é GLOBAL (`clinica_id IS NULL`): preservar esse escopo e
  deixar claro na tela que a publicação afeta todas as clínicas. Nunca apresentar
  configuração global como exclusiva da clínica selecionada.
- Dados fictícios só em testes isolados; nunca publicar identidade de teste na
  configuração global em operação.

## Execução

Cinco fases enviadas separadamente. Executar somente a fase recebida, reutilizando
o já concluído. Critérios que dependem de fases posteriores ficam registrados como
pendentes de integração, sem antecipar implementação nem declarar aprovação.
Validação completa na Fase 5.
