BEGIN;
CREATE TABLE policy (
  policy_id text PRIMARY KEY,
  astronomy_version text NOT NULL,
  timezone_version text NOT NULL,
  rule_version text NOT NULL,
  place_version text NOT NULL,
  day_boundary text NOT NULL CHECK (day_boundary = 'solar_23'),
  status text NOT NULL CHECK (status IN ('draft','verified','active')),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE solar_term (
  policy_id text NOT NULL REFERENCES policy(policy_id),
  term_year smallint NOT NULL,
  longitude smallint NOT NULL CHECK (longitude BETWEEN 0 AND 359 AND longitude % 15 = 0),
  instant_utc timestamptz NOT NULL,
  PRIMARY KEY (policy_id, term_year, longitude)
);
CREATE TABLE place (
  place_id text PRIMARY KEY,
  name_ko text NOT NULL,
  longitude numeric(9,6) NOT NULL CHECK (longitude BETWEEN 124 AND 132),
  latitude numeric(9,6),
  source_url text NOT NULL,
  source_version text NOT NULL,
  verified_at timestamptz
);
CREATE TABLE chart (
  chart_id char(64) PRIMARY KEY,
  policy_id text NOT NULL REFERENCES policy(policy_id),
  year_pillar char(2) NOT NULL,
  month_pillar char(2) NOT NULL,
  day_pillar char(2) NOT NULL,
  hour_pillar char(2) NOT NULL,
  features jsonb NOT NULL DEFAULT '{}'::jsonb,
  UNIQUE (policy_id,year_pillar,month_pillar,day_pillar,hour_pillar)
);
CREATE TABLE chart_occurrence (
  occurrence_id bigserial PRIMARY KEY,
  chart_id char(64) NOT NULL REFERENCES chart(chart_id),
  place_id text NOT NULL REFERENCES place(place_id),
  instant_utc timestamptz NOT NULL,
  civil_time timestamp NOT NULL,
  utc_offset_min smallint NOT NULL,
  solar_time timestamp NOT NULL,
  boundary_distance_min numeric(9,2) NOT NULL CHECK (boundary_distance_min >= 0),
  is_representative boolean NOT NULL,
  UNIQUE (chart_id,place_id,instant_utc)
);
CREATE TABLE chart_motif (
  chart_id char(64) NOT NULL REFERENCES chart(chart_id),
  rule_id text NOT NULL,
  motif text NOT NULL,
  priority smallint NOT NULL CHECK (priority BETWEEN 0 AND 3),
  family text NOT NULL,
  evidence jsonb NOT NULL,
  ruleset_version text NOT NULL,
  source_url text,
  PRIMARY KEY (chart_id,rule_id,motif,ruleset_version)
);
CREATE TABLE name_entry (
  name_id text PRIMARY KEY,
  hangul text NOT NULL,
  hanja text,
  reading_verified boolean NOT NULL DEFAULT false,
  meaning_ko text NOT NULL,
  motif_tags text[] NOT NULL,
  style_tags text[] NOT NULL,
  naturalness smallint NOT NULL CHECK (naturalness BETWEEN 1 AND 5),
  is_playful boolean NOT NULL DEFAULT false,
  review_status text NOT NULL CHECK (review_status IN ('draft','verified','rejected')),
  source_url text NOT NULL,
  provenance_note text,
  corpus_version text NOT NULL
);
CREATE TABLE build_manifest (
  build_id text PRIMARY KEY,
  policy_id text NOT NULL REFERENCES policy(policy_id),
  started_at timestamptz NOT NULL,
  completed_at timestamptz,
  chart_count bigint NOT NULL DEFAULT 0,
  occurrence_count bigint NOT NULL DEFAULT 0,
  motif_count bigint NOT NULL DEFAULT 0,
  checksum_sha256 char(64),
  status text NOT NULL CHECK (status IN ('running','failed','verified')),
  notes text
);
CREATE INDEX chart_motif_lookup ON chart_motif(motif,priority DESC,chart_id) WHERE priority >= 2;
CREATE INDEX occurrence_chart_quality ON chart_occurrence(chart_id,boundary_distance_min DESC,instant_utc,place_id) WHERE is_representative;
CREATE INDEX occurrence_place_time ON chart_occurrence(place_id,instant_utc);
CREATE INDEX name_motif_lookup ON name_entry USING gin(motif_tags);
CREATE INDEX name_style_lookup ON name_entry USING gin(style_tags);
COMMIT;
