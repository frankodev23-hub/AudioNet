import io
from datetime import datetime
from xml.sax.saxutils import escape

from docx import Document
from docx.enum.text import WD_ALIGN_PARAGRAPH
from docx.shared import Inches, Pt
from docx.oxml import OxmlElement
from docx.oxml.ns import qn

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_JUSTIFY
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib.units import inch
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer


DOCUMENT_TYPES = {
    "standard", "academic", "song", "poem", "speech",
    "sermon", "interview", "meeting", "judicial"
}

PROFILES = {
    "standard": ("Arial", 11, 1.35, False),
    "academic": ("Times New Roman", 12, 2.0, True),
    "song": ("Arial", 12, 1.5, False),
    "poem": ("Georgia", 12, 1.7, False),
    "speech": ("Arial", 12, 1.5, False),
    "sermon": ("Georgia", 12, 1.5, False),
    "interview": ("Arial", 11, 1.35, False),
    "meeting": ("Arial", 11, 1.35, False),
    "judicial": ("Times New Roman", 12, 1.5, True),
}


def format_time(seconds):
    seconds = int(seconds or 0)
    return f"{seconds // 3600:02}:{(seconds % 3600) // 60:02}:{seconds % 60:02}"


def get_transcription_text(transcription, include_timestamps=False):
    text = (transcription.get("transcript_text") or "").strip()
    segments = transcription.get("segments") or []
    original = " ".join((s.get("text") or "").strip() for s in segments).strip()

    # Si el texto fue editado, se conserva la versión del usuario.
    if text and original and text != original:
        return text

    if include_timestamps and segments:
        return "\n".join(
            f"[{format_time(s.get('start_time', s.get('start', 0)))}] {(s.get('text') or '').strip()}"
            for s in segments if (s.get("text") or "").strip()
        )
    return text


def _kind(options):
    value = str(options.get("document_type") or "standard").strip().lower()
    return value if value in DOCUMENT_TYPES else "standard"


def _judicial_fields(options):
    fields = [
        ("País", "country"),
        ("Jurisdicción", "jurisdiction"),
        ("Tribunal / juzgado", "court"),
        ("Expediente / causa", "case_number"),
        ("Tipo de procedimiento", "proceeding_type"),
        ("Partes", "parties"),
        ("Juez / magistrado", "judge"),
        ("Fiscal", "prosecutor"),
        ("Abogados / defensores", "attorneys"),
        ("Secretario / funcionario", "clerk"),
        ("Fecha de audiencia", "hearing_date"),
        ("Lugar de audiencia", "hearing_location"),
        ("Número de audiencia / sesión", "hearing_number"),
        ("Transcriptor", "transcriber"),
    ]
    return [(label, str(options.get(key) or "").strip())
            for label, key in fields if str(options.get(key) or "").strip()]


def _metadata(transcription, options):
    result = []
    for key in ("header", "title", "subtitle"):
        if options.get(key):
            result.append(str(options[key]))
    if options.get("author"):
        result.append(f"Autor: {options['author']}")
    if options.get("include_date", True):
        result.append(datetime.now().strftime("%d/%m/%Y %H:%M"))
    if options.get("include_audio_info", True):
        result.append(f"Archivo de audio: {transcription.get('filename', '')}")
    return result


def generate_txt(transcription, options):
    kind = _kind(options)
    lines = _metadata(transcription, options)

    if kind == "judicial":
        fields = _judicial_fields(options)
        if fields:
            lines += ["", "DATOS DE IDENTIFICACIÓN"]
            lines += [f"{label}: {value}" for label, value in fields]
        people = [str(x).strip() for x in (options.get("participants") or []) if str(x).strip()]
        if people:
            lines += ["", "PARTICIPANTES"] + [f"- {x}" for x in people]

    lines += ["", "TRANSCRIPCIÓN", ""]
    text = get_transcription_text(transcription, options.get("include_timestamps", False))
    if kind == "judicial" and options.get("include_line_numbers"):
        lines += [f"{i:04d}  {line}" for i, line in enumerate(text.splitlines(), 1)]
    else:
        # Canciones y poemas conservan sus saltos de línea y estrofas.
        lines.append(text)

    if kind == "judicial":
        lines += [
            "", "FIN DE LA TRANSCRIPCIÓN",
            "Documento generado a partir de una grabación; no constituye por sí mismo una transcripción oficial o certificada."
        ]
    return "\n".join(lines).encode("utf-8")


