# Plano de segurança — Health Hub Pro (patientpal-secure)

Atualizado em 15/08/2026. Esta é a lista completa e priorizada. Cada item tem o que é, por que importa e como executar. Nada aqui exige que você entenda o código: os textos em bloco são para colar no Claude Code ou no SQL editor do Lovable.

---

## Já resolvido ✓

| Item | Como foi verificado |
|---|---|
| Anexos do chat acessíveis a qualquer conta | Policy corrigida no banco, conferida com `pg_policies` |
| View expondo CPF de todas as clínicas | Já estava com `security_invoker=on` — falso alarme meu |
| Endpoint do QZ Tray assinando sem autenticação | Middleware adicionado, build e testes passaram |
| Logout deixando dados do usuário anterior em cache | Corrigido no código |
| Erro de fuso: não dava para marcar "Realizado" após as 21h | Corrigido nos 6 pontos do servidor |
| Bypass de menu por e-mail fixo | Removido (o Rodrigo é admin, não muda nada para ele) |
| Segredos de servidor no Lovable | Os que importam já estavam configurados |
| Projeto Lovable exposto publicamente | Verificado: está privado |

---

## FASE 1 — Antes de publicar (terça)

**1.1 Reverter a alteração do `env.ts`**

Aquela mudança servia para deploy no Cloudflare, não para o Lovable. Se ficar, o app pode não carregar.

```
Rode: git checkout -- src/integrations/supabase/env.ts
Depois: bun run typecheck && bun run build
```

**1.2 Publicar e testar quatro coisas no ar**

1. Entrar no sistema (login funciona = variáveis do Supabase ok)
2. Marcar um atendimento como "Realizado" na agenda
3. Enviar e abrir um anexo no chat
4. Sair e entrar com outro usuário — nenhum dado do anterior deve aparecer

---

## FASE 2 — Primeira semana (o que mais aumenta a segurança)

Todos os itens abaixo são da mesma família: **o banco verifica se a pessoa é da clínica, mas não verifica se ela tem permissão para aquele módulo.** O bloqueio existe só no menu.

**2.1 Permissões por módulo no banco** — inclui os itens que o scanner do Lovable marcou

Cole no Claude Code:

```
Preciso melhorar a segurança do banco de dados.

Situação: algumas tabelas com dado sensível têm policy de RLS usando apenas
is_member(auth.uid(), clinica_id), ou seja, só verificam se a pessoa pertence
à clínica. Outras já usam has_module_access(clinica_id, '<modulo>',
'read'|'write'), que também verifica a permissão do módulo. Quero as duas
verificações em todas as tabelas com dado sensível.

Faça nesta ordem, parando para eu confirmar entre as etapas:

1. Liste as tabelas que hoje usam só is_member e contêm dado de paciente,
   financeiro ou de RH. Para cada uma, diga qual chave de módulo usaria
   (siga o padrão do bloco do $policy$ que já migrou agendamentos, pacientes,
   prontuarios e fin_*). Não escreva SQL ainda.

   Inclua obrigatoriamente na análise:
   - paciente_biometria (o scanner marcou como CRÍTICO: descritores faciais
     legíveis por qualquer membro da clínica)
   - as tabelas de RH com contratos (CPF e salário hoje legíveis por qualquer
     membro — devem ficar restritos a gestão de pessoas)
   - odonto_prontuarios, anamnese_respostas, exame_resultados,
     triagens_enfermagem, documentos_emitidos, atend_conversas

2. Depois que eu aprovar a lista, escreva a migration. Ela deve ser
   reversível: inclua no mesmo arquivo, comentado, o SQL para voltar atrás.

3. Me diga exatamente como testar: qual usuário usar, o que ele deve
   conseguir ver e o que não deve.

O banco fica no Lovable Cloud — me entregue o SQL pronto para colar no
SQL editor de lá.
```

**2.2 Segredos guardados em texto puro**

Chaves de integração, credenciais do WhatsApp e o certificado digital A1 (com senha) são legíveis por administradores da clínica via acesso direto à tabela.

```
Verifique se as colunas com chave, token, senha ou certificado destas tabelas
têm REVOKE SELECT por coluna para authenticated e anon: integration_secrets,
whatsapp_configs, nfse_emitentes (colunas certificado_pfx_base64,
certificado_senha, focus_token_producao, focus_token_homologacao).
O projeto já usa esse padrão em algumas tabelas — replique nas que faltam.
Me entregue o SQL pronto para colar no SQL editor do Lovable.
```

