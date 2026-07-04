# Plano — Teste de estresse do módulo CRM

## Objetivo
Executar 20 simulações variadas de cadastro na aba **CRM** (`/app/crm`), identificar bugs, erros de validação, comportamentos inesperados de UI/UX e persistência, e entregar relatório em Excel.

## Escopo dos 20 cadastros

Distribuição planejada (mix de casos válidos e de borda para expor bugs):

**Casos "felizes" (10)** — variando origens, status e valores:
1. Lead Instagram, aberta, R$ 1.500 — telefone + email
2. Lead Facebook, ganha, R$ 8.900
3. Lead Google Ads, perdida, R$ 3.200
4. Lead indicação, aberta, R$ 15.000 (valor alto)
5. Lead WhatsApp, ganha, R$ 450
6. Lead site, aberta, R$ 0 (valor zerado)
7. Lead evento, ganha, R$ 22.500
8. Lead TikTok, perdida, R$ 780
9. Lead LinkedIn, aberta, R$ 5.400
10. Lead orgânico, ganha, R$ 12.000

**Casos de borda / validação (10)**:
11. Nome com acentos e caracteres especiais (`João D'Ávila-Süß`)
12. Nome muito longo (200+ caracteres)
13. Email inválido (`abc@`, sem TLD)
14. Telefone com formatação livre (`+55 (11) 9 8888-7777`)
15. Telefone só com letras (`abcdef`)
16. Valor negativo (`-500`)
17. Valor com casas decimais quebradas (`R$ 1.234,567`)
18. Campos opcionais todos vazios (só nome + status)
19. Nome em branco (deve falhar — required)
20. Observações longas (2000+ caracteres) + emojis

## Etapas de execução

1. **Ler o código do CRM** (`app.crm.tsx`, `SimpleCrud.tsx`, `CurrencyInput`) para entender validações existentes.
2. **Rodar Playwright headless** em `http://localhost:8080/app/crm` com sessão Supabase injetada:
   - Para cada cenário: abrir "Novo", preencher, submeter, capturar screenshot, ler toast/erro, verificar se a linha aparece na tabela.
   - Registrar comportamento observado (sucesso, erro, silêncio, crash).
3. **Verificar no banco** (`crm_oportunidades`) se cada registro foi persistido conforme esperado (valor, status, telefone/email null vs string vazia, sanitização).
4. **Testar interações pós-cadastro**: busca por nome/telefone/email, editar um registro, excluir, exportar (se houver).
5. **Consolidar achados** por categoria: validação, UX, persistência, formatação, acessibilidade, erros de console/rede.
6. **Gerar `relatorio-bugs-crm-2026-07-04.xlsx`** em `/mnt/documents/` com abas:
   - **Resumo** (total testes, ok, falhas, bugs críticos/médios/baixos)
   - **Cenários** (nº, descrição, entrada, resultado esperado, resultado obtido, status)
   - **Bugs** (id, severidade, título, passos, evidência/screenshot, sugestão de correção)
   - **Console/Rede** (erros capturados durante os testes)
7. **Limpeza**: deletar leads de teste ao final (prefixo `[TESTE CRM]` nos nomes) para não poluir o CRM real.

## O que NÃO será feito
- Nenhuma alteração de código, schema ou RLS nesta rodada — apenas diagnóstico.
- Correções de bugs virão em um próximo passo, após você aprovar quais priorizar com base no relatório.

## Entregável
Arquivo `relatorio-bugs-crm-2026-07-04.xlsx` em `/mnt/documents/` + resumo em chat com os principais achados.