def _page_field(paragraph):
    run = paragraph.add_run()
    begin = OxmlElement("w:fldChar")
    begin.set(qn("w:fldCharType"), "begin")
    instr = OxmlElement("w:instrText")
    instr.set(qn("xml:space"), "preserve")
    instr.text = " PAGE "
    end = OxmlElement("w:fldChar")
    end.set(qn("w:fldCharType"), "end")
    run._r.append(begin)
    run._r.append(instr)
    run._r.append(end)


def generate_docx(transcription, options):
    document = Document()
    kind = _kind(options)
    font, size, spacing, justified = PROFILES[kind]
    section = document.sections[0]
    margin = 0.85 if kind in {"academic", "judicial"} else 0.75
    section.top_margin = section.bottom_margin = Inches(margin)
    section.left_margin = section.right_margin = Inches(margin)

    if options.get("include_page_numbers", True):
        footer = section.footer.paragraphs[0]
        footer.alignment = WD_ALIGN_PARAGRAPH.CENTER
        footer.add_run("Página ")
        _page_field(footer)

    for item in _metadata(transcription, options):
        p = document.add_paragraph()
        p.alignment = WD_ALIGN_PARAGRAPH.CENTER
        r = p.add_run(item)
        if item == options.get("title"):
            r.bold = True
            r.font.size = Pt(20)

    if kind == "judicial":
        fields = _judicial_fields(options)
        if fields:
            document.add_heading("Datos de identificación", level=1)
            for label, value in fields:
                p = document.add_paragraph()
                p.add_run(f"{label}: ").bold = True
                p.add_run(value)
        people = [str(x).strip() for x in (options.get("participants") or []) if str(x).strip()]
        if people:
            document.add_heading("Participantes", level=1)
            for person in people:
                document.add_paragraph(person, style="List Bullet")
        if options.get("include_participant_index") and people:
            document.add_heading("Índice de participantes", level=1)
            for person in people:
                document.add_paragraph(person)
        document.add_heading("Transcripción de la audiencia", level=1)

    normal = document.styles["Normal"]
    normal.font.name = font
    normal.font.size = Pt(size)
    normal.paragraph_format.line_spacing = spacing
    normal.paragraph_format.space_after = Pt(6)

    text = get_transcription_text(transcription, options.get("include_timestamps", False))
    if kind == "judicial" and options.get("include_line_numbers"):
        for number, line in enumerate(text.splitlines(), 1):
            p = document.add_paragraph()
            p.add_run(f"{number:04d}  ").bold = True
            p.add_run(line)
            if justified:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
    else:
        for line in text.splitlines():
            p = document.add_paragraph(line)
            if justified:
                p.alignment = WD_ALIGN_PARAGRAPH.JUSTIFY
            if kind == "academic":
                p.paragraph_format.first_line_indent = Inches(0.5)
            elif kind == "poem":
                p.paragraph_format.left_indent = Inches(0.5)

    if kind == "judicial":
        p = document.add_paragraph()
        p.paragraph_format.space_before = Pt(16)
        p.add_run("Fin de la transcripción.").italic = True
        note = document.add_paragraph(
            "Documento generado a partir de una grabación. No constituye por sí mismo una transcripción oficial o certificada."
        )
        for run in note.runs:
            run.italic = True
            run.font.size = Pt(9)

    output = io.BytesIO()
    document.save(output)
    return output.getvalue()


