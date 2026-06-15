-- Migration 017 (2026-06-15): Seed Growth Revenue from IDEAL Power Team & Goal 2026
-- Source workbook: IDEAL Power Team & Goal 2026.xlsx / Summary sheet.
-- Idempotent: updates groups, then replaces member rows only inside these source groups.

WITH src_groups(name, sort_order) AS (
  VALUES
    ('1. Developer', 1),
    ('2.  Restaurant & Supermarket', 2),
    ('3. Company&Government', 3),
    ('4. Privilege', 4),
    ('5. Showroom', 5),
    ('6. Chemicals and agriculture', 6),
    ('7. Event', 7)
)
INSERT INTO growth_referral_groups (name, sort_order)
SELECT name, sort_order FROM src_groups
ON CONFLICT (name) DO UPDATE SET
  sort_order = EXCLUDED.sort_order,
  updated_at = now();

WITH src_groups(name) AS (
  VALUES
    ('1. Developer'),
    ('2.  Restaurant & Supermarket'),
    ('3. Company&Government'),
    ('4. Privilege'),
    ('5. Showroom'),
    ('6. Chemicals and agriculture'),
    ('7. Event')
)
DELETE FROM growth_referral_members grm
USING growth_referral_groups grg, src_groups sg
WHERE grm.group_id = grg.id
  AND grg.name = sg.name;

