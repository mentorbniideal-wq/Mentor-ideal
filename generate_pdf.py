#!/usr/bin/env python3
"""Generate BNI IDEAL user manual PDF using fpdf2 with THSarabunNew font."""

import re
from fpdf import FPDF

FONT_REGULAR = "/Users/tfenice/Library/Fonts/THSarabunNew.ttf"
FONT_BOLD    = "/Users/tfenice/Library/Fonts/THSarabunNew Bold.ttf"
FONT_ITALIC  = "/Users/tfenice/Library/Fonts/THSarabunNew Italic.ttf"

md_path  = "คู่มือใช้งาน_BNI_IDEAL_Mentor_System.md"
pdf_path = "คู่มือใช้งาน_BNI_IDEAL_Mentor_System.pdf"

with open(md_path, encoding="utf-8") as f:
    md_lines = f.read().splitlines()

# ── Colors ────────────────────────────────────────────────────────────────────
C_BG      = (12, 21, 32)    # dark navy
C_GOLD    = (240, 180, 41)
C_BLUE    = (26, 54, 93)
C_LBLUE   = (239, 246, 255) # light blue bg for h2
C_LYELLOW = (255, 251, 235) # light yellow bg for blockquote
C_LGRAY   = (248, 250, 252) # even table rows
C_TEXT    = (26, 32, 44)
C_MUTED   = (100, 116, 135)
C_BORDER  = (226, 232, 240)
C_WHITE   = (255, 255, 255)

