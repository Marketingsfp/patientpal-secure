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
- Decisões confirmadas em 17/10/2026: admin, gestão, médico, enfermagem, recepção e supervisão podem liberar e retirar documentos do paciente.
- Anexos clínicos da ficha também podem ser liberados; anexos internos, administrativos e contratos nunca são liberáveis. Liberação começa desligada, inclusive automática por tipo e por clínica; download dura 5 minutos e fica preso à sessão, com auditoria.
- Pedido de exame tem registro próprio, exames do catálogo quando houver e texto livre, indicação/observação, emissão em PDF e cancelamento; aparece como Pedido de exame no portal somente quando liberado.
- Não publicar estas mudanças sem autorização.
- Uploads existentes não podem ser bloqueados pelo formato do caminho: validar `{clinica_id}/{paciente_id}/{tipo}/...` somente ao classificar como clínico ou liberar; uploads internos por service_role sem auth.uid() devem continuar funcionando.
