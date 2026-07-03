## 25 simulações — aba Cartão Benefícios → Convênios

### Objetivo
Rodar 25 criações reais de convênios via UI em `/app/cartao-beneficios/convenios`, exercitando todos os campos do formulário e todas as abas (Dados, Faixas, Benefícios, Regras, Modelos), e entregar um relatório de bugs + melhorias.

### Como

1. **Setup Playwright headless** contra `http://localhost:8080`, restaurando sessão Supabase (LOVABLE_BROWSER_*). Navegar para a página de convênios e clicar "+ Novo".

2. **25 cenários variados** cobrindo:
   - Dados básicos: nome curto/longo/com acentos/com HTML (`<script>`), descrição vazia/longa, ativo on/off.
   - Financeiro: taxa de adesão 0 / negativa / muito alta, num_parcelas 1/12/24, fidelidade e vigência 0/6/12/60 meses.
   - Faixas de preço: 1 faixa aberta (1+), múltiplas faixas contíguas, faixas com sobreposição, faixa com `até < de` (deve rejeitar), valor 0 e valor R$ 9999.
   - Dependentes: `max_dependentes` 0, 3, 10.
   - Benefícios: pelo menos 1 caso por escopo (serviço único, especialidade, consultas), tipo_desconto percentual/valor/gratuidade, valor 0 / >100% / negativo, campos obrigatórios em branco, seleção de múltiplos procedimentos no escopo "consulta".
   - Modelos: modelo_contrato vazio / com tokens válidos / com token inválido, informativo_html com tags perigosas, termo_inclusao_html vazio.
   - Regras (aba Regras, se existir): cadastrar 1-2 regras por convênio quando cabível.
   - Salvar → reeditar → alterar 1 campo → salvar de novo (persistência), depois excluir alguns para testar delete.

3. **Sinais coletados por caso**
   - Toast (sucesso/erro/mensagem exata), tempo submit→toast, erros de console, respostas HTTP com status ≥400, screenshot antes/depois.
   - Após salvar: SELECT em `cb_convenios`, `cb_convenio_faixas`, `cb_beneficios` (e `cb_convenio_regras` se usadas) confirmando persistência do que foi digitado.
   - Tag: adicionar sufixo `SIM-CV-<ts>` no nome do convênio criado para localizar/limpar depois. Sem cleanup automático (mesma regra do teste anterior: "deixar no banco").

4. **Relatório em `/mnt/documents/relatorio-cb-convenios-25sim.md`** com:
   - Resumo executivo (OK/FAIL/EXCEPTION, tempos médios).
   - Tabela caso-a-caso (id, entrada, resultado, tempo, evidências).
   - Bugs classificados 🔴/🟠/🟡 com trecho de código/arquivo suspeito.
   - Sugestões de UX/validação (Zod, contadores, sanitização, mensagens).
   - Screenshots em `/mnt/documents/cb-cv-sim/`.

### Fora de escopo
- Sem correções nesta rodada: só teste + relatório. Após aprovado, discutimos correções em plano separado (igual ao ciclo anterior).
- Sem editar `cb_beneficios`/`cb_convenio_regras` de convênios pré-existentes; só nos criados.

Se aprovado, executo direto e volto com o relatório.