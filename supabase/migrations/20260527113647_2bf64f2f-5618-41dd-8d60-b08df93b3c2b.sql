DO $$
DECLARE
  r record;
  v_text text;
BEGIN
  FOR r IN SELECT id, modelo_contrato FROM public.cb_convenios WHERE modelo_contrato IS NOT NULL LOOP
    v_text := r.modelo_contrato;
    v_text := regexp_replace(
      v_text,
      '(<tr><td colspan="1" rowspan="3"><p><strong>(\d+)</strong></p></td>.*?</tr><tr>.*?Nascimento:.*?</tr><tr>.*?Telefone:.*?</tr>)',
      '{{#DEPENDENTE_\2}}\1{{/DEPENDENTE_\2}}',
      'g'
    );
    -- Evita duplicar wrappers no slot 1 que já foi envolvido na migração anterior
    v_text := regexp_replace(v_text, '\{\{#DEPENDENTE_(\d+)\}\}\{\{#DEPENDENTE_\1\}\}', '{{#DEPENDENTE_\1}}', 'g');
    v_text := regexp_replace(v_text, '\{\{/DEPENDENTE_(\d+)\}\}\{\{/DEPENDENTE_\1\}\}', '{{/DEPENDENTE_\1}}', 'g');
    UPDATE public.cb_convenios SET modelo_contrato = v_text WHERE id = r.id;
  END LOOP;
END $$;