## O que muda

Diálogo **"Cancelar contrato"** (Cartão Benefícios → Vendas → contrato aberto) passa a exigir a escolha de um motivo em lista suspensa. Aplica-se às **3 clínicas** (é o mesmo código).

### Novas opções da lista (nessa ordem)
1. Troca de endereço
2. Fez plano de saúde
3. Falecimento
4. Sem condições financeiras
5. Não usa o convênio
6. Insatisfação com o convênio
7. Outros

### Campo "Observações"
- Aparece **somente** quando o motivo escolhido for **"Insatisfação com o convênio"** ou **"Outros"**.
- Preenchimento **opcional**.
- Para os demais 5 motivos o campo fica oculto.

### Regra de gravação
- Botão "Confirmar cancelamento" habilita assim que um motivo é escolhido (independe de observações).
- No banco, o campo `cancelamento_motivo` já existente em `contratos_assinatura` recebe:
  - Sem observação: `"<Motivo escolhido>"` (ex.: `"Falecimento"`).
  - Com observação: `"<Motivo escolhido> — <texto da observação>"`.
- Assim o motivo continua aparecendo no cabeçalho do contrato ("Motivo: …") e no **Histórico** (aba já existente, que lê a mesma coluna) sem precisar de migração.

### Compatibilidade retroativa
- Contratos já cancelados continuam mostrando o texto livre antigo no cabeçalho e na aba Histórico — nada é reescrito.

## Detalhes técnicos

Arquivo único: `src/components/pages/contratos-page.tsx`.

1. Substituir os states `cancelMotivo` (string livre) por dois: `cancelMotivoOpcao` (enum das 7 opções) e `cancelObs` (string). Resetar ambos ao fechar o diálogo.
2. Trocar o `<Textarea>` do diálogo (linhas ~5335-5345) por um `<Select>` (shadcn) com as 7 opções + `<Textarea>` "Observações (opcional)" renderizado condicionalmente quando a opção for `insatisfacao` ou `outros`.
3. Ajustar `confirmarCancelamento` (linhas 2693-2720):
   - Validar que `cancelMotivoOpcao` foi escolhido (`toast.error("Selecione o motivo do cancelamento")`).
   - Montar `motivo` = label da opção + (observação truncada/trim, se houver): `` `${label} — ${obs}` `` quando `obs.trim()` existir, caso contrário só `label`.
   - Enviar para `cancelamento_motivo` como já é feito hoje.
4. Ajustar o `disabled` do botão para `!cancelMotivoOpcao` (não depende mais do textarea).
5. Nenhuma alteração em RPC, RLS, migração ou em `contrato-historico-tab.tsx` — a aba Histórico já lê `cancelamento_motivo` e vai exibir a nova string formatada automaticamente.

## Fora do escopo
- Não altera fluxo de cancelamento automático (renovação/troca de convênio).
- Não cria nova coluna estruturada para "categoria de motivo" (mantém texto único conforme já usado hoje).
- Não muda permissões nem quem pode cancelar.