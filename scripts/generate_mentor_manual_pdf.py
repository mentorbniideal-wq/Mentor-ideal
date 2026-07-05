#!/usr/bin/env python3
"""Generate the BNI IDEAL Mentor & Growth Playbook PDF."""

import re
from pathlib import Path
from fpdf import FPDF
from PIL import Image

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "คู่มือ_Mentor_Growth_Playbook_2026.md"
OUTPUT = ROOT / "คู่มือ_Mentor_Growth_Playbook_2026.pdf"
FONT_DIR = Path("/Users/tfenice/Library/Fonts")


def clean(text: str) -> str:
    text = re.sub(r"\*\*(.*?)\*\*", r"\1", text)
    text = re.sub(r"`(.*?)`", r"\1", text)
    return text.replace("→", "ไปยัง").replace("–", "-")


class ManualPDF(FPDF):
    def __init__(self):
        super().__init__("P", "mm", "A4")
        self.decorative_pages = set()
        self.set_margins(17, 17, 17)
        self.set_auto_page_break(True, 17)
        self.add_font("TH", "", str(FONT_DIR / "THSarabunNew.ttf"))
        self.add_font("TH", "B", str(FONT_DIR / "THSarabunNew Bold.ttf"))
        self.set_font("TH", size=13)

    def header(self):
        self.set_fill_color(249, 247, 242)
        self.rect(0, 0, 210, 297, "F")
        if self.page_no() == 1:
            return
        self.set_xy(17, 8)
        self.set_font("TH", "B", 8.5)
        self.set_text_color(25, 28, 26)
        self.cell(88, 5, "BNI IDEAL", align="L")
        self.set_font("TH", "", 8.5)
        self.set_text_color(121, 113, 96)
        self.cell(88, 5, "MENTOR & GROWTH PLAYBOOK · 2026", align="R")
        self.set_draw_color(191, 157, 96)
        self.set_line_width(0.35)
        self.line(17, 15, 193, 15)
        self.set_line_width(0.2)
        self.set_y(19)

    def footer(self):
        if self.page_no() == 1 or self.page_no() in self.decorative_pages:
            return
        self.set_y(-12)
        self.set_draw_color(208, 198, 178)
        self.line(17, self.get_y(), 193, self.get_y())
        self.set_font("TH", "", 9)
        self.set_text_color(121, 113, 96)
        self.cell(88, 7, "BNI IDEAL · BUILT TO BE PASSED ON", align="L")
        self.cell(88, 7, f"{self.page_no():02d}", align="R")

    def cover(self):
        self.add_page()
        # Editorial charcoal canvas
        self.set_fill_color(17, 18, 17)
        self.rect(0, 0, 210, 297, "F")

        # Architectural champagne geometry
        self.set_draw_color(191, 157, 96)
        self.set_line_width(0.3)
        for offset in (0, 10, 20):
            self.line(143 + offset, 0, 210, 67 - offset)
        self.line(0, 247, 50, 297)
        self.set_line_width(0.2)
        self.set_draw_color(66, 65, 60)
        self.ellipse(139, 205, 92, 92, "D")
        self.ellipse(151, 217, 68, 68, "D")
        self.set_fill_color(191, 157, 96)
        self.rect(17, 24, 20, 1.2, "F")

        # Brand lockup
        self.set_xy(17, 31)
        self.set_font("TH", "B", 10)
        self.set_text_color(213, 184, 129)
        self.cell(0, 6, "BNI IDEAL  /  LEADERSHIP SERIES  /  2026")

        # Main editorial title
        self.set_xy(17, 73)
        self.set_font("TH", "B", 34)
        self.set_text_color(246, 242, 233)
        self.cell(0, 13, "MENTOR")
        self.set_xy(17, 99)
        self.cell(0, 13, "& GROWTH")
        self.set_xy(17, 125)
        self.set_text_color(213, 184, 129)
        self.cell(0, 13, "PLAYBOOK")

        self.set_xy(18, 157)
        self.set_font("TH", "B", 17)
        self.set_text_color(246, 242, 233)
        self.multi_cell(118, 8, "คู่มือส่งต่อการดูแลทีม\nและพัฒนาสมาชิก")

        self.set_xy(18, 193)
        self.set_font("TH", "", 11.5)
        self.set_text_color(166, 164, 157)
        self.multi_cell(
            105,
            6.5,
            "A shared operating rhythm for every generation\nof Mentor and Growth leaders.",
        )

        # Edition details
        self.set_xy(17, 259)
        self.set_draw_color(191, 157, 96)
        self.line(17, 254, 91, 254)
        self.set_font("TH", "B", 10)
        self.set_text_color(213, 184, 129)
        self.cell(74, 6, "EDITION 05")
        self.set_font("TH", "", 10)
        self.set_text_color(166, 164, 157)
        self.cell(92, 6, "4 JULY 2026", align="R")
        self.set_xy(17, 274)
        self.set_font("TH", "", 10)
        self.cell(0, 6, "READ THE SIGNAL · GUIDE THE PERSON · GROW THE CHAPTER")

    def part_page(self, number: str, title: str, subtitle: str):
        self.add_page()
        self.decorative_pages.add(self.page_no())
        self.set_fill_color(17, 18, 17)
        self.rect(0, 0, 210, 297, "F")
        self.set_draw_color(191, 157, 96)
        self.set_line_width(0.25)
        self.ellipse(126, 35, 120, 120, "D")
        self.ellipse(147, 56, 78, 78, "D")
        self.line(17, 253, 193, 253)
        self.set_xy(17, 42)
        self.set_font("TH", "B", 10)
        self.set_text_color(213, 184, 129)
        self.cell(0, 6, f"PART {number}")
        self.set_xy(17, 92)
        self.set_font("TH", "B", 34)
        self.set_text_color(246, 242, 233)
        self.multi_cell(155, 14, clean(title))
        self.set_xy(18, 174)
        self.set_font("TH", "", 16)
        self.set_text_color(180, 176, 166)
        self.multi_cell(135, 8, clean(subtitle))
        self.set_xy(17, 263)
        self.set_font("TH", "", 9.5)
        self.set_text_color(213, 184, 129)
        self.cell(0, 6, "BNI IDEAL · MENTOR & GROWTH PLAYBOOK")

    def full_image(self, path: str, caption: str):
        self.add_page()
        self.decorative_pages.add(self.page_no())
        with Image.open(ROOT / path) as image:
            ratio = image.width / image.height
        max_w, max_h = 176, 225
        w = min(max_w, max_h * ratio)
        h = w / ratio
        x = (210 - w) / 2
        y = 25 + (max_h - h) / 2
        self.image(str(ROOT / path), x=x, y=y, w=w, h=h)
        self.set_xy(28, 259)
        self.set_font("TH", "B", 12)
        self.set_text_color(91, 70, 39)
        self.multi_cell(154, 6.5, clean(caption), align="C")

    def editorial_image(self, path: str, caption: str):
        with Image.open(ROOT / path) as image:
            ratio = image.width / image.height
        w = 176
        h = w / ratio
        if self.get_y() + h + 18 > 276:
            self.add_page()
        self.ln(4)
        y = self.get_y()
        self.image(str(ROOT / path), x=17, y=y, w=w, h=h)
        self.set_y(y + h + 4)
        self.set_font("TH", "", 10.5)
        self.set_text_color(121, 113, 96)
        self.multi_cell(176, 5.5, clean(caption), align="C")
        self.ln(4)

    def end_page(self, title: str, body: str, line: str):
        self.add_page()
        self.decorative_pages.add(self.page_no())
        self.set_fill_color(17, 18, 17)
        self.rect(0, 0, 210, 297, "F")
        self.set_draw_color(191, 157, 96)
        self.set_line_width(0.25)
        self.ellipse(-35, 186, 115, 115, "D")
        self.ellipse(-13, 208, 72, 72, "D")
        self.line(17, 38, 55, 38)
        self.set_xy(17, 53)
        self.set_font("TH", "B", 22)
        self.set_text_color(246, 242, 233)
        self.multi_cell(160, 11, clean(title))
        self.set_xy(18, 125)
        self.set_font("TH", "", 15)
        self.set_text_color(180, 176, 166)
        self.multi_cell(145, 8, clean(body))
        self.set_xy(17, 251)
        self.set_font("TH", "B", 10)
        self.set_text_color(213, 184, 129)
        self.cell(0, 6, clean(line))
        self.set_xy(17, 271)
        self.set_font("TH", "", 9.5)
        self.set_text_color(128, 126, 120)
        self.cell(0, 6, "BNI IDEAL · BUILT TO BE PASSED ON")

    def heading(self, text: str, level: int):
        if level == 1:
            return
        self.ln(3)
        self.set_x(17)
        if level == 2:
            chapter = re.match(r"^(\d+)\.", text)
            self.set_font("TH", "B", 9)
            self.set_text_color(191, 157, 96)
            self.cell(13, 6, f"{int(chapter.group(1)):02d}" if chapter else "—")
            self.set_font("TH", "B", 18)
            self.set_text_color(25, 28, 26)
            self.multi_cell(163, 9, clean(text))
            self.set_draw_color(191, 157, 96)
            self.line(17, self.get_y() + 1, 49, self.get_y() + 1)
            self.ln(4)
        else:
            self.set_text_color(91, 70, 39)
            self.set_font("TH", "B", 14)
            self.multi_cell(0, 7, clean(text))
        self.set_text_color(34, 34, 31)
        self.ln(1)

    def paragraph(self, text: str, bold=False):
        if self.get_y() > 268:
            self.add_page()
        self.set_x(17)
        self.set_font("TH", "B" if bold else "", 12.5)
        self.set_text_color(25, 40, 37)
        self.multi_cell(0, 6.3, clean(text))
        self.ln(1)

    def bullet(self, text: str, number: str | None = None):
        # Keep the marker and at least two lines of its text together.
        # Without this guard FPDF may print only "•" or "3." at the page bottom.
        if self.get_y() > 258:
            self.add_page()
        mark = f"{number}." if number else "•"
        self.set_font("TH", "B", 12)
        self.set_text_color(154, 119, 61)
        self.set_x(17)
        x, y = self.get_x(), self.get_y()
        self.cell(8, 6.2, mark)
        self.set_xy(x + 8, y)
        self.set_font("TH", "", 12.5)
        self.set_text_color(34, 34, 31)
        self.multi_cell(168, 6.2, clean(text))

    def quote(self, text: str):
        self.set_x(17)
        self.set_fill_color(239, 233, 220)
        self.set_text_color(82, 62, 32)
        self.set_font("TH", "B", 12.5)
        self.multi_cell(176, 7, clean(text.lstrip("> ").strip()), fill=True)
        self.set_text_color(25, 40, 37)
        self.ln(2)

    def table(self, lines: list[str]):
        rows = [[clean(c.strip()) for c in line.strip().strip("|").split("|")] for line in lines]
        if len(rows) < 2:
            return
        rows = [rows[0]] + rows[2:]
        cols = len(rows[0])
        widths = [176 / cols] * cols
        for ri, row in enumerate(rows):
            self.set_font("TH", "B" if ri == 0 else "", 10.5)
            self.set_fill_color(31, 32, 30) if ri == 0 else self.set_fill_color(242, 238, 229)
            self.set_text_color(225, 202, 158) if ri == 0 else self.set_text_color(34, 34, 31)
            y = self.get_y()
            heights = []
            for ci, cell in enumerate(row):
                lines_needed = max(1, len(cell) // max(8, int(widths[ci] / 2.4)) + 1)
                heights.append(lines_needed * 5.2)
            h = max(7, min(18, max(heights)))
            if y + h > 278:
                self.add_page()
                y = self.get_y()
            for ci, cell in enumerate(row):
                self.set_xy(17 + sum(widths[:ci]), y)
                self.multi_cell(widths[ci], 5.2, cell, border=1, fill=True)
            self.set_y(y + h)
        self.ln(2)


def build():
    lines = SOURCE.read_text(encoding="utf-8").splitlines()
    pdf = ManualPDF()
    pdf.set_title("BNI IDEAL Mentor & Growth Playbook 2026")
    pdf.set_author("BNI IDEAL Chapter")
    pdf.cover()
    pdf.add_page()

    i = 0
    while i < len(lines):
        line = lines[i].rstrip()
        if not line or line == "---":
            i += 1
            continue
        part = re.match(r"^\[PART:([^|]+)\|([^|]+)\|(.+)\]$", line)
        full_image = re.match(r"^\[FULL_IMAGE:([^|]+)\|(.+)\]$", line)
        image = re.match(r"^\[IMAGE:([^|]+)\|(.+)\]$", line)
        end = re.match(r"^\[END:([^|]+)\|([^|]+)\|(.+)\]$", line)
        if end:
            pdf.end_page(end.group(1), end.group(2), end.group(3))
            i += 1
            continue
        elif part:
            pdf.part_page(part.group(1), part.group(2), part.group(3))
            pdf.add_page()
            i += 1
            continue
        elif full_image:
            pdf.full_image(full_image.group(1), full_image.group(2))
            i += 1
            continue
        elif image:
            pdf.editorial_image(image.group(1), image.group(2))
            i += 1
            continue
        elif line.startswith("|"):
            table_lines = []
            while i < len(lines) and lines[i].startswith("|"):
                table_lines.append(lines[i])
                i += 1
            pdf.table(table_lines)
            continue
        m = re.match(r"^(#{1,3})\s+(.*)", line)
        if m:
            pdf.heading(m.group(2), len(m.group(1)))
        elif line.startswith(">"):
            pdf.quote(line)
        elif re.match(r"^\d+\.\s+", line):
            num, text = re.match(r"^(\d+)\.\s+(.*)", line).groups()
            pdf.bullet(text, num)
        elif line.startswith("- ["):
            pdf.bullet(line.replace("- [ ]", "[ ]").replace("- [x]", "[x]"))
        elif line.startswith("- "):
            pdf.bullet(line[2:])
        else:
            pdf.paragraph(line)
        i += 1

    pdf.output(str(OUTPUT))
    print(OUTPUT)


if __name__ == "__main__":
    build()
