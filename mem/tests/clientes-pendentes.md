---
name: Testes pendentes do cadastro de clientes
description: Cenários de /app/clientes que não foram exercitados por timeout do Playwright na simulação de 50 clientes; reexecutar em lotes menores
type: feature
---
Durante a simulação de 50 cadastros + cenários de erro em /app/clientes, alguns fluxos ficaram sem cobertura por timeout. Reexecutar em lotes de 10-15 clientes e por aba isolada. Pendências:

- **Aba Endereço**: buscar CEP inválido/inexistente, CEP com falha de rede (ViaCEP off), UF fora de 2 letras, número de imóvel só com símbolos.
- **Aba Responsável**: cadastrar menor sem responsável (aviso deve aparecer), CPF do responsável duplicado, parentesco em branco.
- **Aba Biometria**: cadastro facial (fluxo requer câmera — usar mock), consentimento LGPD, revogação.
- **Aba Prontuário/Histórico/Convênio**: só visíveis em edição; abrir cliente existente e validar filtros por data/médico/procedimento e paginação.
- **Foto**: upload > 5MB, extensão não permitida, câmera negada.
- **Voz**: ditar em campos numéricos (CPF, telefone) e validar normalização "arroba/ponto/hífen".
- **Concorrência**: dois usuários editando o mesmo paciente simultaneamente.
- **RLS**: tentar acessar/editar paciente de outra clínica (deve falhar).

Correções já aplicadas nesta rodada (não precisam ser retestadas isoladamente, mas rodar smoke): nome com letras/maxLength, data 1900-hoje, e-mail via toast, CPF único por clínica.
