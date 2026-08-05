-- ============================================================================
-- Médico "SAO FRANCISCO DE PAULA" — "Consulta Diferenciada" não aparecia na
-- agenda e a guia imprimia "FISIOTERAPIA".
--
-- Executado em 10/07/2026 via MCP do Lovable Cloud (projeto patientpal-secure).
-- Registro do que foi diagnosticado e aplicado. Inclui rollback ao final.
--
-- IDs de referência:
--   médico ............ 8edf7bc6-a3a2-4374-8330-0818c5958799
--   clínica ........... 7570ddde-8c1c-4b55-ba72-cf12b2a6c940
--   serviço ("CONSULTA DIFERENCIADA") ... ac7bc767-e377-46ca-ae01-110f23c0508b
--   agenda ("CONSULTAS") ................ 430fc853-e140-45de-b2dd-12c8faf20c5f
--   especialidade NEUROLOGIA ............ 01ee9991-37b3-4c09-bd1d-00924b0bfe77
--   especialidade FISIOTERAPIA (antiga) . 9e802471-65f6-41a8-b09f-c68988810a85
-- ============================================================================

-- ---------------------------------------------------------------------------
-- DIAGNÓSTICO (o que se descobriu)
--   * A "CONSULTA DIFERENCIADA" JÁ estava vinculada ao médico (inclusive sob
--     NEUROLOGIA). O que a escondia era a AGENDA "CONSULTAS", que tem lista
--     restrita de 535 serviços e NÃO incluía esse serviço.
--   * A guia lê medicos.especialidade_id (especialidade "principal"), que
--     estava como FISIOTERAPIA — resquício de import em massa (o médico está
--     ligado a ~57 especialidades / ~1.658 serviços).
-- ---------------------------------------------------------------------------


-- ======================= CORREÇÃO 1 — SERVIÇO APARECER ======================
-- Libera "CONSULTA DIFERENCIADA" na lista restrita da agenda "CONSULTAS".
insert into medico_agenda_procedimentos (agenda_id, procedimento_id, clinica_id)
select '430fc853-e140-45de-b2dd-12c8faf20c5f',
       'ac7bc767-e377-46ca-ae01-110f23c0508b',
       '7570ddde-8c1c-4b55-ba72-cf12b2a6c940'
where not exists (
  select 1 from medico_agenda_procedimentos
  where agenda_id = '430fc853-e140-45de-b2dd-12c8faf20c5f'
    and procedimento_id = 'ac7bc767-e377-46ca-ae01-110f23c0508b'
);


-- ======================= CORREÇÃO 2 — IMPRESSÃO =============================
-- Especialidade principal do médico: FISIOTERAPIA -> NEUROLOGIA.
update medicos
set especialidade_id = '01ee9991-37b3-4c09-bd1d-00924b0bfe77'
where id = '8edf7bc6-a3a2-4374-8330-0818c5958799';


-- ============================= ROLLBACK (se precisar) =======================
-- Desfaz a Correção 1:
-- delete from medico_agenda_procedimentos
-- where agenda_id = '430fc853-e140-45de-b2dd-12c8faf20c5f'
--   and procedimento_id = 'ac7bc767-e377-46ca-ae01-110f23c0508b';
--
-- Desfaz a Correção 2 (volta para FISIOTERAPIA):
-- update medicos set especialidade_id = '9e802471-65f6-41a8-b09f-c68988810a85'
-- where id = '8edf7bc6-a3a2-4374-8330-0818c5958799';
