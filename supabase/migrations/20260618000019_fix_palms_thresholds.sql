-- Migration 019: Fix fn_palms_score thresholds to match official BNI PALMS criteria
-- Based on official BNI PALMS document (confirmed 2026-06-18):
--   Referral: 0→0, total=weeks(1/wk)→5, total>weeks(<2/wk)→10, total≥2×weeks→15
--   1-2-1:   same 4-tier structure (previously >0 gave 5pt — wrong)
--   Visitor: months = weeks/4 (NOT 4.333 — this was already fixed in palms.ts but not SQL)

CREATE OR REPLACE FUNCTION fn_palms_score(
  p_attend  INT,
  p_absent  INT,
  p_late    INT,
  p_medical INT,
  p_sub     INT,
  p_rgi     INT,
  p_rgo     INT,
  p_visitor INT,
  p_oto     INT,
  p_ceu     NUMERIC,
  p_tyfb    NUMERIC
)
RETURNS JSONB
LANGUAGE plpgsql STABLE
AS $$
DECLARE
  weeks       INT;
  rg          INT;
  absence_pt  INT;
  referral_pt INT;
  visitor_pt  INT;
  oto_pt      INT;
  ceu_pt      INT;
  tyfb_pt     INT;
  total_pt    INT;
BEGIN
  weeks := p_attend + p_absent + p_late + p_medical + p_sub;

  IF weeks = 0 THEN
    RETURN '{"weeks":0,"absence":0,"referral":0,"visitor":0,"oneToOne":0,"ceu":0,"tyfb":0,"total":0,"color":"black"}'::jsonb;
  END IF;

  -- Absence (15 pts): 0→15, 1→10, 2→5, >2→0
  IF    p_absent = 0 THEN absence_pt := 15;
  ELSIF p_absent = 1 THEN absence_pt := 10;
  ELSIF p_absent = 2 THEN absence_pt := 5;
  ELSE                     absence_pt := 0;
  END IF;

  -- Referral (15 pts): integer comparison vs effectiveWeeks
  --   total < weeks → 0, total = weeks (1/wk) → 5, total > weeks (<2/wk) → 10, total ≥ 2×weeks → 15
  rg := p_rgi + p_rgo;
  IF    rg >= 2 * weeks THEN referral_pt := 15;
  ELSIF rg > weeks      THEN referral_pt := 10;
  ELSIF rg = weeks      THEN referral_pt := 5;
  ELSE                       referral_pt := 0;
  END IF;

  -- Visitor (20 pts): months = weeks/4 (not 4.333)
  IF    p_visitor::NUMERIC / (weeks::NUMERIC / 4) >= 1 THEN visitor_pt := 20;
  ELSIF p_visitor > 0                                   THEN visitor_pt := 10;
  ELSE                                                       visitor_pt := 0;
  END IF;

  -- 1-2-1 (15 pts): same 4-tier structure as Referral
  --   total < weeks → 0, total = weeks (1/wk) → 5, total > weeks (<2/wk) → 10, total ≥ 2×weeks → 15
  IF    p_oto >= 2 * weeks THEN oto_pt := 15;
  ELSIF p_oto > weeks      THEN oto_pt := 10;
  ELSIF p_oto = weeks      THEN oto_pt := 5;
  ELSE                          oto_pt := 0;
  END IF;

  -- CEU (20 pts): <1→0, 1→5, 2→10, 3→15, 4+→20
  IF    p_ceu >= 4 THEN ceu_pt := 20;
  ELSIF p_ceu >= 3 THEN ceu_pt := 15;
  ELSIF p_ceu >= 2 THEN ceu_pt := 10;
  ELSIF p_ceu >= 1 THEN ceu_pt := 5;
  ELSE                  ceu_pt := 0;
  END IF;

  -- TYFB (15 pts): <100k→0, ≥100k→5, ≥200k→10, ≥500k→15
  IF    p_tyfb >= 500000 THEN tyfb_pt := 15;
  ELSIF p_tyfb >= 200000 THEN tyfb_pt := 10;
  ELSIF p_tyfb >= 100000 THEN tyfb_pt := 5;
  ELSE                        tyfb_pt := 0;
  END IF;

  total_pt := absence_pt + referral_pt + visitor_pt + oto_pt + ceu_pt + tyfb_pt;

  RETURN jsonb_build_object(
    'weeks',     weeks,
    'absence',   absence_pt,
    'referral',  referral_pt,
    'visitor',   visitor_pt,
    'oneToOne',  oto_pt,
    'ceu',       ceu_pt,
    'tyfb',      tyfb_pt,
    'total',     total_pt,
    'color',     CASE
                   WHEN total_pt >= 70 THEN 'green'
                   WHEN total_pt >= 50 THEN 'yellow'
                   WHEN total_pt >= 30 THEN 'red'
                   ELSE 'black'
                 END
  );
END;
$$;
