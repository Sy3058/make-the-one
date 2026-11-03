BEGIN;
CREATE INDEX IF NOT EXISTS occurrence_civil_quality ON chart_occurrence(civil_time,chart_id) WHERE is_representative;
COMMIT;
