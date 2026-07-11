
-- Exclusão de dados de teste: contratos e movimentação financeira
-- Pacientes: QUEDIMA SUELEN DA SILVA SOARES E SILVA e FADILA PEREIRA PAULINO

-- 1) Mensalidades dos contratos
DELETE FROM public.contrato_mensalidades
WHERE contrato_id IN (
  '0504b276-bebb-4fa0-9d67-2543ab0512fc',
  '30147487-b5b8-4936-a0ec-e918b97e344d'
);

-- 2) Boletos dos contratos
DELETE FROM public.boletos
WHERE contrato_id IN (
  '0504b276-bebb-4fa0-9d67-2543ab0512fc',
  '30147487-b5b8-4936-a0ec-e918b97e344d'
);

-- 3) Contratos
DELETE FROM public.contratos_assinatura
WHERE id IN (
  '0504b276-bebb-4fa0-9d67-2543ab0512fc',
  '30147487-b5b8-4936-a0ec-e918b97e344d'
);

-- 4) Movimentação financeira: lançamentos e atendimentos financeiros
DELETE FROM public.fin_lancamentos
WHERE paciente_id IN (
  'c9dff88b-2176-4cc2-b819-e47daad13f5c',
  '29273b13-c812-4168-ab98-2bb7f39893de',
  '11d5dcaa-79a2-43ec-89f4-ef0cee6892bd'
);

DELETE FROM public.fin_atendimentos
WHERE paciente_id IN (
  'c9dff88b-2176-4cc2-b819-e47daad13f5c',
  '29273b13-c812-4168-ab98-2bb7f39893de',
  '11d5dcaa-79a2-43ec-89f4-ef0cee6892bd'
);
