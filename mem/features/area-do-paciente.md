---
name: Área do Paciente — decisões do dono
description: Decisões aprovadas em 16/10/2026 para o portal do paciente (fase 1 MVP)
type: feature
---
- Começa só na CLINICA CONSULTA HOJE (interruptor por clínica); acesso por sistema.clinicaconsultahoje.com.br/paciente com a marca da clínica.
- Login: CPF + código de uso único SÓ por e-mail no MVP; SMS/WhatsApp depois.
- CPF com mais de um cadastro: não entra; mensagem "Encontramos uma pendência no seu cadastro. Procure a recepção da clínica para liberar seu acesso." e registra para a recepção unificar.
- Menor de 18: mesma mensagem (dependentes/responsável = fase 3).
- Alteração de telefone/e-mail/endereço vira solicitação para a recepção aprovar.
- Portal antigo /paciente (login da equipe) substituído.
- Termo LGPD: rascunho para revisão jurídica, versionado, editável por admin; aceite obrigatório.
- Cancelamento pelo portal: padrão 2 h antes, configurável por clínica; consulta paga ou de pacote só pela recepção.
- Fase 2 (documentos liberados + financeiro/NFS-e) só depois de o dono validar a fase 1.
