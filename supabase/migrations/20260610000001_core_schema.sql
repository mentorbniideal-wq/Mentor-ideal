-- ============================================================
-- Migration 001: Core Schema
-- members, mentor_teams, roles (PIN-based auth)
-- ============================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- pgcrypto functions (crypt, gen_salt) live in extensions schema on Supabase cloud
SET search_path = public, extensions;

-- ============================================================
-- mentor_teams — 5 teams (source: TOOMTAM/Aof/Draft/PHAI/AMP sheets)
-- ============================================================
CREATE TABLE IF NOT EXISTS mentor_teams (
  id           SERIAL       PRIMARY KEY,
  name         TEXT         UNIQUE NOT NULL,
  leader_name  TEXT         NOT NULL,
  created_at   TIMESTAMPTZ  DEFAULT now()
);

INSERT INTO mentor_teams (name, leader_name) VALUES
  ('TOOMTAM', 'Toomtam'),
  ('Aof',     'Aof'),
  ('Draft',   'Draft'),
  ('PHAI',    'PHAI'),
  ('AMP',     'AMP')
ON CONFLICT (name) DO NOTHING;

-- ============================================================
-- roles — PIN-based auth (replaces PINS + MENTOR_ROLE in WEBAPP.js)
-- ============================================================
CREATE TABLE IF NOT EXISTS roles (
  role         TEXT    PRIMARY KEY,
  pin_hash     TEXT    NOT NULL,
  display_name TEXT    NOT NULL,
  team_name    TEXT    REFERENCES mentor_teams(name),
  is_mc        BOOLEAN NOT NULL DEFAULT false,
  is_mentor    BOOLEAN NOT NULL DEFAULT false,
  updated_at   TIMESTAMPTZ DEFAULT now()
);

INSERT INTO roles (role, pin_hash, display_name, team_name, is_mc, is_mentor) VALUES
  ('mc',      crypt('CHANGE_ME', gen_salt('bf')), 'ตูมตาม (MC)',             NULL,       true,  false),
  ('toomtam', crypt('CHANGE_ME', gen_salt('bf')), 'TOOMTAM (ตูมตาม)',        'TOOMTAM',  false, true),
  ('aof',     crypt('CHANGE_ME', gen_salt('bf')), 'Aof (อ็อฟ)',              'Aof',      false, true),
  ('draft',   crypt('CHANGE_ME', gen_salt('bf')), 'Draft (ดราฟ)',            'Draft',    false, true),
  ('phai',    crypt('CHANGE_ME', gen_salt('bf')), 'PHAI (ไผ่)',              'PHAI',     false, true),
  ('amp',     crypt('CHANGE_ME', gen_salt('bf')), 'AMP (แอมป์)',             'AMP',      false, true),
  ('growth',  crypt('CHANGE_ME', gen_salt('bf')), 'Growth Coordinator',      NULL,       false, false)
ON CONFLICT (role) DO NOTHING;

-- ============================================================
-- members — master member list (source: รายชื่อทั้งหมด sheet)
-- ============================================================
CREATE TABLE IF NOT EXISTS members (
  id            UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT    UNIQUE NOT NULL,
  nickname      TEXT,
  mentor_team   TEXT    REFERENCES mentor_teams(name),
  is_mentored   BOOLEAN NOT NULL DEFAULT true,
  is_archived   BOOLEAN NOT NULL DEFAULT false,
  archived_at   TIMESTAMPTZ,
  given_thb     NUMERIC(12,2) NOT NULL DEFAULT 0,
  received_thb  NUMERIC(12,2) NOT NULL DEFAULT 0,
  email         TEXT,
  phone         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now(),
  updated_at    TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_members_mentor_team ON members(mentor_team);
CREATE INDEX IF NOT EXISTS idx_members_is_archived ON members(is_archived) WHERE is_archived = false;
