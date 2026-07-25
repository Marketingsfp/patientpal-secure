## Descrição

<!-- O que muda e por quê. Uma frase. -->

## Tipo

- [ ] hotfix (correção urgente em produção)
- [ ] fix (correção descoberta no laboratório)
- [ ] feature (funcionalidade nova)
- [ ] release (subida de bloco validado para produção)
- [ ] chore/docs

## Clínica-alvo (regra 1.10 do AGENTS.md)

- [ ] Todas as clínicas
- [ ] POLICLINICA SAO FRANCISCO DE PAULA
- [ ] POLICLINICA MENINO JESUS
- [ ] CLINICA CONSULTA HOJE
- [ ] Outra: ______

## Checklist

- [ ] Causa raiz identificada
- [ ] Correção em branch própria (`hotfix/`, `fix/`, `feature/`, `release/`)
- [ ] Migrations são idempotentes e sem `DROP` destrutivo sem plano reverso
- [ ] Testado no Lovable-Lab (`develop`)
- [ ] PR espelho aberto para a outra branch (`main` ⇄ `develop`) quando aplicável
- [ ] Integrações externas verificadas (WhatsApp / NFS-e / e-mail / boletos)
- [ ] Nenhuma credencial ou URL de ambiente commitada em `.env` / `client.ts`

## Plano de rollback

<!-- Como reverter caso quebre. Ex.: `git revert <sha>` + migration compensatória X. -->

## Evidências

<!-- Prints, links do preview do Lab, resultado dos testes. -->