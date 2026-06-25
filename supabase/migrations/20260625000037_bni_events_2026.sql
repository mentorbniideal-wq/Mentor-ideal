-- Migration 037: BNI Thailand Training & Event Schedule 2026
-- Source: "BNI Thailand Training & Event Schedule 2026 as of 29 Sep 2025"
-- Dates cross-verified against 2026 calendar (Jan 1 = Thursday).
-- Rows 1-23 map to official schedule row numbers.

-- ── Table ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS bni_events (
  id         UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
  event_no   SMALLINT,                        -- row # from BNI schedule
  name       TEXT    NOT NULL,
  event_date DATE    NOT NULL,
  time_start TIME,
  time_end   TIME,
  ceu        SMALLINT NOT NULL DEFAULT 0,
  category   TEXT    NOT NULL DEFAULT 'training',
  -- category: 'msp' | 'skill' | 'lt' | 'club' | 'event'
  audience   TEXT    NOT NULL DEFAULT 'all',
  -- audience: 'all' | 'lt' | 'mentor' | 'growth' | 'new_member' | 'president' | 'vp' | 'st'
  is_online  BOOLEAN NOT NULL DEFAULT false,
  year       SMALLINT NOT NULL DEFAULT 2026,
  UNIQUE (event_no, event_date)
);

COMMENT ON TABLE bni_events IS
  'BNI Thailand national training & event schedule. Seeded from official 2026 calendar PDF.';

CREATE INDEX IF NOT EXISTS idx_bni_events_date  ON bni_events(event_date);
CREATE INDEX IF NOT EXISTS idx_bni_events_year  ON bni_events(year, event_date);

-- ── Seed 2026 ─────────────────────────────────────────────────────────
-- Row 1: Member Success Program (MSP) — all members, 1 CEU, 10:00–17:00
-- Two sessions most months (Jan–Sep), one session Oct–Dec.
-- Note: a few dates in PDF had day-name mismatches; date-number used as authoritative.
INSERT INTO bni_events (event_no, name, event_date, time_start, time_end, ceu, category, audience, is_online)
VALUES
  (1,'MSP','2026-01-13','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-01-28','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-02-10','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-02-25','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-03-10','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-03-25','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-04-10','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-04-29','10:00','17:00',1,'msp','all',false), -- PDF: Apr Wed 27 → Apr 29=Wed
  (1,'MSP','2026-05-12','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-05-27','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-06-09','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-06-26','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-07-07','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-07-22','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-08-14','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-08-25','10:00','17:00',1,'msp','all',false), -- PDF: Aug Tue 27 → Aug 25=Tue
  (1,'MSP','2026-09-11','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-09-23','10:00','17:00',1,'msp','all',false), -- PDF: Sep Wed 25 → Sep 23=Wed
  (1,'MSP','2026-10-14','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-11-10','10:00','17:00',1,'msp','all',false),
  (1,'MSP','2026-12-18','10:00','17:00',1,'msp','all',false),

-- Row 2: Advanced MSP — all members, 1 CEU, 10:00–17:00, one per month
  (2,'Advanced MSP','2026-01-20','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-02-20','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-03-20','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-04-24','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-05-22','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-06-19','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-07-17','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-08-26','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-09-18','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-10-22','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-11-20','10:00','17:00',1,'msp','all',false),
  (2,'Advanced MSP','2026-12-09','10:00','17:00',1,'msp','all',false),

-- Row 3: Member Goal Setting (Online) — 2 dates/year
  (3,'Member Goal Setting','2026-03-05','13:00','16:00',1,'skill','all',true),
  (3,'Member Goal Setting','2026-09-03','13:00','16:00',1,'skill','all',true),

-- Row 4: Networking Training (Online) — Jun & Dec
  (4,'Networking Training','2026-06-04','13:00','16:00',1,'skill','all',true),
  (4,'Networking Training','2026-12-03','13:00','16:00',1,'skill','all',true),

-- Row 5: Invitation Training (Online) — Feb & Aug
  (5,'Invitation Training','2026-02-05','13:00','16:00',1,'skill','all',true),
  (5,'Invitation Training','2026-08-06','13:00','16:00',1,'skill','all',true),

