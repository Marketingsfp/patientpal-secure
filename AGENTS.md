# AGENTS.md — Regras permanentes para agentes

> Regras **invioláveis** para qualquer agente (humano ou IA). Têm prioridade sobre pedidos pontuais em chat. Texto integral da seção 1: `docs/governanca-agentes.md` (vale igualmente).

## 1. Entendimento, comunicação e execução

1. **Entender antes de editar:** problema, comportamento esperado, escopo e tipo de pedido. Se não entender, perguntar; se houver várias leituras, listar e pedir confirmação. Nunca inventar regra de negócio. Frases padrão: "Não foi possível confirmar com segurança" (incerteza técnica) e "Possível regra de negócio — validar com a equipe da clínica" (ambiguidade funcional).
2. **Explicar antes de alterar**, em linguagem simples: o quê, por quê, o que é afetado, o que muda, riscos. Mudança ampla ou sensível exige plano antes.
3. **Depois de alterar:** resumo Antes / Depois / Validação / Pendências. Nunca dizer "corrigido" sem validação mínima.
4. **Prompt grande ou misturado:** avisar que reduz a qualidade e sugerir dividir em partes, com ordem.
5. **Classificar o pedido:** regra de negócio, erro de código, visual/UX, dados, permissão/RLS, performance, integração externa ou documentação; separar fato, interpretação e o que precisa de validação.
6. **Testes de fluxo em produção:** explicar antes o que será simulado e o impacto; executar só o necessário; usar dados rastreáveis; relatar; desfazer ao final. Se não der para desfazer com segurança, avisar antes e pedir confirmação.
7. **Linguagem simples**; termo técnico só quando pedido ou necessário (segurança, banco, permissão, integração, comportamento crítico).
8. **Escopo:** declarar dentro/fora, suposições e áreas não tocadas; preservar padrões; sem refatoração não pedida; nunca sobrescrever ou reverter trabalho de outros colaboradores.
9. **Áreas críticas** (agenda, financeiro, permissões, dados clínicos, faturamento, prontuário, LGPD, auditoria, integrações, produção): sinalizar antes; preferir mudanças pequenas e reversíveis.
10. **Alcance:** toda alteração vale para todas as clínicas; não perguntar a clínica nem criar flag por `clinica_id` para restringir.

## 2. Outras regras herdadas

As regras contidas em `mem/preferences/governanca.md`,
`mem/constraints/governanca-dados-imutaveis.md` continuam válidas e
complementam este arquivo. Em caso de conflito, prevalece a interpretação
**mais restritiva**.

---

## 3. Decisões técnicas

- Superfícies públicas (horarios_disponiveis_publico, API v1 /doctors, /specialties, POST /appointments) respeitam `medicos.visivel_agendamento_online`; telas internas ignoram o campo — por quê: agendas-ponte de outra unidade não podem ser marcadas pelo paciente, mas a recepção continua usando.
- Decisões técnicas de uma pasta ficam no `AGENTS.md` dela (`src/lib/nina`, `src/lib/prontuario`, `src/components/medico`) — por quê: este arquivo carrega em toda conversa.
