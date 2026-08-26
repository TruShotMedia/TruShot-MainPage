from pathlib import Path

from reportlab.lib.colors import Color, HexColor
from reportlab.lib.pagesizes import A5
from reportlab.lib.units import mm
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.pdfgen import canvas


ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "output/pdf/trushot-house-13-neighbour-flyer.pdf"
LOGO_WHITE = Path(
    "/Users/johnherholdt/Library/Mobile Documents/com~apple~CloudDocs/"
    "Fearless/TruShot/2026 Rebranded Logo WIDE-w.png"
)
LOGO_GREEN = Path(
    "/Users/johnherholdt/Library/Mobile Documents/com~apple~CloudDocs/"
    "Fearless/TruShot/2026 Rebranded Logo WIDE-g.png"
)

PAGE_W, PAGE_H = A5
GREEN = HexColor("#1f6248")
DEEP_GREEN = HexColor("#0d3f2e")
IVORY = HexColor("#f5f2e9")
INK = HexColor("#101511")
SAGE = HexColor("#a8cfb9")
MUTED = HexColor("#667168")
WHITE = HexColor("#ffffff")

FONT_SANS = "Arial"
FONT_SANS_BOLD = "Arial-Bold"
FONT_SERIF_ITALIC = "Georgia-Italic"


def register_fonts() -> None:
    pdfmetrics.registerFont(
        TTFont(FONT_SANS, "/System/Library/Fonts/Supplemental/Arial.ttf")
    )
    pdfmetrics.registerFont(
        TTFont(FONT_SANS_BOLD, "/System/Library/Fonts/Supplemental/Arial Bold.ttf")
    )
    pdfmetrics.registerFont(
        TTFont(FONT_SERIF_ITALIC, "/System/Library/Fonts/Supplemental/Georgia Italic.ttf")
    )


def wrap_lines(text: str, font: str, size: float, max_width: float) -> list[str]:
    lines: list[str] = []
    for paragraph in text.split("\n"):
        words = paragraph.split()
        if not words:
            lines.append("")
            continue
        line = words[0]
        for word in words[1:]:
            candidate = f"{line} {word}"
            if pdfmetrics.stringWidth(candidate, font, size) <= max_width:
                line = candidate
            else:
                lines.append(line)
                line = word
        lines.append(line)
    return lines


def draw_paragraph(
    c: canvas.Canvas,
    text: str,
    x: float,
    top: float,
    width: float,
    font: str = FONT_SANS,
    size: float = 9.5,
    leading: float = 13,
    color: Color = INK,
) -> float:
    c.setFont(font, size)
    c.setFillColor(color)
    y = top
    for line in wrap_lines(text, font, size, width):
        c.drawString(x, y, line)
        y -= leading
    return y


def draw_tracking_label(
    c: canvas.Canvas,
    text: str,
    x: float,
    y: float,
    size: float = 6.7,
    color: Color = GREEN,
    tracking: float = 1.5,
) -> None:
    c.saveState()
    text_object = c.beginText(x, y)
    text_object.setFont(FONT_SANS_BOLD, size)
    text_object.setFillColor(color)
    text_object.setCharSpace(tracking)
    text_object.textOut(text.upper())
    c.drawText(text_object)
    c.restoreState()