-- Row 6: Referral Training (Online) — May & Nov
  (6,'Referral Training','2026-05-07','13:00','16:00',1,'skill','all',true),
  (6,'Referral Training','2026-11-05','13:00','16:00',1,'skill','all',true),

-- Row 7: Presentation Training (Online) — Apr & Oct
  (7,'Presentation Training','2026-04-02','13:00','16:00',1,'skill','all',true),
  (7,'Presentation Training','2026-10-08','13:00','16:00',1,'skill','all',true),

-- Row 8: 1-2-1 Training (Online) — Jan & Jul
  (8,'1-2-1 Training','2026-01-08','13:00','16:00',1,'skill','all',true),
  (8,'1-2-1 Training','2026-07-03','13:00','16:00',1,'skill','all',true),

-- Row 9: Major Chapter Events — 1 CEU each
  (9,'LT Conference',                   '2026-02-04','13:00','17:00',1,'event','lt',false),
  (9,'Annual Power Team Conference 2026','2026-04-08','13:00','17:00',1,'event','lt',false),
  (9,'Master Connector & Gold Club Cof.','2026-06-24','13:00','17:00',1,'event','lt',false),
  (9,'TNC',                             '2026-08-20','08:00','17:00',1,'event','lt',false),
  (9,'TNC',                             '2026-08-21','08:00','17:00',0,'event','lt',false), -- day 2
  (9,'Chapter Plan',                    '2026-10-07','10:00','17:00',1,'event','lt',false),
  (9,'LTM Chapter of the Year',         '2026-12-16','13:00','17:00',1,'event','lt',false),

-- Row 10: LT Training — President Intensive
  (10,'LT: President Intensive','2026-02-09','10:00','17:00',1,'lt','lt',false),
  (10,'LT: President Intensive','2026-08-03','10:00','17:00',1,'lt','lt',false),

-- Row 11: LT Training — ST, NEC
  (11,'LT: ST & NEC','2026-02-16','13:00','17:00',1,'lt','lt',false),
  (11,'LT: ST & NEC','2026-09-07','13:00','17:00',1,'lt','lt',false),

-- Row 12: LT Training — VP & Committee (same dates as row 11)
  (12,'LT: VP & Committee','2026-02-16','13:00','17:00',1,'lt','lt',false),
  (12,'LT: VP & Committee','2026-09-07','13:00','17:00',1,'lt','lt',false),

-- Row 13: LT Training — Mentor, Growth Co, Webmasters
  (13,'LT: Mentor & Growth Co','2026-02-17','13:00','17:00',1,'lt','mentor',false),
  (13,'LT: Mentor & Growth Co','2026-09-08','13:00','17:00',1,'lt','mentor',false),

-- Row 14: LT Training — Visitor Host, Event Co
  (14,'LT: Visitor Host & Event Co','2026-02-18','13:00','17:00',1,'lt','lt',false),
  (14,'LT: Visitor Host & Event Co','2026-09-09','13:00','17:00',1,'lt','lt',false),

-- Row 15: ST Club — 2 dates/year (note: PDF day-name may have error for Mar date)
  (15,'ST Club','2026-03-08','17:00','20:30',1,'club','st',false),
  (15,'ST Club','2026-10-07','17:00','20:30',1,'club','st',false),

