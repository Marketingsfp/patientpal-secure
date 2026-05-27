DO $$
DECLARE
  r record;
  v_text text;
  n int;
  v_pos int;
  v_old text := 'Nome:{{DEPENDENTES}}';
BEGIN
  FOR r IN SELECT id, modelo_contrato FROM public.cb_convenios WHERE modelo_contrato IS NOT NULL LOOP
    v_text := r.modelo_contrato;

    -- 1) Substitui cada ocorrência de "Nome:{{DEPENDENTES}}" por "Nome: {{DEPENDENTE_N}}"
    FOR n IN 1..20 LOOP
      v_pos := position(v_old in v_text);
      EXIT WHEN v_pos = 0;
      v_text := overlay(v_text placing 'Nome: {{DEPENDENTE_' || n || '}}' from v_pos for length(v_old));
    END LOOP;

    -- 2) Envolve cada grupo de 3 <tr> do slot N com {{#DEPENDENTE_N}}...{{/DEPENDENTE_N}}
    --    Pattern cobre as variações <td rowspan="3"> e <td colspan="1" rowspan="3">
    v_text := regexp_replace(
      v_text,
      '(<tr><td(?: colspan="1")? rowspan="3"[^>]*><p?>?<strong>(\d+)</strong></p?>?</td>.*?</tr><tr>.*?Nascimento:.*?</tr><tr>.*?Telefone:.*?</tr>)',
      '{{#DEPENDENTE_\2}}\1{{/DEPENDENTE_\2}}',
      'g'
    );

    UPDATE public.cb_convenios SET modelo_contrato = v_text WHERE id = r.id;
  END LOOP;
END $$;