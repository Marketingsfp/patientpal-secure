# Revisão de segurança completa — 16/10/2026 (somente leitura, nada alterado)

Fontes: varredura automática do banco, varredura de dependências, leitura do código das últimas ~30h e consultas de leitura às policies e funções. Nenhum arquivo, dado ou configuração foi alterado. Cada correção abaixo depende de pedido específico.

## Achados

| # | Sev. | Onde | Achado | Correção sugerida |
|---|---|---|---|---|
| 1 | Alta | `src/lib/nina/ligacao/sessao-live.server.ts` | A ligação por voz da Nina não tem duração máxima nem limite de uso. Os prazos existentes valem só para conectar (15s e 40s). Depois de conectada, a chamada pode seguir sem fim enquanto o navegador mantiver a conexão, usando modelos pagos. Não há limite por usuário ou por clínica, nem de ligações simultâneas. A permissão em si está correta: o token é verificado, o módulo `nina-ligacao` exige escrita e o interruptor da clínica é checado. | Encerrar a chamada no servidor após um tempo máximo (ex.: 10–15 min), limitar ligações simultâneas por usuário e definir uma cota diária por clínica. |
| 2 | Alta | Dependências (`bun.lock`) | 1 item crítico (`proxy-addr`, via `@lovable.dev/mcp-js`) e vários itens altos herdados: `undici`, `sharp`, `ws`, `fast-uri`, `@modelcontextprotocol/sdk`, `seroval`, `browserslist`. A maioria afeta o servidor de desenvolvimento ou o build. Os que podem afetar o servidor publicado são `seroval` (estouro de memória ao ler dados enviados) e `undici`. | Atualizar `@tanstack/react-start`/`react-router`, `@ai-sdk/openai` e `@lovable.dev/mcp-js` para versões que já trazem as correções, e testar em seguida. |
| 3 | Média | Tabelas `especialidade_unidade` e `tipo_servico_unidade` | A policy de leitura é `true` para visitantes e usuários logados, então qualquer pessoa vê todas as linhas de todas as clínicas. São dados de catálogo, sem pacientes, e a vitrine pública usa esses dados. Mas a tabela também guarda a marcação "removida", então o catálogo interno de todas as clínicas fica exposto. | Restringir a leitura de visitantes às linhas ativas e públicas (ou servir por uma função pública só com os campos necessários). Para usuários logados, usar `is_member`. |
| 4 | Média | `src/components/financeiro/comprovantes-tab.tsx:744` | O comprovante é exibido como HTML sem passar por `sanitizarHtmlRico`, ao contrário das outras telas. Nome da clínica, observações ou nome do paciente com HTML embutido podem executar código. | Envolver a chamada com `sanitizarHtmlRico(...)`, ou escapar os campos dentro de `renderComprovanteHtml`. |
| 5 | Média | `src/lib/face-recognition.ts:5` | Os modelos de biometria facial vêm de um endereço público ligado à versão `@master` do repositório. Se esse repositório for comprometido, outro conteúdo chega a todas as estações. As policies de `medico_biometria` estão corretas: só a gestão da clínica ou o próprio médico têm acesso. | Fixar uma versão específica, ou guardar os arquivos do modelo dentro do próprio projeto. |
| 6 | Baixa | `src/lib/orcamentos/ler-pedido-medico.functions.ts` | A leitura do pedido por foto exige login, mas não confere se a pessoa pertence à clínica nem se tem o módulo de orçamentos, e não tem limite de uso. Nenhum dado de outra clínica é lido ou gravado, e a imagem é descartada depois da leitura. O risco é de custo. | Receber `clinicaId`, chamar `assertAcessoModulo(..., "orcamentos")` e aplicar um limite simples por usuário. |
| 7 | Baixa | `renovar_contrato_extensao` / `renovar_contrato_troca_plano` (migration 20261015120000) | As duas funções estão bem configuradas (rodam com permissão própria, com caminho de busca fixo, e nada foi liberado para visitante). Porém só conferem `is_member`: qualquer membro da clínica pode renovar ou trocar de plano e afetar a carência, sem checagem de módulo. As policies das tabelas de contrato exigem escrita no módulo `contratos`/`cartao-beneficios`, e as funções contornam essa exigência. | Trocar por `pode_escrever_modulo(auth.uid(), clinica_id, ARRAY['cartao-beneficios','cartao-terapeutico','contratos'])`. Possível regra de negócio — validar com a equipe da clínica. |
| 8 | Baixa | "Preencher com IA" (`catalogo.functions.ts`, `catalogo-ia.server.ts`) | O acesso está correto: exige login e `exigirAdmin` na clínica, e a chave de IA fica só no servidor. Não há cota de uso por clínica. O texto enviado à IA é o do catálogo, sem dados de pacientes. | Opcional: cota diária por clínica. |
| 9 | Info | Importação Clínica Total (`importacao_legado_*`) | O acesso está correto: as funções do banco conferem admin usando a clínica da própria execução, sem liberação para visitante. A trava "só admin" na tela é apenas visual, e a proteção real fica no banco. As chaves que dispensam telefone e auditoria só são ligadas dentro dessas funções, e o efeito vale só até o fim de cada envio. | Nenhuma. |

## Pontos conferidos sem problema

- **Cartão Benefícios, regras E/OU (`cb_convenio_regras`):** ler exige ser da clínica. Gravar exige ser da gestão ou ter escrita no módulo `cartao-beneficios-precos`.
- **Contratos, 2ª via e mensalidades:** as policies conferem a clínica no banco (`clinicas_do_usuario`/`is_member` para ler, `pode_escrever_modulo` para gravar). Não dependem do filtro da tela.
- **Busca por nome parecido (`buscar_pacientes_global`):** filtra no banco pelas clínicas em que o usuário tem vínculo ativo, e ignora clínicas enviadas pela tela que não sejam dele.
- **Ligação da Nina:** as ferramentas usam a clínica já validada no servidor e uma lista fechada de nomes, e a chave de IA nunca vai ao navegador.
- **Segredos:** nenhuma chave real encontrada no código.

## Achados anteriores ainda abertos (sem mudança)

- Correção da voz Nina ainda aguardando publicação.
- Gestores ainda podem editar permissões de módulos em perfis customizados.
- Transcrições de chamadas do Coach sem prazo de guarda definido.
- Endereços públicos de `src/routes/api/public/*` não mudaram nesta janela, por isso não foram revistos de novo.

## Pendências

- Não testei os achados explorando-os de verdade, para não mexer em produção.
- A ordem sugerida para corrigir, se você pedir: 1 → 4 → 3 → 6 → 7 → 5 → 2.