-- Rows 16–19: Leadership Clubs (President, VP, Mentor, Growth)
-- All share the same schedule; online months: Jan, Mar, May, Jul, Sep, Nov
  (16,'President Club','2026-01-20','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-02-04','17:00','20:30',1,'club','president',false),
  (16,'President Club','2026-03-11','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-04-08','17:00','20:30',1,'club','president',false),
  (16,'President Club','2026-05-13','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-06-24','17:00','20:30',1,'club','president',false),
  (16,'President Club','2026-07-15','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-08-05','17:00','20:30',1,'club','president',false),
  (16,'President Club','2026-09-16','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-10-07','17:00','20:30',1,'club','president',false),
  (16,'President Club','2026-11-18','17:00','20:30',1,'club','president',true),
  (16,'President Club','2026-12-16','17:00','20:30',1,'club','president',false),

  (17,'VP Club','2026-01-20','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-02-04','17:00','20:30',1,'club','vp',false),
  (17,'VP Club','2026-03-11','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-04-08','17:00','20:30',1,'club','vp',false),
  (17,'VP Club','2026-05-13','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-06-24','17:00','20:30',1,'club','vp',false),
  (17,'VP Club','2026-07-15','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-08-05','17:00','20:30',1,'club','vp',false),
  (17,'VP Club','2026-09-16','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-10-07','17:00','20:30',1,'club','vp',false),
  (17,'VP Club','2026-11-18','17:00','20:30',1,'club','vp',true),
  (17,'VP Club','2026-12-16','17:00','20:30',1,'club','vp',false),

  (18,'Mentor Club','2026-01-20','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-02-04','17:00','20:30',1,'club','mentor',false),
  (18,'Mentor Club','2026-03-11','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-04-08','17:00','20:30',1,'club','mentor',false),
  (18,'Mentor Club','2026-05-13','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-06-24','17:00','20:30',1,'club','mentor',false),
  (18,'Mentor Club','2026-07-15','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-08-05','17:00','20:30',1,'club','mentor',false),
  (18,'Mentor Club','2026-09-16','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-10-07','17:00','20:30',1,'club','mentor',false),
  (18,'Mentor Club','2026-11-18','17:00','20:30',1,'club','mentor',true),
  (18,'Mentor Club','2026-12-16','17:00','20:30',1,'club','mentor',false),

  (19,'Growth Club','2026-01-20','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-02-04','17:00','20:30',1,'club','growth',false),
  (19,'Growth Club','2026-03-11','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-04-08','17:00','20:30',1,'club','growth',false),
  (19,'Growth Club','2026-05-13','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-06-24','17:00','20:30',1,'club','growth',false),
  (19,'Growth Club','2026-07-15','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-08-05','17:00','20:30',1,'club','growth',false),
  (19,'Growth Club','2026-09-16','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-10-07','17:00','20:30',1,'club','growth',false),
  (19,'Growth Club','2026-11-18','17:00','20:30',1,'club','growth',true),
  (19,'Growth Club','2026-12-16','17:00','20:30',1,'club','growth',false),

-- Row 20: 1st Year Club — new members, every other month (bi-monthly)
  (20,'1st Year Club','2026-02-04','17:00','20:30',1,'club','new_member',false),
  (20,'1st Year Club','2026-04-08','17:00','20:30',1,'club','new_member',false),
  (20,'1st Year Club','2026-06-24','17:00','20:30',1,'club','new_member',false),
  (20,'1st Year Club','2026-08-05','17:00','20:30',1,'club','new_member',true),
  (20,'1st Year Club','2026-10-07','17:00','20:30',1,'club','new_member',false),
  (20,'1st Year Club','2026-12-16','17:00','20:30',1,'club','new_member',false),

-- Row 21: Meet The First Year — bi-monthly, CEU=0
  (21,'Meet The First Year','2026-01-26','13:00','16:00',0,'event','lt',false),
  (21,'Meet The First Year','2026-03-23','13:00','16:00',0,'event','lt',false),
  (21,'Meet The First Year','2026-05-25','13:00','16:00',0,'event','lt',false),
  (21,'Meet The First Year','2026-07-20','13:00','16:00',0,'event','lt',false),
  (21,'Meet The First Year','2026-09-21','13:00','16:00',0,'event','lt',false),
  (21,'Meet The First Year','2026-11-23','13:00','16:00',0,'event','lt',false),

-- Row 22: Celebrating 15 Years Members — Jun, CEU=0
  (22,'Celebrating 15 Years Members','2026-06-04','14:00','16:00',0,'event','all',false),

-- Row 23: Global Convention — Oct 28-30, CEU=0
  (23,'Global Convention','2026-10-28',NULL,NULL,0,'event','all',false),
  (23,'Global Convention','2026-10-29',NULL,NULL,0,'event','all',false),
  (23,'Global Convention','2026-10-30',NULL,NULL,0,'event','all',false)

ON CONFLICT (event_no, event_date) DO NOTHING;
