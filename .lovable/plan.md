Adicionar item **Auditoria** no menu de ações de cada agendamento. Ao clicar, abre um **pop-up (Dialog)** mostrando todas as alterações daquele horário.

## Mudanças

**`src/routes/_authenticated/app.agenda.tsx`**

1. Importar `ShieldCheck` do `lucide-react`.
2. Adicionar estados: `auditAg`, `auditRows`, `auditLoading`.
3. Adicionar função `abrirAuditoria(a)` que consulta `audit_log` com `record_id = a.id`, ordena por `created_at desc` (limite 200).
4. No `DropdownMenu` da linha (após "Copiar link do paciente"), adicionar:
   ```
   <DropdownMenuItem onClick={() => abrirAuditoria(a)}>
     <ShieldCheck className="h-4 w-4 mr-2" /> Auditoria
   </DropdownMenuItem>
   ```
5. Adicionar um `<Dialog>` no final do JSX que renderiza:
   - Título: "Histórico de alterações — {paciente_nome} ({data/hora})"
   - Lista cronológica com: data/hora, usuário, ação (Criou/Alterou/Excluiu), tabela, e diff resumido entre `dados_antes` × `dados_depois` (campos alterados).
   - Estado vazio: "Nenhuma alteração registrada para este agendamento."
   - Botão "Fechar".

Os triggers de auditoria já registram alterações em `agendamentos`, `fin_lancamentos` e `gr_impressoes` — todas serão visíveis quando ligadas ao mesmo `record_id` (id do agendamento).
