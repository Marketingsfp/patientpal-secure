
-- Reordena medico_procedimentos para colocar Top 10 de cada modalidade no topo.
-- A ordem do popover usa created_at ascendente. Backdatamos os Top 10 para
-- 1900-01-01 + (rank segundos) para garantir posição 1..10.

WITH top10 AS (
  SELECT * FROM (VALUES
    -- USG (Ultrassonografia) - top 10 Brasil
    ('USG ABDOMINAL TOTAL', 1),
    ('USG OBSTETRICA', 2),
    ('USG MORFOLOGICA', 3),
    ('USG TRANSVAGINAL', 4),
    ('USG MAMA', 5),
    ('USG TIREOIDE', 6),
    ('USG PELVICA', 7),
    ('USG VIAS URINARIAS/RENAL', 8),
    ('USG ABDOME SUPERIOR', 9),
    ('USG PROSTATA', 10),
    -- RX - top 10 Brasil
    ('RX TORAX AP/PERFIL', 1),
    ('RX COLUNA LOMBAR', 2),
    ('RX JOELHO AP / PERFIL (CADA LADO)', 3),
    ('RX COLUNA CERVICAL AP/PERFIL', 4),
    ('RX ABDOME SIMPLES', 5),
    ('RX MAO AP/OBLIQUA (CADA LADO)', 6),
    ('RX OMBRO AP / ROT INTERNA E EXTERNA', 7),
    ('RX BACIA PANORAMICA', 8),
    ('RX PUNHO AP/PERFIL', 9),
    ('RX TORNOZELO', 10),
    -- Tomografia (TC) - top 10
    ('TC CRANIO', 1),
    ('TC TORAX', 2),
    ('TC ABDOME TOTAL (SUPERIOR + PELVE)', 3),
    ('TC COLUNA LOMBAR', 4),
    ('TC COLUNA CERVICAL', 5),
    ('TC SEIOS DA FACE', 6),
    ('TC DE PELVE', 7),
    ('TC ABDOME SUPERIOR', 8),
    ('TC ARTICULACOES JOELHO (CADA LADO)', 9),
    ('TC COLUNA DORSAL (TORACICA)', 10),
    -- Ressonância (RM) - top 10
    ('RM DE CRANIO', 1),
    ('RM DE COLUNA LOMBAR', 2),
    ('RM DE JOELHO (CADA LADO)', 3),
    ('RM DE COLUNA CERVICAL', 4),
    ('RM DE COLUNA DORSAL (TORACICA)', 5),
    ('RM DE OMBRO (CADA LADO)', 6),
    ('RM DE BACIA', 7),
    ('RM DE TORNOZELO (CADA LADO)', 8),
    ('RM DE PUNHO (CADA LADO)', 9),
    ('RM SACRO-COCCIX', 10)
  ) AS t(nome, rank)
)
UPDATE public.medico_procedimentos mp
SET created_at = TIMESTAMP '1900-01-01 00:00:00+00' + (t.rank * INTERVAL '1 second')
FROM public.procedimentos p
JOIN top10 t ON UPPER(p.nome) = UPPER(t.nome)
WHERE mp.procedimento_id = p.id
  AND p.ativo = true;