def draw_front(c: canvas.Canvas) -> None:
    c.setFillColor(IVORY)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    # Soft brand geometry.
    c.saveState()
    c.setFillAlpha(0.11)
    c.setFillColor(GREEN)
    c.circle(PAGE_W + 4 * mm, PAGE_H - 20 * mm, 42 * mm, stroke=0, fill=1)
    c.setFillAlpha(0.16)
    c.roundRect(PAGE_W - 40 * mm, PAGE_H - 62 * mm, 58 * mm, 29 * mm, 6 * mm, stroke=0, fill=1)
    c.restoreState()

    margin = 12 * mm
    draw_tracking_label(c, "A note from your new neighbours", margin, PAGE_H - 16 * mm)
    c.setStrokeColor(SAGE)
    c.setLineWidth(1)
    c.line(margin, PAGE_H - 20 * mm, margin + 31 * mm, PAGE_H - 20 * mm)

    c.setFillColor(INK)
    c.setFont(FONT_SANS_BOLD, 40)
    c.drawString(margin, PAGE_H - 50 * mm, "HELLO,")
    c.setFillColor(GREEN)
    c.setFont(FONT_SANS_BOLD, 38)
    c.drawString(margin, PAGE_H - 66 * mm, "HOUSE 13.")
    c.setFillColor(INK)
    c.setFont(FONT_SERIF_ITALIC, 14.5)
    c.drawString(margin, PAGE_H - 78 * mm, "We're John + Isabel - and we're moving in.")

    card_x = margin
    card_y = 68 * mm
    card_w = PAGE_W - 2 * margin
    card_h = 53 * mm
    c.setFillColor(GREEN)
    c.roundRect(card_x, card_y, card_w, card_h, 5 * mm, stroke=0, fill=1)

    draw_tracking_label(c, "Tuesday 1 September 2026  /  around 9:00am", card_x + 8 * mm, card_y + card_h - 10 * mm, color=SAGE)
    c.setFillColor(WHITE)
    c.setFont(FONT_SANS_BOLD, 17)
    c.drawString(card_x + 8 * mm, card_y + card_h - 21 * mm, "MOVING DAY NOTICE")
    draw_paragraph(
        c,
        "A moving truck will arrive while we unload. It may briefly block the space directly in front of House 13 for around one to two hours.",
        card_x + 8 * mm,
        card_y + card_h - 31 * mm,
        card_w - 16 * mm,
        size=8.7,
        leading=11.5,
        color=WHITE,
    )

    draw_paragraph(
        c,
        "We're sorry for any inconvenience and wanted to give everyone plenty of notice. We're very excited to join this little community and begin this new chapter. We'll come around to introduce ourselves once we're settled in.",
        margin,
        59 * mm,
        PAGE_W - 2 * margin,
        size=9.1,
        leading=12.5,
        color=MUTED,
    )

    contact_y = 12 * mm
    contact_h = 25 * mm
    c.setFillColor(WHITE)
    c.roundRect(margin, contact_y, PAGE_W - 2 * margin, contact_h, 4 * mm, stroke=0, fill=1)
    draw_tracking_label(c, "Need to reach us?", margin + 7 * mm, contact_y + 17 * mm)
    c.setFillColor(INK)
    c.setFont(FONT_SANS_BOLD, 13)
    c.drawString(margin + 7 * mm, contact_y + 8 * mm, "John  /  04XX XXX XXX")
    c.setFillColor(GREEN)
    c.circle(PAGE_W - margin - 11 * mm, contact_y + 12.5 * mm, 6 * mm, stroke=0, fill=1)
    c.setFillColor(WHITE)
    c.setFont(FONT_SANS_BOLD, 8)
    c.drawCentredString(PAGE_W - margin - 11 * mm, contact_y + 11.2 * mm, "13")


def draw_person_card(c: canvas.Canvas, x: float, y: float, width: float, name: str, copy: str) -> None:
    c.setFillColor(Color(1, 1, 1, alpha=0.08))
    c.setStrokeColor(Color(1, 1, 1, alpha=0.18))
    c.setLineWidth(0.6)
    c.roundRect(x, y, width, 43 * mm, 4 * mm, stroke=1, fill=1)
    c.setFillColor(SAGE)
    c.setFont(FONT_SANS_BOLD, 15)
    c.drawString(x + 6 * mm, y + 30 * mm, name.upper())
    draw_paragraph(c, copy, x + 6 * mm, y + 22 * mm, width - 12 * mm, size=7.8, leading=10.2, color=WHITE)


