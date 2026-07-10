## Objetivo
Permitir que o perfil **ADM** (role `admin` da clínica) edite todos os campos do contrato de Cartão Convênio já existente — hoje só valor mensal, dia de vencimento e ações de dependentes/parcelas estão liberados; os demais campos são somente-leitura.

## Onde
`src/components/pages/contratos-page.tsx` — bloco do detalhe do contrato (`TabsContent value="dados"` linhas ~1985‑2098) e tabela de Mensalidades (linhas ~1921‑1983).

## Detecção do perfil
Usar o hook já existente:
```ts
import { useClinica } from "@/hooks/use-clinica";
const { clinicaAtual } = useClinica();
const isAdmin = clinicaAtual?.role === "admin";
```
Todos os campos novos ficam por trás de `isAdmin`. Perfis não-admin continuam vendo exatamente a tela atual (nada muda para eles).

## Campos que passam a ser editáveis (apenas ADM)

Aba **Dados** — trocar cada `DadosField` correspondente por um controle editável:

| Campo | Controle | Coluna em `contratos_assinatura` |
|---|---|---|
| Convênio | `<select>` populado por `cb_convenios` da clínica (ativos) | `convenio_id` |
| Nº de pessoas no contrato | `<select>` das faixas do convênio escolhido (recarrega `cb_convenio_faixas` ao trocar) | `faixa_id`, `total_vidas`, `valor_mensal` (sincroniza com a faixa) |
| Paciente titular | Combobox de pacientes da clínica (mesmo padrão do modal "Incluir dependente") | `paciente_id`, `paciente_nome` |
| Data início | `<input type="date">` | `data_inicio` |
| Dia de vencimento | (já existe) | `dia_vencimento` |
| Valor mensal | (já existe) | `valor_mensal` |
| Taxa de adesão | `<input type="number">` | `taxa_adesao` |
| Forma de pagamento | `<select>` (Dinheiro/Pix/Débito/Crédito/Boleto — mesma lista `formasPag` já usada) | `forma_pagamento` |
| Observações | `<textarea>` | `observacoes` |

Ação: um único botão **"Salvar alterações do contrato"** (visível só para admin) que faz `update contratos_assinatura` com os campos alterados. Botão atual "Salvar valor e vencimento" + checkbox "Regerar 12 parcelas futuras" permanece.

Trocar convênio/faixa não regenera parcelas automaticamente — para evitar sobrescrever histórico. Se o admin quiser propagar o novo valor, usa o checkbox "Regerar 12 parcelas futuras" que já existe. Isso vai no texto de ajuda ao lado do salvar.

## Aba Mensalidades — edição por parcela (apenas ADM)

Na tabela de Mensalidades, para admin:
- **Vencimento** e **Valor** de cada linha viram inputs editáveis (`date` e `number`) com auto-save on blur (`update contrato_mensalidades set vencimento/valor where id`).
- Botão **Reverter** (marcar como pendente) e **Pagar** ficam habilitados mesmo quando o contrato está `cancelado` (hoje `disabled={cancelado}` bloqueia). Assim o ADM ajusta "número de mensalidades pagas" livremente.
- Novo botão **"+ Adicionar parcela"** (rodapé da tabela) que insere uma nova linha em `contrato_mensalidades` com número sequencial, vencimento default = hoje, valor = valor mensal atual, status = pendente.
- Ícone lixeira por linha para **excluir parcela** (com confirm), removendo a linha de `contrato_mensalidades`.

## Considerações
- Nenhuma mudança de schema, RLS ou migration — as políticas atuais de `contratos_assinatura` e `contrato_mensalidades` já permitem update/insert/delete pelo admin da clínica.
- Nenhuma alteração para perfis que não são admin — a UI original permanece intocada por trás do `isAdmin ? <editor/> : <DadosField/>`.
- Sem cascatas silenciosas: mudar convênio/faixa/paciente NÃO reescreve parcelas nem dependentes; a regeração continua sendo opt‑in via checkbox existente.
- Reaproveitar utilitário `mostrarErro` e padrão `toast.success` já usados no arquivo.