def _pdf_page_number(canvas, doc):
    canvas.saveState()
    canvas.setFont("Helvetica", 9)
    canvas.setFillColor(colors.grey)
    canvas.drawCentredString(letter[0] / 2, 0.4 * inch, f"Página {doc.page}")
    canvas.restoreState()


def generate_pdf(transcription, options):
    output = io.BytesIO()
    kind = _kind(options)
    font, size, spacing, justified = PROFILES[kind]
    margin = 0.85 if kind in {"academic", "judicial"} else 0.75
    doc = SimpleDocTemplate(
        output, pagesize=letter,
        leftMargin=margin * inch, rightMargin=margin * inch,
        topMargin=margin * inch, bottomMargin=0.7 * inch
    )

    styles = getSampleStyleSheet()
    title_style = ParagraphStyle(
        "AudioNetTitle", parent=styles["Title"], alignment=TA_CENTER,
        fontSize=19, leading=23, spaceAfter=10
    )
    center_style = ParagraphStyle(
        "AudioNetCenter", parent=styles["Normal"], alignment=TA_CENTER,
        fontSize=10, leading=14, spaceAfter=6
    )
    body_style = ParagraphStyle(
        "AudioNetBody", parent=styles["BodyText"],
        fontName="Times-Roman" if kind in {"academic", "judicial"} else "Helvetica",
        fontSize=size, leading=size * spacing,
        alignment=TA_JUSTIFY if justified else TA_LEFT, spaceAfter=7
    )
    heading_style = ParagraphStyle(
        "AudioNetHeading", parent=styles["Heading2"],
        fontSize=12, leading=15, textColor=colors.HexColor("#203864"),
        spaceBefore=10, spaceAfter=6
    )
    small_style = ParagraphStyle(
        "AudioNetSmall", parent=styles["Normal"],
        fontSize=8, leading=11, textColor=colors.grey
    )

    elements = []
    for item in _metadata(transcription, options):
        style = title_style if item == options.get("title") else center_style
        elements.append(Paragraph(escape(item), style))

    if kind == "judicial":
        fields = _judicial_fields(options)
        if fields:
            elements.append(Paragraph("DATOS DE IDENTIFICACIÓN", heading_style))
            for label, value in fields:
                elements.append(Paragraph(f"<b>{escape(label)}:</b> {escape(value)}", body_style))
        people = [str(x).strip() for x in (options.get("participants") or []) if str(x).strip()]
        if people:
            elements.append(Paragraph("PARTICIPANTES", heading_style))
            for person in people:
                elements.append(Paragraph(f"• {escape(person)}", body_style))
        if options.get("include_participant_index") and people:
            elements.append(Paragraph("ÍNDICE DE PARTICIPANTES", heading_style))
            for person in people:
                elements.append(Paragraph(escape(person), body_style))
        elements.append(Paragraph("TRANSCRIPCIÓN DE LA AUDIENCIA", heading_style))
    else:
        elements.append(Spacer(1, 12))

    text = get_transcription_text(transcription, options.get("include_timestamps", False))
    if kind == "judicial" and options.get("include_line_numbers"):
        for number, line in enumerate(text.splitlines(), 1):
            safe = escape(line) if line else "&#160;"
            elements.append(Paragraph(f"<font size='8' color='#666666'>{number:04d}</font>  {safe}", body_style))
    else:
        for line in text.splitlines():
            elements.append(Paragraph(escape(line) if line else "&#160;", body_style))

    if kind == "judicial":
        elements.append(Spacer(1, 12))
        elements.append(Paragraph("<i>Fin de la transcripción.</i>", body_style))
        elements.append(Paragraph(
            "<i>Documento generado a partir de una grabación. No constituye por sí mismo una transcripción oficial o certificada.</i>",
            small_style
        ))

    if options.get("include_page_numbers", True):
        doc.build(elements, onFirstPage=_pdf_page_number, onLaterPages=_pdf_page_number)
    else:
        doc.build(elements)
    return output.getvalue()
