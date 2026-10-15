# Ferramenta "Importar Clínica Total" (SFP) — plano para aprovação

Área crítica (cadastro de clientes, prontuário, histórico). Nada é importado agora: só a ferramenta + testes com dados fictícios.

## O que já existe
- A importação da MJ (junho) **não tem tela**: foi feita por funções no banco (`_do_import_pacientes_mj`, `_mj_apply_batch` etc.), específicas para a MJ. Vou reaproveitar a lógica (casamento, normalização), não as funções em si.
- `prontuarios` não tem coluna para o número antigo → precisa de coluna nova.
- `pacientes` tem gatilhos que afetam a importação: telefone obrigatório, gera `codigo_prontuario` novo e avança a sequência, auditoria por linha, alerta crítico, MAIÚSCULAS, valida nome, sincroniza nome na agenda.

## Banco (uma migração, só aditiva)
1. `prontuarios.legado_origem text` + `legado_id text`, índice único parcial `(clinica_id, legado_origem, legado_id)`.
2. Tabela nova `paciente_observacoes_legado` (clinica_id, paciente_id, legado_id único por clínica, tipo, texto, situacao, usuario_legado, data, data_observacao, data_ate) — RLS por `is_member`, escrita só pela função.
3. Tabela `importacao_legado_execucoes` (clinica, arquivo/tipo, nome+tamanho do arquivo, última linha confirmada, contadores, status, quem) para retomar.
4. Tabela `importacao_legado_erros` (execução, linha, motivo — sem copiar a linha inteira do paciente).
5. Tabela `importacao_legado_profissionais` (codigo_pessoa → nome, cpf, medico_id escolhido ou nulo).
6. Funções SECURITY DEFINER (`SET search_path = public`), uma por tipo, recebendo um lote JSON: checam admin/gestor ativo da clínica, fazem upsert idempotente e devolvem contadores + erros + lista de órfãos. Ao final, uma função de "responsáveis" e uma de "resumo".

## Regras de mapeamento (como pedido)
- Pessoa → paciente por `clinica_id + codigo_prontuario_anterior = codigo_pessoa`; se não houver, tenta CPF (11 dígitos, resultado único) ou nome + nascimento (único) — só completa vazios, nunca sobrescreve.
- `nome_mae`, `nome_pai`, `observacao`, `observacao_clinica`, `cartao_numero`: vão para `paciente_observacoes_legado` com tipo próprio (não perde nada, não mexe em campos clínicos existentes).
- Prontuário: `queixa_principal` = descrição original; `observacoes` = "[Importado do sistema antigo SFP - prontuario #N]" + procedimento (+ nome do profissional quando sem médico); data em America/Sao_Paulo; órfão é contado e listado.
- Observações vinculadas pelo `codigo_pessoa`; idempotente por `codigo_observacao`.

## Tela
`/app/configuracoes/importar-clinica-total`, só admin/gestor, unidade padrão SFP, 4 passos em ordem obrigatória, leitura do arquivo em pedaços (sem carregar tudo), lotes de 500, barra de progresso, contadores, pausar/retomar, retomar após fechar a aba (mesmo arquivo = mesmo nome e tamanho), log de erros baixável (CSV), associação manual dos profissionais não casados, resumo final.

## Testes
- Testes do leitor de linhas (quebras de linha dentro do texto, acentos, aspas, linha cortada entre pedaços) e do mapeamento (sexo, datas, telefone, CPF).
- Teste das funções no banco com uma clínica de teste fictícia, revertido ao final (sem tocar SFP/MJ).

## Decisões que preciso de você antes de começar
1. **Número de prontuário novo:** o gatilho atual dá um `codigo_prontuario` novo para cada cliente importado (488 mil números, avançando a sequência da SFP). Usar o `codigo_pessoa` antigo como `codigo_prontuario` também, ou deixar o sistema numerar?
2. **Telefone obrigatório:** muitos cadastros antigos não têm telefone. Liberar só durante a importação (como já é feito no cadastro de funcionário)?
3. **Auditoria / MAIÚSCULAS / alerta crítico:** manter os gatilhos rodando (488 mil linhas de auditoria, nomes em maiúsculas, mais lento) ou desligá-los só dentro da função de importação? Proposta: manter MAIÚSCULAS e validação de nome; pular auditoria por linha e registrar uma linha de auditoria por lote.
4. **Gestor:** o pedido diz "admin/gestor". Confirmar que gestor também pode rodar uma importação desse tamanho.
5. **`ativo = 'N'`:** importar como cliente inativo (proposta) ou não importar?

## Fora do escopo
Fotos e anexos (2ª etapa), qualquer importação real, publicação, agenda, financeiro, médicos (só leitura para casar).
