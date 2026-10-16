# Área do Paciente — decisões técnicas

- Paciente não é usuário do Auth nem membro de clínica: sessão própria em `portal_sessoes` (cookie HttpOnly `portal_sessao`, 30 min sem uso / 8 h máx.) — por quê: não pode alcançar o app da equipe.
- Todo acesso do paciente passa por `portal.functions.ts` com service_role, sempre filtrando `clinica_id` + `paciente_id` da sessão; nunca aceitar paciente_id do navegador — por quê: RLS não protege esse caminho.
- CPF, código, IP e token só em HMAC com `PORTAL_PACIENTE_PEPPER`; pedido de código responde igual exista ou não o CPF (máscara falsa estável) — por quê: não revelar cadastro.
- CPF repetido e menor de idade só são barrados depois do código certo — por quê: o 1º passo não pode revelar nada.
- Cancelar usa `atualizarStatusAgendamentoCore` com ator integração `area_do_paciente` — por quê: mesmas regras e limpeza da agenda.
- Regras puras e limites em `regras.ts` (testadas em `regras.test.ts`).
- Fase 2: download só por `portal_links` (hash, 5 min) em `/api/public/portal-arquivo`, que exige o cookie da MESMA sessão e reconfere dono + liberação na hora (`arquivos.server.ts`) — por quê: retirar a liberação precisa esconder na hora. Conteúdo da equipe vira texto escapado; NFS-e só de hosts do emissor e status emitida.
