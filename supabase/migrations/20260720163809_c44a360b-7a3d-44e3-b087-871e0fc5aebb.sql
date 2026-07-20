
-- Fase 1 Odontograma clínico: estender enum com novos status
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'selante';
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'sangramento';
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'mobilidade';
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'tartaro';
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'aparelho';
ALTER TYPE odonto_status ADD VALUE IF NOT EXISTS 'faceta';