def draw_back(c: canvas.Canvas) -> None:
    c.setFillColor(DEEP_GREEN)
    c.rect(0, 0, PAGE_W, PAGE_H, stroke=0, fill=1)

    c.saveState()
    c.setFillAlpha(0.045)
    c.setFillColor(SAGE)
    c.circle(-19 * mm, PAGE_H + 5 * mm, 38 * mm, stroke=0, fill=1)
    c.setStrokeAlpha(0.25)
    c.setStrokeColor(SAGE)
    c.setLineWidth(0.8)
    c.circle(PAGE_W - 5 * mm, PAGE_H - 43 * mm, 38 * mm, stroke=1, fill=0)
    c.restoreState()

    margin = 12 * mm
    draw_tracking_label(c, "The people behind the boxes", margin, PAGE_H - 16 * mm, color=WHITE)
    c.setFillColor(WHITE)
    c.setFont(FONT_SANS_BOLD, 33)
    c.drawString(margin, PAGE_H - 41 * mm, "A LITTLE")
    c.setFont(FONT_SERIF_ITALIC, 35)
    c.setFillColor(SAGE)
    c.drawString(margin, PAGE_H - 56 * mm, "about us.")

    draw_paragraph(
        c,
        "We're John and Isabel, and we're excited to make House 13 home. We're looking forward to meeting the people around us, becoming part of the neighbourhood and sharing this new chapter together. Please feel free to say hello whenever you see us.",
        margin,
        PAGE_H - 68 * mm,
        PAGE_W - 2 * margin,
        size=8.9,
        leading=12,
        color=WHITE,
    )

    gap = 4 * mm
    card_w = (PAGE_W - 2 * margin - gap) / 2
    draw_person_card(
        c,
        margin,
        74 * mm,
        card_w,
        "John",
        "A creative filmmaker and founder of TruShot Media. Usually thinking about stories, cameras and the next idea.",
    )
    draw_person_card(
        c,
        margin + card_w + gap,
        74 * mm,
        card_w,
        "Isabel",
        "Equally excited for the move, the new neighbourhood and all the little moments that make a place feel like home.",
    )

    footer_x = margin
    footer_y = 12 * mm
    footer_w = PAGE_W - 2 * margin
    footer_h = 49 * mm
    c.setFillColor(IVORY)
    c.roundRect(footer_x, footer_y, footer_w, footer_h, 5 * mm, stroke=0, fill=1)

    # The transparent source includes safe whitespace; this placement preserves its proportions.
    c.drawImage(
        str(LOGO_GREEN),
        footer_x + 3 * mm,
        footer_y + 20 * mm,
        width=55 * mm,
        height=20.5 * mm,
        preserveAspectRatio=True,
        mask="auto",
    )
    c.setFillColor(INK)
    c.setFont(FONT_SANS_BOLD, 10.5)
    c.drawString(footer_x + 61 * mm, footer_y + 34 * mm, "MAKE WORK WORTH")
    c.setFillColor(GREEN)
    c.setFont(FONT_SERIF_ITALIC, 15)
    c.drawString(footer_x + 61 * mm, footer_y + 26 * mm, "watching.")
    draw_tracking_label(c, "Strategy  /  content  /  campaigns", footer_x + 7 * mm, footer_y + 11 * mm, size=6.2)
    c.setFillColor(GREEN)
    c.setFont(FONT_SANS_BOLD, 7.8)
    c.drawRightString(footer_x + footer_w - 7 * mm, footer_y + 10.5 * mm, "trushotmedia.com")


def main() -> None:
    register_fonts()
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    pdf = canvas.Canvas(str(OUTPUT), pagesize=A5, pageCompression=1)
    pdf.setTitle("House 13 - A note from John and Isabel")
    pdf.setAuthor("John and Isabel")
    pdf.setSubject("Moving day notice for our neighbours")
    draw_front(pdf)
    pdf.showPage()
    draw_back(pdf)
    pdf.save()
    print(OUTPUT)


if __name__ == "__main__":
    main()
