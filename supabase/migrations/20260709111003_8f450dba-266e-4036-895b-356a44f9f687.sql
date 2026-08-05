WITH first_print AS (
  SELECT agendamento_id, MIN(created_at) AS first_at
  FROM public.gr_impressoes
  GROUP BY agendamento_id
),
alvos AS (
  SELECT a.id, a.agenda_id, a.medico_id, a.inicio, fp.first_at
  FROM public.agendamentos a
  JOIN first_print fp ON fp.agendamento_id = a.id
),
posicoes AS (
  SELECT alvos.id,
    (
      SELECT COUNT(*)::int
      FROM public.agendamentos ag2
      WHERE (alvos.agenda_id IS NOT NULL AND ag2.agenda_id = alvos.agenda_id
             OR alvos.agenda_id IS NULL AND ag2.medico_id = alvos.medico_id)
        AND ag2.inicio::date = alvos.inicio::date
        AND ag2.inicio < alvos.inicio
        AND ag2.created_at < alvos.first_at
        -- mesmo filtro do print-gr.ts: só descarta se sem paciente E nome vazio/disponivel/bloqueio
        AND NOT (
          ag2.paciente_id IS NULL
          AND LOWER(TRIM(TRANSLATE(COALESCE(ag2.paciente_nome, ''),
                'áàãâäéèêëíìîïóòõôöúùûüçÁÀÃÂÄÉÈÊËÍÌÎÏÓÒÕÔÖÚÙÛÜÇ',
                'aaaaaeeeeiiiiooooouuuucAAAAAEEEEIIIIOOOOOUUUUC')))
              IN ('disponivel','bloqueio','')
        )
    ) + 1 AS pos
  FROM alvos
)
UPDATE public.agendamentos a
SET ficha_numero = p.pos
FROM posicoes p
WHERE a.id = p.id AND p.pos > 0;