import io
from datetime import datetime

from docx import Document
from docx.shared import Inches, Pt
from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.enums import TA_CENTER
from reportlab.lib.units import inch
from reportlab.platypus import (
    SimpleDocTemplate,
    Paragraph,
    Spacer,
    PageBreak
)
from xml.sax.saxutils import escape


def format_time(seconds):
    seconds = int(seconds or 0)

    hours = seconds // 3600
    minutes = (seconds % 3600) // 60
    secs = seconds % 60

    return f"{hours:02}:{minutes:02}:{secs:02}"


def get_transcription_text(transcription, include_timestamps=False):

    segments = transcription.get("segments", [])

    if include_timestamps and segments:
        lines = []

        for segment in segments:
            timestamp = format_time(
                segment.get("start_time", segment.get("start", 0))
            )
            text = segment.get("text", "").strip()

            lines.append(f"[{timestamp}] {text}")

        return "\n\n".join(lines)

    return transcription.get("transcript_text", "")


def generate_txt(transcription, options):

    title = options.get("title", "Transcripcion")
    header = options.get("header", "")
    subtitle = options.get("subtitle", "")

    text = get_transcription_text(
        transcription,
        options.get("include_timestamps", False)
    )

    lines = []

    if header:
        lines.append(header)

    if title:
        lines.append(title)

    if subtitle:
        lines.append(subtitle)

    if options.get("include_date", True):
        lines.append(
            datetime.now().strftime("%d/%m/%Y %H:%M")
        )

    lines.append("")

    if options.get("include_audio_info", True):
        lines.append(
            f"Archivo: {transcription.get('filename', '')}"
        )
        lines.append("")

    lines.append(text)

    return "\n".join(lines).encode("utf-8")


def generate_docx(transcription, options):

    document = Document()

    section = document.sections[0]
    section.top_margin = Inches(0.8)
    section.bottom_margin = Inches(0.8)

    title = options.get("title", "Transcripcion")
    header = options.get("header", "")
    subtitle = options.get("subtitle", "")

    if header:
        paragraph = document.add_paragraph()
        paragraph.alignment = 1
        run = paragraph.add_run(header)
        run.bold = True
        run.font.size = Pt(11)

    if title:
        paragraph = document.add_heading(title, level=0)
        paragraph.alignment = 1

    if subtitle:
        paragraph = document.add_paragraph(subtitle)
        paragraph.alignment = 1

    if options.get("include_date", True):
        paragraph = document.add_paragraph(
            datetime.now().strftime("%d/%m/%Y %H:%M")
        )
        paragraph.alignment = 1

    if options.get("include_audio_info", True):
        document.add_paragraph(
            f"Archivo: {transcription.get('filename', '')}"
        )

    document.add_paragraph("")

    text = get_transcription_text(
        transcription,
        options.get("include_timestamps", False)
    )

    for paragraph_text in text.split("\n"):
        document.add_paragraph(paragraph_text)

    buffer = io.BytesIO()
    document.save(buffer)

    return buffer.getvalue()


def generate_pdf(transcription, options):

    buffer = io.BytesIO()

    document = SimpleDocTemplate(
        buffer,
        pagesize=letter,
        rightMargin=0.75 * inch,
        leftMargin=0.75 * inch,
        topMargin=0.75 * inch,
        bottomMargin=0.75 * inch
    )

    styles = getSampleStyleSheet()

    title_style = ParagraphStyle(
        "CustomTitle",
        parent=styles["Title"],
        alignment=TA_CENTER,
        fontSize=20,
        spaceAfter=12
    )

    header_style = ParagraphStyle(
        "CustomHeader",
        parent=styles["Normal"],
        alignment=TA_CENTER,
        fontSize=11,
        spaceAfter=10
    )

    body_style = ParagraphStyle(
        "CustomBody",
        parent=styles["BodyText"],
        fontSize=11,
        leading=16,
        spaceAfter=8
    )

    elements = []

    header = options.get("header", "")
    title = options.get("title", "Transcripcion")
    subtitle = options.get("subtitle", "")

    if header:
        elements.append(
            Paragraph(escape(header), header_style)
        )

    if title:
        elements.append(
            Paragraph(escape(title), title_style)
        )

    if subtitle:
        elements.append(
            Paragraph(escape(subtitle), header_style)
        )

    if options.get("include_date", True):
        date_text = datetime.now().strftime("%d/%m/%Y %H:%M")

        elements.append(
            Paragraph(date_text, header_style)
        )

    if options.get("include_audio_info", True):
        filename = escape(
            transcription.get("filename", "")
        )

        elements.append(
            Paragraph(f"Archivo: {filename}", body_style)
        )

    elements.append(Spacer(1, 15))

    text = get_transcription_text(
        transcription,
        options.get("include_timestamps", False)
    )

    for paragraph_text in text.split("\n"):
        if paragraph_text.strip():
            elements.append(
                Paragraph(
                    escape(paragraph_text),
                    body_style
                )
            )

    document.build(elements)

    return buffer.getvalue()