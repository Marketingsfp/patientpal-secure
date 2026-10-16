# Área do Paciente — Consulta Hoje (plano, nada implementado)

## O que já existe (conferido)
- Já há telas `/paciente`, `/paciente/consultas`, `/paciente/cartoes`, `/paciente/financeiro`, `/paciente/perfil`. Elas usam o **mesmo login da equipe** (e-mail/senha) e funções como `minhas_consultas`, `meus_cartoes`, `pendencias_paciente`; o perfil lê/grava `pacientes` direto pelo navegador.
- **Não existe** envio de e-mail transacional nem SMS no projeto (sem provedor configurado). Só há envio de WhatsApp.
- Marca por domínio (`clinica_dominios`, `clinica_por_dominio`) já existe e será reaproveitada.

Proposta: **não reaproveitar** esse portal antigo (mistura identidade com a equipe). Construir um novo, separado; o antigo fica intocado até decisão de desligar.

## 1. Identidade do paciente (separada da equipe)
- Paciente **não** vira usuário do login da equipe, **não** entra em `clinica_memberships`, não recebe nenhum papel. Nenhuma tela `/app/*` abre para ele.
- Sessão própria: após OTP válido, o servidor cria um registro em `portal_sessoes` (token aleatório guardado só como hash, `paciente_id`, `clinica_id`, expira em 30 min de inatividade / 8 h no máximo). Vai para o navegador em cookie `HttpOnly`, `Secure`, `SameSite=Strict`, escopo `/paciente`.
- Logout apaga a sessão no banco. Trocar de domínio/clínica invalida.
- Todo dado é lido por **funções no servidor** que recebem o cookie, validam a sessão e usam o `paciente_id` da sessão — o navegador nunca escolhe qual paciente ver. As tabelas novas do portal ficam sem acesso nenhum para `anon`/`authenticated`; só o servidor.

## 2. Login: CPF + código de uso único
Fluxo:
1. Paciente digita CPF (validado pelo algoritmo já existente).
2. Servidor procura na clínica do domínio. Resposta é **sempre a mesma**: "Se houver cadastro, enviamos um código para os contatos registrados", com destino mascarado só quando existe (ex.: `jo***@gm***.com`, `(**) *****-12`). Para não revelar existência, quando não há cadastro mostra mensagem genérica idêntica, mesmo tempo de resposta.
3. Código de 6 dígitos, guardado só como hash, vale 10 min, uso único, máx. 5 tentativas.
4. Acertou → aceita termo (1º acesso) → entra.

CPF duplicado (há ~1.259 na SFP; regra para a Consulta Hoje igual):
- Se o CPF tem mais de um cadastro na clínica, o código vai para os contatos de todos; depois do código, o paciente **escolhe** entre os cadastros encontrados (só nome + data de nascimento mascarada). Alternativa mais restrita: bloquear e pedir que procure a recepção. **Decidir.**
- Cadastro sem e-mail nem celular → mensagem genérica; não envia nada.

Menores / dependentes:
- MVP: menor não entra sozinho. O responsável entra com o **próprio CPF** e vê os dependentes ligados a ele pelo vínculo de responsável já existente no cadastro. Precisa confirmar qual campo/tabela é o vínculo oficial — **Possível regra de negócio — validar com a equipe da clínica** (idade de corte, maiores de 16/18 anos).

## 3. Proteção contra força bruta
- Por CPF: 3 pedidos de código/15 min, 10/dia; 5 erros → bloqueio de 30 min.
- Por IP e por clínica: limite de pedidos de código por minuto/hora (reusa o padrão de `intake_rate_limit`/`integracao_rate_limit`).
- Captcha (Cloudflare Turnstile) depois de 2 tentativas do mesmo IP.
- Comparação do código em tempo constante; códigos antigos invalidados ao gerar novo.

## 4. Conteúdo (só da clínica do domínio, só do próprio paciente)
1. **Agendamentos:** próximos e histórico (médico, especialidade, data, status). Confirmar/cancelar chamando as **mesmas regras atuais** (ordem de chegada, prazo de cancelamento, sem mexer em ficha). Remarcar fica para depois.
2. **Resultados e documentos:** novo campo "liberado ao paciente" (data + quem liberou) em `exame_resultados` e `documentos_emitidos`, padrão **desligado**. Botão "Liberar ao paciente" para a equipe, com auditoria. Só itens liberados aparecem; download por link temporário (5 min). Prontuário/evolução **nunca**.
3. **Financeiro:** pagamentos e recibos do paciente e NFS-e já emitidas (PDF/XML por link temporário). Só leitura; não toca nas notas presas.
4. **Cadastro:** ver dados; alterar telefone, e-mail, endereço vira **solicitação** para a recepção aprovar (recomendado: contato é o destino do código; trocar direto permitiria sequestro da conta). Nome, CPF e data de nascimento não são editáveis.

