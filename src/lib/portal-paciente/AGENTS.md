# Área do Paciente — decisões técnicas

- Paciente não é usuário do Auth nem membro de clínica: sessão própria em `portal_sessoes` (cookie HttpOnly `portal_sessao`, 30 min sem uso / 8 h máx.) — por quê: não pode alcançar o app da equipe.
- Todo acesso do paciente passa por `portal.functions.ts` com service_role, sempre filtrando `clinica_id` + `paciente_id` da sessão; nunca aceitar paciente_id do navegador — por quê: RLS não protege esse caminho.
- CPF, código, IP e token só em HMAC com `PORTAL_PACIENTE_PEPPER`; pedido de código responde igual exista ou não o CPF (máscara falsa estável) — por quê: não revelar cadastro.
- CPF repetido e menor de idade só são barrados depois do código certo — por quê: o 1º passo não pode revelar nada.
- Cancelar usa `atualizarStatusAgendamentoCore` com ator integração `area_do_paciente` — por quê: mesmas regras e limpeza da agenda.
- Regras puras e limites em `regras.ts` (testadas em `regras.test.ts`).
- Downloads use hashed, session-bound `portal_links` through the guarded public file endpoint and recheck domain, consent, ownership and release on every opening — why: revocation must also invalidate old links.
- Clinical attachments retain their original upload type and use explicit portal classification; exam requests are immutable records with private server-generated PDFs — why: internal files and issued clinical history must not be inferred or overwritten.
