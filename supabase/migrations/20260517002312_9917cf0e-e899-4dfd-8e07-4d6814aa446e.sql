DELETE FROM medico_especialidades WHERE especialidade_id = 'c7d2cc61-94b0-4c16-b5d8-34406e72fae9';
UPDATE medicos SET especialidade_id = NULL WHERE especialidade_id = 'c7d2cc61-94b0-4c16-b5d8-34406e72fae9';
DELETE FROM especialidades WHERE id = 'c7d2cc61-94b0-4c16-b5d8-34406e72fae9';