## 5. Auditoria
Tabela `portal_acessos` (somente inserção): paciente, clínica, ação (login, falha, viu agendamentos, baixou documento X, cancelou Y, pediu alteração), data/hora, IP, navegador. Sem conteúdo clínico no registro. Tela de consulta só para admin/gestor. Retenção a definir (sugestão: 5 anos).

## 6. Termo LGPD
Texto do termo versionado por clínica; no 1º acesso (e quando a versão mudar) o paciente aceita; grava versão, data, IP. Sem aceite, não entra. **Texto do termo precisa vir da clínica/jurídico.**

## 7. Interruptor por clínica
Config `portal_paciente_ativo` por `clinica_id` (padrão desligado), ligado só na Consulta Hoje. Desligado: `/paciente` mostra "indisponível". Também só funciona em domínio cadastrado da clínica (`?clinica=` só na prévia para teste).

Observação: a regra do projeto diz que mudanças valem para todas as clínicas; aqui o interruptor é pedido explícito do dono para uma área nova sensível.

## 8. Envio do código (provedor)
- **E-mail:** e-mails do próprio Lovable Cloud com domínio da clínica (ex.: `nao-responda@clinicaconsultahoje.com.br`), exige configurar DNS do domínio. Sem custo de chave externa.
- **SMS:** não há nada; proposta: Zenvia ou Twilio (chave em Secrets). Custo por mensagem. Sugestão: **MVP só e-mail**, SMS na fase 2.

## 9. Site institucional (projeto 0f55db99…)
Só um botão "Área do Paciente" no topo/rodapé apontando para `https://sistema.clinicaconsultahoje.com.br/paciente`. Feito no outro projeto (este não altera aquele).

## 10. Fases
1. **MVP:** interruptor, sessão própria, login CPF + código por e-mail, termo, auditoria, rate limit, agendamentos (ver + confirmar/cancelar), cadastro (ver + solicitar). Botão no site.
2. Documentos liberados (campo + botão da equipe) e financeiro/NFS-e.
3. SMS, dependentes/responsável, fila de aprovação de cadastro com notificação.
4. WhatsApp, remarcação, outras clínicas.

## 11. Riscos
- Contato desatualizado no cadastro → paciente não recebe código (precisa ir à recepção).
- CPF duplicado pode mostrar outro cadastro ao escolher — por isso o código vai só aos contatos cadastrados e a escolha mostra o mínimo.
- E-mail compartilhado na família: quem lê o e-mail entra. Aceitável com termo; SMS reduz.
- Documento liberado por engano → auditoria + botão "retirar liberação".
- Domínio/IP são controláveis pelo cliente: a segurança real é a sessão + filtro por `paciente_id` no servidor.
- Portal antigo segue com acesso pelo login da equipe; decidir quando desligar.

## Pontos para decidir
1. CPF duplicado: escolher cadastro ou bloquear?
2. Vínculo oficial de responsável e idade de corte.
3. MVP só e-mail? Provedor de SMS para fase 2.
4. Texto do termo LGPD e prazo de retenção da auditoria.
5. Prazo mínimo para cancelar pelo portal.
6. Desligar o portal antigo?

## Técnico
- Tabelas novas: `portal_config`, `portal_otps`, `portal_sessoes`, `portal_acessos`, `portal_consentimentos`, `portal_solicitacoes_cadastro`; colunas aditivas `liberado_paciente_em/por`. Todas com `clinica_id`, RLS ligado, sem grants para anon/authenticated nas tabelas de sessão/OTP; servidor usa acesso privilegiado só depois de validar a sessão.
- Server functions `portal.functions.ts` (pedir código, validar, sair, listar…), cada uma valida o cookie e deriva `paciente_id`; rotas novas em `/paciente/*` substituindo o uso do login da equipe ali (antigo preservado em outro caminho se decidirem manter).
- Testes: decisão de sessão, rate limit, mascaramento, isolamento (paciente A não vê B, inclusive com CPF repetido).