WITH src_members(group_name, seq_no, raw_name, nickname, membership_age, note, target_thb, received_thb) AS (
  VALUES
    ('1. Developer', 1, 'Jirayu Boonlert', 'ฟอร์ด', '#REF!', 'TL Y | ยอดให้ 533,984 | เป้าหมายบริษัท 18,000,000 | เฉลี่ยลูกค้า/ปี 60,000', 4000000.00, 304140.00),
    ('1. Developer', 2, 'Kanpong Ritchainimit', 'หนึ่ง', '#REF!', 'TL Y | ยอดให้ 684,510 | เป้าหมายบริษัท 120,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 10000000.00, 1566630.00),
    ('1. Developer', 3, 'Nantawat Mahaeknan', 'เน็ท', '#REF!', 'TL R | ยอดให้ 121,542 | เป้าหมายบริษัท 80,000,000 | เฉลี่ยลูกค้า/ปี 200,000', 3000000.00, 1971083.00),
    ('1. Developer', 4, 'Pariphon Jaroonthiravith', 'ปิงปอง', '#REF!', 'TL G | ยอดให้ 3,074,019 | เป้าหมายบริษัท 10,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 5000000.00, 563852.00),
    ('1. Developer', 5, 'Ploypachcha Tararattanapawn', 'เม', '#REF!', 'TL Y | ยอดให้ 143,747 | เป้าหมายบริษัท 7,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 2000000.00, 156315.00),
    ('1. Developer', 6, 'Praputsorn Kongsarppaisal', 'แยม', '#REF!', 'TL G | ยอดให้ 473,205 | เป้าหมายบริษัท 300,000,000 | เฉลี่ยลูกค้า/ปี 200,000', 3000000.00, 1477198.00),
    ('1. Developer', 7, 'Thanongsak Seriumnuay', 'โอ', '#REF!', 'TL R | ยอดให้ 678,168 | เป้าหมายบริษัท 30,000,000 | เฉลี่ยลูกค้า/ปี 600,000', 3000000.00, 244000.00),
    ('2.  Restaurant & Supermarket', 1, 'Archara Pagarat', 'นุ่น', '#REF!', 'TL G | ยอดให้ 312,702 | เป้าหมายบริษัท 3,500,000 | เฉลี่ยลูกค้า/ปี 28,800', 1000000.00, 26440.00),
    ('2.  Restaurant & Supermarket', 2, 'Jakrapong Visetpanpong', 'อ้น', '#REF!', 'TL G | ยอดให้ 45,471 | เป้าหมายบริษัท 10,000,000 | เฉลี่ยลูกค้า/ปี 40,000', 2000000.00, 35090.00),
    ('2.  Restaurant & Supermarket', 3, 'Korranat Worawongthep', 'แพร', '#REF!', 'TL G | ยอดให้ 74,508 | เป้าหมายบริษัท 2,400,000 | เฉลี่ยลูกค้า/ปี 240,000', 1920000.00, 483000.00),
    ('2.  Restaurant & Supermarket', 4, 'Naruporn Supittayapornpong', 'เอ๋ย', '#REF!', 'TL Y | ยอดให้ 84,900 | เป้าหมายบริษัท 10,000,000 | เฉลี่ยลูกค้า/ปี 28,000', 2000000.00, 275069.00),
    ('2.  Restaurant & Supermarket', 5, 'Phitarn Sakulthanaphetch', 'ตูมตาม', '#REF!', 'TL G | ยอดให้ 225,436 | เป้าหมายบริษัท 1,500,000 | เฉลี่ยลูกค้า/ปี 8,750', 150000.00, 22681.00),
    ('2.  Restaurant & Supermarket', 6, 'Prakorn Sirimars', 'ไผ่', '#REF!', 'TL Y | ยอดให้ 120,194 | เป้าหมายบริษัท 8,000,000 | เฉลี่ยลูกค้า/ปี 600,000', 1200000.00, 27465.00),
    ('2.  Restaurant & Supermarket', 7, 'Preeda Noita', 'ตุ๋ย', '#REF!', 'TL G | ยอดให้ 1,469,463 | เป้าหมายบริษัท 60,000,000 | เฉลี่ยลูกค้า/ปี 2,000,000', 20000000.00, 24436448.00),
    ('2.  Restaurant & Supermarket', 8, 'Theerawut Piyaphinthu', 'เบส', '#REF!', 'TL R | ยอดให้ 100,829 | เป้าหมายบริษัท 7,500,000 | เฉลี่ยลูกค้า/ปี 256,000', 5000000.00, 334918.00),
    ('2.  Restaurant & Supermarket', 9, 'Thitima Hemarak', 'ปุ๊ก', '#REF!', 'TL G | ยอดให้ 29,978,284 | เป้าหมายบริษัท 75,600,000 | เฉลี่ยลูกค้า/ปี 630,000', 12000000.00, 1949341.00),
    ('3. Company&Government', 1, 'Adisak Pankhot', 'ออฟ', '#REF!', 'TL Y | ยอดให้ 524,056 | เป้าหมายบริษัท 50,000,000 | เฉลี่ยลูกค้า/ปี 5,000,000', 10000000.00, 177050.00),
    ('3. Company&Government', 2, 'Chiranan Sathitsamphan', 'โอ', '#REF!', 'TL G | ยอดให้ 117,613 | เป้าหมายบริษัท 5,000,000 | เฉลี่ยลูกค้า/ปี 10,000', 500000.00, 1604.00),
    ('3. Company&Government', 3, 'Gomen Khotsopa', 'แมน', '#REF!', 'TL R | ยอดให้ 209,047 | เป้าหมายบริษัท 2,400,000 | เฉลี่ยลูกค้า/ปี 20,000', 480000.00, 171510.00),
    ('3. Company&Government', 4, 'Kittathat Jaruchaikul', 'วินโด้', '#REF!', 'TL Y | ยอดให้ 329,246 | เป้าหมายบริษัท 100,000,000 | เฉลี่ยลูกค้า/ปี 500,000', 5000000.00, 2700.00),
    ('3. Company&Government', 5, 'Nipawee Supachaisakron', 'แพรว', '#REF!', 'TL G | ยอดให้ 221,233 | เป้าหมายบริษัท 24,000,000 | เฉลี่ยลูกค้า/ปี 25,000', 1152010.00, 589394.00),
    ('3. Company&Government', 6, 'Palat Thanasrivanichai', 'เลียว', '#REF!', 'TL G | ยอดให้ 648,377 | เป้าหมายบริษัท 50,000,000 | เฉลี่ยลูกค้า/ปี 500,000', 10000000.00, 345345.00),
    ('3. Company&Government', 7, 'Phasuthon Taesuwan', 'อะตอม', '#REF!', 'TL  | ยอดให้ 10,808 | เป้าหมายบริษัท 20,000,000 | เฉลี่ยลูกค้า/ปี 30,000', 2000000.00, 1795.00),
    ('3. Company&Government', 8, 'Pongpat Chanthai', 'เขียว', '#REF!', 'TL G | ยอดให้ 243,831 | เป้าหมายบริษัท 1,500,000 | เฉลี่ยลูกค้า/ปี 40,000', 150000.00, 194310.00),
    ('3. Company&Government', 9, 'Rewat Sanpet', 'แอม', '#REF!', 'TL Y | ยอดให้ 139,408 | เป้าหมายบริษัท 3,000,000 | เฉลี่ยลูกค้า/ปี 10,000', 450000.00, 170790.00),
    ('3. Company&Government', 10, 'Samrit Pholjan', 'ดราฟ', '#REF!', 'TL Y | ยอดให้ 105,124 | เป้าหมายบริษัท 3,000,000 | เฉลี่ยลูกค้า/ปี 50,000', 900000.00, 97300.00),
    ('3. Company&Government', 11, 'Sophon Saenubol', 'พอล', '#REF!', 'TL  | ยอดให้ 53,875 | เป้าหมายบริษัท 6,000,000 | เฉลี่ยลูกค้า/ปี 200,000', 500000.00, 0.00),
    ('3. Company&Government', 12, 'Thanyalak Samreeloy', 'ธัญญา', '#REF!', 'TL Y | ยอดให้ 242,319 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 0.00, 146513.00),
    ('3. Company&Government', 13, 'Yosita Niyomrat', 'ยา', '#REF!', 'TL Y | ยอดให้ 354,187 | เป้าหมายบริษัท 5,000,000 | เฉลี่ยลูกค้า/ปี 10,000', 1200000.00, 288241.00),
    ('4. Privilege', 1, 'Chananan Saengplao', 'แหม่ม', '#REF!', 'TL Y | ยอดให้ 96,472 | เป้าหมายบริษัท 5,000,000 | เฉลี่ยลูกค้า/ปี 116,000', 2000000.00, 863005.00),
    ('4. Privilege', 2, 'Phanupan Somsanook', 'โก้', '#REF!', 'TL Y | ยอดให้ 24,600 | เป้าหมายบริษัท 3,600,000 | เฉลี่ยลูกค้า/ปี 10,000', 1400000.00, 53790.00),
    ('4. Privilege', 3, 'Orapan Pougpralub', 'หมอตู่', '#REF!', 'TL Y | ยอดให้ 206,889 | เป้าหมายบริษัท 20,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 2000000.00, 183827.00),
    ('4. Privilege', 4, 'Ophat Taerattanachai', 'เปเล่', '#REF!', 'TL G | ยอดให้ 294,357 | เป้าหมายบริษัท 20,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 2000000.00, 1720210.00),
    ('4. Privilege', 5, 'Phanuwat Promwong', 'ยศ', '#REF!', 'TL G | ยอดให้ 1,027,148 | เป้าหมายบริษัท 60,000,000 | เฉลี่ยลูกค้า/ปี 5,000,000', 5000000.00, 1909000.00),
    ('4. Privilege', 6, 'Suporn Wongchompoo', 'พร', '#REF!', 'TL G | ยอดให้ 258,973 | เป้าหมายบริษัท 4,000,000 | เฉลี่ยลูกค้า/ปี 3,000', 600000.00, 77432.00),
    ('5. Showroom', 1, 'Pemika Siriyotha', 'มิ้น', '#REF!', 'TL Y | ยอดให้ 128,920 | เป้าหมายบริษัท 4,000,000 | เฉลี่ยลูกค้า/ปี 50,000', 500000.00, 139890.00),
    ('5. Showroom', 2, 'Tanyaluck Treepornwasu', 'จ๊อบ', '#REF!', 'TL Y | ยอดให้ 76,400 | เป้าหมายบริษัท 7,000,000 | เฉลี่ยลูกค้า/ปี 200,000', 3000000.00, 109511.00),
    ('5. Showroom', 3, 'Wasawat Rattanakornpipat', 'ฤทธิ์', '#REF!', 'TL R | ยอดให้ 98,682 | เป้าหมายบริษัท 1,000,000 | เฉลี่ยลูกค้า/ปี 549,154', 500000.00, 183257.00),
    ('7. Event', 1, 'Phannakorn Kittikool', 'ปิุ๊ก', '#REF!', 'TL R | ยอดให้ 93,470 | เป้าหมายบริษัท 8,000,000 | เฉลี่ยลูกค้า/ปี 100,000', 1000000.00, 205900.00),
    ('7. Event', 2, 'Thanakrit Wathport', 'บาย', '#REF!', 'TL R | ยอดให้ 248,672 | เป้าหมายบริษัท 35,000,000 | เฉลี่ยลูกค้า/ปี 120,000', 5000000.00, 1350763.00),
    ('7. Event', 3, 'Wisnugorn Udornwong', 'แต้ม', '#REF!', 'TL Y | ยอดให้ 358,455 | เป้าหมายบริษัท 5,000,000 | เฉลี่ยลูกค้า/ปี 25,000', 1000000.00, 159655.00),
    ('7. Event', 4, 'Narin Lourujirakul', 'โต้ง', '#REF!', 'TL Y | ยอดให้ 126,633 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 2000000.00, 168674.00),
    ('7. Event', 5, 'Duangkamon Chanthaboon', 'เฟิร์น', '#REF!', 'TL G | ยอดให้ 503,345 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 700000.00, 17720.00),
    ('7. Event', 6, 'Kanoknat Nakkhonthai', 'แนน', '#REF!', 'TL G | ยอดให้ 1,367,146 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 2000000.00, 193576.00),
    ('7. Event', 7, 'Itthipol Rattanapirote', 'ฟิว', '#REF!', 'TL Y | ยอดให้ 187,046 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 1000000.00, 159800.00),
    ('7. Event', 8, 'Weerawat Suepadkon', 'หนุ่ม', '#REF!', 'TL Y | ยอดให้ 99,931 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 1500000.00, 158743.00),
    ('7. Event', 9, 'Ekawat Suwannahong', 'ต้น', '', 'TL R | ยอดให้ 54,850 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 300,000', 1500000.00, 587900.00),
    ('7. Event', 10, 'Jetsada Sanudomchok', 'เจษ', '', 'TL Y | ยอดให้ 124,954 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 200000.00, 0.00),
    ('7. Event', 11, 'Nilin Waroha', 'ควีน', '', 'TL Y | ยอดให้ 266,660 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 300000.00, 62626.00),
    ('7. Event', 12, 'Pisit Akarapanichayakul', 'กร', '', 'TL G | ยอดให้ 115,728 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 5000000.00, 0.00),
    ('7. Event', 13, 'Katanchalee Sithiprom', 'ตุ้ย', '', 'TL  | ยอดให้ 13,777 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 0', 1000000.00, 0.00),
    ('7. Event', 14, 'Nattawut Amsri', 'ปลาย', '', 'TL R | ยอดให้ 17,406 | เป้าหมายบริษัท 0 | เฉลี่ยลูกค้า/ปี 1,500,000', 1500000.00, 32500.00)
), resolved AS (
  SELECT
    g.id AS group_id,
    sm.seq_no, sm.raw_name, sm.nickname, sm.membership_age, sm.note, sm.target_thb, sm.received_thb,
    m.id AS member_id
  FROM src_members sm
  JOIN growth_referral_groups g ON g.name = sm.group_name
  LEFT JOIN members m
    ON lower(trim(m.name)) = lower(trim(sm.raw_name))
    OR lower(trim(m.nickname)) = lower(trim(sm.nickname))
)
INSERT INTO growth_referral_members (group_id, member_id, raw_name, nickname, seq_no, target_thb, received_thb, membership_age, note)
SELECT group_id, member_id, raw_name, nickname, seq_no, target_thb, received_thb, membership_age, note
FROM resolved;