**2.3 Bucket `cb-informativos` público**

Arquivos acessíveis por URL direta, sem login. Peça ao Claude Code para fechar o bucket e trocar `getPublicUrl()` por URL assinada em `rich-editor.tsx` — o projeto já faz isso corretamente nas imagens de odontologia.

**2.4 Funções abertas para visitante não logado (totem)**

`totem_match_biometria` aceita um parâmetro do chamador que permite enumerar pacientes; `totem_checkin_cpf` confirma se um CPF é paciente da clínica. Correção mínima: fixar o limiar no servidor e revogar de `anon` a versão de 3 argumentos. Correção certa: mover o fluxo do totem para Edge Function.

**2.5 Migrations pendentes**

Confirme quais dos arquivos em `supabase/migrations/` ainda não foram aplicados no banco — em especial `20260813120000_remove_staging_importacao_mj.sql` (apaga tabelas com CPF de paciente) e `20260816090200_revoga_grants_anon_legado.sql` (que está na pasta e ainda não rodou).

**2.6 Fechar o cadastro público**

Hoje qualquer pessoa cria conta em `/signup`. Uma conta sem vínculo não vê dados, mas isso transforma qualquer falha futura em "exposta ao mundo". Se ninguém de fora precisa se cadastrar sozinho, peça: *"remova ou bloqueie a rota /signup para que só um gestor possa criar usuários"*.

---

## FASE 3 — Depois do go-live (código)

- **`autoatendimento.tsx`** baixa os descritores biométricos de todos os pacientes para o navegador. O totem já faz certo (`totem.tsx:472`) — é copiar.
- **`supervisor-auth-dialog.tsx`** troca a sessão do navegador inteiro para validar o supervisor. Precisa virar server function.
- **Rascunho de prontuário no `localStorage`** (SOAP, transcrição do áudio, prescrição) fica salvo sem prazo. Usar `sessionStorage` e limpar no logout.
- **`print-contrato.ts`**: o filtro de HTML só remove `<script>` que contenha `window.print(`. Passar o corpo por `sanitizarHtmlRico`, que já existe no projeto.
- **Uploads sem validação de tipo** no chat (só checa 10 MB).
- **`/api/public/tts`** sem autenticação, CORS `*` e sem limite de uso — risco de custo.
- **Webhook da Focus NFe** aceita o token pela URL; remover esse caminho.
- **Validação de entrada**: `criar.functions.ts` e `backups.functions.ts` têm validação só de fachada.
- **Botão de backup manual** quebrado (o Lovable não permite secret com prefixo `SUPABASE_`) — derivar o ID a partir de `SUPABASE_URL`.
- **CI**: adicionar `bun run build` ao `.github/workflows/ci.yml`.

---

## FASE 4 — Rotina (o que evita voltar à estaca zero)

- **Quem tem acesso:** revisar os 7 colaboradores externos do projeto e os dois "Remix of Health Hub Pro" criados em 25 e 28/07 por outros usuários. Cópias do código carregam a URL e a chave pública do seu banco de produção.
- **Quem ignorou os 28 avisos:** o painel mostra "No active issues" porque tudo foi marcado como ignorado. Reabrir os que importam.
- **Deep security scan** uma vez por mês e após mudanças grandes no banco.
- **Revisão de acessos** a cada três meses — usuários do sistema e colaboradores do projeto.
- **Testar restaurar um backup.** Backup só conta depois que você restaurou um e viu os dados voltarem.
- **Toda migration nova passa por revisão.** Duas falhas desta auditoria nasceram assim: uma policy sem filtro de clínica e um `CREATE OR REPLACE VIEW` que apagou uma proteção silenciosamente.
- **Contrato de tratamento de dados (DPA)** com a Lovable, já que são dados de saúde. Confirmar com o jurídico da clínica.

---

## Como ler esta lista

Nada nas fases 2, 3 e 4 impede o deploy de terça. A fase 1 impede.

Se você só puder fazer uma coisa na semana que vem, faça o **item 2.1** — ele resolve de uma vez o achado crítico da biometria, o CPF e salário do RH, e os prontuários odontológicos e resultados de exame.