class BNIPdf(FPDF):
    def __init__(self):
        super().__init__(orientation="P", unit="mm", format="A4")
        self.set_margins(16, 16, 16)
        self.set_auto_page_break(auto=True, margin=16)
        self.add_font("Sarabun",  "",  FONT_REGULAR, uni=True)
        self.add_font("Sarabun",  "B", FONT_BOLD,    uni=True)
        self.add_font("Sarabun",  "I", FONT_ITALIC,  uni=True)
        self.add_font("Sarabun",  "BI",FONT_BOLD,    uni=True)
        self.set_font("Sarabun", size=12)

    def header(self):
        if self.page_no() == 1:
            return
        self.set_font("Sarabun", "B", 8)
        self.set_text_color(*C_MUTED)
        self.cell(0, 8, "BNI IDEAL Mentor System · คู่มือใช้งาน v3.0", align="L")
        self.set_text_color(*C_TEXT)
        self.ln(0)
        self.set_draw_color(*C_BORDER)
        self.line(16, self.get_y(), 194, self.get_y())
        self.ln(3)

    def footer(self):
        self.set_y(-13)
        self.set_draw_color(*C_BORDER)
        self.line(16, self.get_y(), 194, self.get_y())
        self.ln(1)
        self.set_font("Sarabun", "", 8)
        self.set_text_color(*C_MUTED)
        self.cell(0, 6, f"หน้า {self.page_no()}", align="C")

    def cover_page(self):
        self.add_page()
        # Navy banner
        self.set_fill_color(*C_BG)
        self.rect(0, 0, 210, 80, "F")
        # Gold accent line
        self.set_fill_color(*C_GOLD)
        self.rect(0, 75, 210, 5, "F")
        # Badge
        self.set_y(18)
        self.set_font("Sarabun", "B", 9)
        self.set_text_color(*C_BG)
        self.set_fill_color(*C_GOLD)
        badge_txt = "  BNI IDEAL · MENTOR SYSTEM 2026  "
        badge_w = self.get_string_width(badge_txt) + 2
        self.set_x((210 - badge_w) / 2)
        self.cell(badge_w, 6, badge_txt, fill=True, border=0, align="C")
        # Title
        self.ln(6)
        self.set_font("Sarabun", "B", 28)
        self.set_text_color(*C_GOLD)
        self.cell(0, 12, "คู่มือใช้งาน", align="C")
        self.ln(10)
        self.set_font("Sarabun", "B", 22)
        self.set_text_color(*C_WHITE)
        self.cell(0, 10, "BNI IDEAL Mentor System", align="C")
        # Subtitle
        self.ln(10)
        self.set_font("Sarabun", "", 12)
        self.set_text_color(148, 163, 184)
        self.cell(0, 6, "เวอร์ชัน v3.0  ·  อัปเดต พฤษภาคม 2026", align="C")
        self.ln(5)
        self.cell(0, 6, "สำหรับ Mentor  ·  Growth Coordinator  ·  สมาชิก BNI IDEAL Chapter", align="C")
        # Body area
        self.ln(20)
        self.set_text_color(*C_TEXT)

    def h1(self, text):
        self.ln(4)
        self.set_font("Sarabun", "B", 16)
        self.set_text_color(*C_BLUE)
        self.cell(0, 8, text, ln=True)
        # Gold underline
        self.set_draw_color(*C_GOLD)
        self.set_line_width(0.6)
        x = self.get_x()
        y = self.get_y()
        self.line(x, y, x + 178, y)
        self.set_line_width(0.2)
        self.ln(3)
        self.set_text_color(*C_TEXT)

    def h2(self, text):
        self.ln(3)
        self.set_fill_color(*C_LBLUE)
        self.set_draw_color(59, 130, 246)
        self.set_line_width(0.8)
        # Left accent bar
        self.set_fill_color(59, 130, 246)
        self.rect(16, self.get_y(), 1.2, 8, "F")
        self.set_fill_color(*C_LBLUE)
        self.rect(17.2, self.get_y(), 176.8, 8, "F")
        self.set_font("Sarabun", "B", 13)
        self.set_text_color(*C_BLUE)
        self.set_x(20)
        self.cell(174, 8, text, ln=True)
        self.set_line_width(0.2)
        self.ln(2)
        self.set_text_color(*C_TEXT)

    def h3(self, text):
        self.ln(2)
        self.set_fill_color(247, 250, 252)
        self.set_fill_color(255, 251, 235)
        # Gold left bar
        self.set_fill_color(*C_GOLD)
        self.rect(16, self.get_y(), 1, 7, "F")
        self.set_fill_color(247, 250, 252)
        self.rect(17, self.get_y(), 177, 7, "F")
        self.set_font("Sarabun", "B", 12)
        self.set_text_color(45, 55, 72)
        self.set_x(19)
        self.cell(175, 7, text, ln=True)
        self.ln(1)
        self.set_text_color(*C_TEXT)

    def hr(self):
        self.ln(2)
        self.set_draw_color(*C_BORDER)
        self.line(16, self.get_y(), 194, self.get_y())
        self.ln(4)

    def para(self, text, size=12, bold=False, italic=False, color=None, indent=0):
        style = "B" if bold else ("I" if italic else "")
        self.set_font("Sarabun", style, size)
        self.set_text_color(*(color or C_TEXT))
        self.set_x(16 + indent)
        self.multi_cell(178 - indent, 6.5, text)
        self.set_text_color(*C_TEXT)

    def bullet(self, text, level=0, num=None):
        self.set_font("Sarabun", "", 11.5)
        self.set_text_color(*C_TEXT)
        indent = 5 + level * 5
        bullet_char = "•" if num is None else f"{num}."
        self.set_x(16 + indent)
        # bullet
        self.set_font("Sarabun", "B", 11.5)
        bw = self.get_string_width(bullet_char + "  ")
        self.cell(bw, 6.5, bullet_char + " ", ln=False)
        # text
        self.set_font("Sarabun", "", 11.5)
        self.multi_cell(178 - indent - bw, 6.5, text)

    def blockquote(self, text):
        self.ln(1)
        h = max(10, len(text) // 55 * 6 + 12)
        # Gold bar
        self.set_fill_color(*C_GOLD)
        self.rect(16, self.get_y(), 1.2, h, "F")
        # Yellow bg
        self.set_fill_color(*C_LYELLOW)
        self.rect(17.2, self.get_y(), 176.8, h, "F")
        self.set_font("Sarabun", "I", 11)
        self.set_text_color(120, 53, 15)
        self.set_x(20)
        self.multi_cell(174, 6, text)
        self.set_text_color(*C_TEXT)
        self.ln(2)

    def table(self, headers, rows):
        self.ln(2)
        col_count = len(headers)
        # Detect wide columns
        widths = []
        for i, h in enumerate(headers):
            max_len = max([len(str(r[i])) for r in rows] + [len(h)]) if rows else len(h)
            widths.append(max_len)
        total = sum(widths)
        avail = 178
        col_widths = [max(20, int(w / total * avail)) for w in widths]
        diff = avail - sum(col_widths)
        col_widths[-1] += diff

        # Header
        self.set_fill_color(*C_BLUE)
        self.set_text_color(*C_WHITE)
        self.set_font("Sarabun", "B", 10)
        for j, (h, w) in enumerate(zip(headers, col_widths)):
            self.set_x(16 + sum(col_widths[:j]))
            self.cell(w, 7, h, border=0, fill=True)
        self.ln()

        # Rows
        self.set_font("Sarabun", "", 10.5)
        for ri, row in enumerate(rows):
            fill = ri % 2 == 1
            if fill:
                self.set_fill_color(*C_LGRAY)
            else:
                self.set_fill_color(*C_WHITE)
            self.set_text_color(*C_TEXT)
            # compute row height
            max_lines = 1
            for j, (cell, w) in enumerate(zip(row, col_widths)):
                n = max(1, len(str(cell)) // max(1, int(w / 3)) + 1)
                max_lines = max(max_lines, n)
            row_h = max(6, min(max_lines * 5.5, 18))
            # draw cells
            y0 = self.get_y()
            for j, (cell, w) in enumerate(zip(row, col_widths)):
                self.set_xy(16 + sum(col_widths[:j]), y0)
                self.set_fill_color(*C_LGRAY if fill else C_WHITE)
                self.multi_cell(w, row_h / max(1, max_lines), str(cell), border=0, fill=True)
            self.set_y(y0 + row_h)
            # bottom border
            self.set_draw_color(*C_BORDER)
            self.line(16, self.get_y(), 194, self.get_y())
        self.ln(3)
        self.set_text_color(*C_TEXT)


EMOJI_MAP = {
    # Roles / People
    "👥": "[สมาชิก]", "👶": "[NM]", "🤖": "[MC]", "🛡️": "[Mentor]",
    "📈": "[Growth]", "🏆": "[Top]", "👤": "[คน]",
    # Status
    "🟢": "[เขียว]", "🟡": "[เหลือง]", "🔴": "[แดง]", "⚫": "[ดำ]", "🔵": "[น้ำเงิน]",
    "✅": "[OK]", "❌": "[X]", "⚠️": "[!]", "🚨": "[ด่วน]",
    # Actions / Tabs
    "📊": "[Dashboard]", "📝": "[รายงาน]", "💳": "[Renewal]",
    "💬": "[Messages]", "💡": "[Coach]", "📋": "[Tasks]",
    "📢": "[Broadcast]", "📌": "[งาน]", "⚡": "[Actions]",
    "🤝": "[1-2-1]", "💪": "[Power Team]", "🎯": "[Task]",
    "📅": "[ตาราง]", "🔔": "[แจ้งเตือน]", "💾": "[บันทึก]",
    "🔗": "[Matching]", "🔄": "[Refresh]",
    # Money
    "💚": "[Given]", "💙": "[Received]",
    # Misc
    "⏳": "[โหลด...]", "🔍": "[ค้นหา]",
    # Arrows / symbols (keep as text)
    "→": "->", "←": "<-", "↑": "^", "↓": "v",
}

def replace_emoji(text):
    for emoji, replacement in EMOJI_MAP.items():
        text = text.replace(emoji, replacement)
    # Remove any remaining emoji (U+1F000–U+1FFFF range and others)
    text = re.sub(r'[\U00010000-\U0010FFFF]', '', text)
    text = re.sub(r'[☀-➿]', '', text)   # misc symbols
    return text

def strip_inline(text):
    """Remove markdown inline markup and unsupported emoji."""
    text = re.sub(r'\*\*(.+?)\*\*', r'\1', text)
    text = re.sub(r'\*(.+?)\*',     r'\1', text)
    text = re.sub(r'`(.+?)`',       r'\1', text)
    text = re.sub(r'\[(.+?)\]\(.+?\)', r'\1', text)
    text = replace_emoji(text)
    return text


def build_pdf(lines, pdf):
    pdf.cover_page()
    pdf.add_page()

    in_table = False
    table_headers = []
    table_rows = []
    in_blockquote = False
    bq_lines = []
    list_counter = 0

    def flush_table():
        nonlocal in_table, table_headers, table_rows
        if in_table:
            pdf.table(table_headers, table_rows)
        in_table = False; table_headers = []; table_rows = []

    def flush_bq():
        nonlocal in_blockquote, bq_lines
        if in_blockquote and bq_lines:
            pdf.blockquote(" ".join(bq_lines))
        in_blockquote = False; bq_lines = []

    for line in lines:
        # Blockquote
        if line.startswith("> "):
            flush_table()
            in_blockquote = True
            bq_lines.append(strip_inline(line[2:]))
            continue
        else:
            flush_bq()

        # Table
        if "|" in line and line.strip().startswith("|"):
            if not in_table:
                cells = [c.strip() for c in line.strip().strip("|").split("|")]
                table_headers = [strip_inline(c) for c in cells]
                in_table = True
            else:
                if re.match(r'^[\|\s\-:]+$', line):
                    continue  # separator
                cells = [strip_inline(c.strip()) for c in line.strip().strip("|").split("|")]
                table_rows.append(cells)
            continue
        else:
            flush_table()

        stripped = line.strip()

        if stripped.startswith("### "):
            pdf.h3(strip_inline(stripped[4:]))
        elif stripped.startswith("## "):
            pdf.h2(strip_inline(stripped[3:]))
        elif stripped.startswith("# "):
            pdf.h1(strip_inline(stripped[2:]))
        elif stripped == "---":
            pdf.hr()
        elif stripped.startswith("- ") or stripped.startswith("* "):
            list_counter = 0
            pdf.bullet(strip_inline(stripped[2:]))
        elif re.match(r'^\d+\. ', stripped):
            list_counter += 1
            pdf.bullet(strip_inline(re.sub(r'^\d+\. ', '', stripped)), num=list_counter)
        elif stripped == "":
            pdf.ln(2)
        else:
            # Bold headings inline
            is_bold = stripped.startswith("**") and stripped.endswith("**")
            txt = strip_inline(stripped)
            pdf.para(txt, bold=is_bold)

    flush_table()
    flush_bq()


pdf = BNIPdf()
build_pdf(md_lines, pdf)
pdf.output(pdf_path)
print(f"✅  PDF saved → {pdf_path}")
