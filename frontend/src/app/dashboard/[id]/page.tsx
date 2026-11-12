"use client";

import { useEffect, useState, useRef, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";
import AppHeader from "@/components/AppHeader";

interface Segment {
  id: string;
  segment_order: number;
  start_time: number;
  end_time: number;
  text: string;
}

interface Transcription {
  id: string;
  filename: string;
  status: string;
  language?: string;
  duration?: number;
  transcript_text?: string;
  created_at?: string;
  completed_at?: string;
  processing_time_seconds?: number;
  character_count?: number;
  character_count_no_whitespace?: number;
  word_count?: number;
  paragraph_count?: number;
  segment_count?: number;
  processing_speed?: number;
  segments: Segment[];
}

interface TranscriptionVersion {
  id: string;
  transcription_id: string;
  user_id: string;
  version_number: number;
  transcript_text: string;
  change_type: string;
  created_at: string;
}

interface ExportOptions {
  format: "docx" | "pdf" | "txt";
  document_type:
    | "standard"
    | "academic"
    | "song"
    | "poem"
    | "speech"
    | "sermon"
    | "interview"
    | "meeting"
    | "judicial";
  title: string;
  header: string;
  subtitle: string;
  author: string;
  include_date: boolean;
  include_audio_info: boolean;
  include_timestamps: boolean;
  include_page_numbers: boolean;
  country: string;
  jurisdiction: string;
  court: string;
  case_number: string;
  proceeding_type: string;
  parties: string;
  judge: string;
  prosecutor: string;
  attorneys: string;
  clerk: string;
  hearing_date: string;
  hearing_location: string;
  hearing_number: string;
  transcriber: string;
  participants: string[];
  include_line_numbers: boolean;
  include_participant_index: boolean;
}

const judicialFields: {
  key: keyof ExportOptions;
  label: string;
}[] = [
  { key: "country", label: "País" },
  { key: "jurisdiction", label: "Jurisdicción" },
  { key: "court", label: "Tribunal / juzgado" },
  { key: "case_number", label: "Número de expediente / causa" },
  { key: "proceeding_type", label: "Tipo de procedimiento" },
  { key: "parties", label: "Partes involucradas" },
  { key: "judge", label: "Juez / magistrado" },
  { key: "prosecutor", label: "Fiscal" },
  { key: "attorneys", label: "Abogados / defensores" },
  { key: "clerk", label: "Secretario / funcionario" },
  { key: "hearing_date", label: "Fecha de audiencia" },
  { key: "hearing_location", label: "Lugar de audiencia" },
  { key: "hearing_number", label: "Número de audiencia / sesión" },
  { key: "transcriber", label: "Transcriptor" },
];

const judicialCheckboxes: {
  key: "include_line_numbers" | "include_participant_index";
  label: string;
}[] = [
  {
    key: "include_line_numbers",
    label: "Numerar las líneas de la transcripción",
  },
  {
    key: "include_participant_index",
    label: "Incluir índice de participantes",
  },
];

const inputClass =
  "w-full min-w-0 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-800 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100";

const buttonClass =
  "inline-flex min-h-10 items-center justify-center rounded-lg px-4 py-2.5 text-sm font-semibold transition disabled:cursor-not-allowed disabled:opacity-50";

function TranscriptionContent() {
  const params = useParams();
  const id = params.id as string;

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const { t, locale } = useLanguage();

  const [data, setData] = useState<Transcription | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [editing, setEditing] = useState(false);
  const [editedText, setEditedText] = useState("");
  const [saving, setSaving] = useState(false);

  const [versions, setVersions] = useState<TranscriptionVersion[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [selectedVersion, setSelectedVersion] =
    useState<TranscriptionVersion | null>(null);
  const [compareVersionId, setCompareVersionId] = useState("");
  const [comparison, setComparison] = useState<{
    version_a: TranscriptionVersion;
    version_b: TranscriptionVersion;
  } | null>(null);
  const [restoringVersion, setRestoringVersion] = useState(false);
  const [showVersionContent, setShowVersionContent] = useState(false);

  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [audioUrl, setAudioUrl] = useState("");
  const [currentTime, setCurrentTime] = useState(0);
  const [isAudioLoading, setIsAudioLoading] = useState(false);

  const audioRef = useRef<HTMLAudioElement>(null);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "docx",
    document_type: "standard",
    title: "Transcripción",
    header: "AudioNet",
    subtitle: "",
    author: "",
    include_date: true,
    include_audio_info: true,
    include_timestamps: false,
    include_page_numbers: true,
    country: "",
    jurisdiction: "",
    court: "",
    case_number: "",
    proceeding_type: "",
    parties: "",
    judge: "",
    prosecutor: "",
    attorneys: "",
    clerk: "",
    hearing_date: "",
    hearing_location: "",
    hearing_number: "",
    transcriber: "",
    participants: [],
    include_line_numbers: false,
    include_participant_index: false,
  });

  useEffect(() => {
    setExportOptions((current) => {
      if (
        current.title === "Transcripción" ||
        current.title === "Transcription"
      ) {
        return {
          ...current,
          title: t("Transcripción"),
        };
      }

      return current;
    });
  }, [locale, t]);

  async function loadVersions() {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    setLoadingVersions(true);

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/versions`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("audionet_access_token");
        localStorage.removeItem("audionet_refresh_token");
        window.location.href = "/";
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudo cargar el historial")
        );
      }

      setVersions(Array.isArray(result.versions) ? result.versions : []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error al cargar versiones")
      );
    } finally {
      setLoadingVersions(false);
    }
  }

  useEffect(() => {
    async function loadTranscription() {
      const token = localStorage.getItem("audionet_access_token");

      if (!token) {
        window.location.href = "/";
        return;
      }

      try {
        const response = await fetch(`${API_URL}/transcriptions/${id}`, {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        });

        if (response.status === 401) {
          localStorage.removeItem("audionet_access_token");
          localStorage.removeItem("audionet_refresh_token");
          window.location.href = "/";
          return;
        }

        const result = await response.json();

        if (!response.ok) {
          throw new Error(
            typeof result.detail === "string"
              ? result.detail
              : t("No se pudo cargar la transcripción")
          );
        }

        setData(result);
        setEditedText(result.transcript_text || "");
        await loadVersions();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("Error de conexión")
        );
      } finally {
        setLoading(false);
      }
    }

    loadTranscription();
    // loadVersions is intentionally called after the transcription is loaded.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id, API_URL, t]);

  async function saveTranscription() {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    setSaving(true);
    setError("");

    try {
      const response = await fetch(`${API_URL}/transcriptions/${id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          transcript_text: editedText,
        }),
      });

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudo guardar la transcripción")
        );
      }

      setData((current) =>
        current
          ? {
              ...current,
              transcript_text:
                result.transcription?.transcript_text ?? editedText,
            }
          : current
      );

      setEditedText(
        result.transcription?.transcript_text ?? editedText
      );
      setEditing(false);
      await loadVersions();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Error al guardar la transcripción")
      );
    } finally {
      setSaving(false);
    }
  }

  async function viewVersion(versionId: string) {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/versions/${versionId}`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("audionet_access_token");
        localStorage.removeItem("audionet_refresh_token");
        window.location.href = "/";
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudo consultar la versión")
        );
      }

      setSelectedVersion(result);
      setShowVersionContent(true);
      setComparison(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error al consultar versión")
      );
    }
  }

  async function compareVersions() {
    if (!compareVersionId || versions.length < 2) return;

    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/versions/compare`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            version_a_id: compareVersionId,
            version_b_id: versions[0].id,
          }),
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("audionet_access_token");
        localStorage.removeItem("audionet_refresh_token");
        window.location.href = "/";
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudieron comparar las versiones")
        );
      }

      setComparison(result);
      setShowVersionContent(false);
      setSelectedVersion(null);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error al comparar versiones")
      );
    }
  }

  async function restoreVersion(versionId: string) {
    const confirmed = window.confirm(
      t(
        "¿Restaurar esta versión? El texto actual se conservará en el historial."
      )
    );

    if (!confirmed) return;

    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    setRestoringVersion(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/versions/restore`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            version_id: versionId,
          }),
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("audionet_access_token");
        localStorage.removeItem("audionet_refresh_token");
        window.location.href = "/";
        return;
      }

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudo restaurar la versión")
        );
      }

      const restoredText =
        result.transcription?.transcript_text ??
        result.transcription?.text ??
        "";

      setData((current) =>
        current
          ? {
              ...current,
              transcript_text: restoredText,
            }
          : current
      );

      setEditedText(restoredText);
      setEditing(false);
      setSelectedVersion(null);
      setComparison(null);
      setShowVersionContent(false);

      await loadVersions();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error al restaurar versión")
      );
    } finally {
      setRestoringVersion(false);
    }
  }

  function formatTime(seconds: number) {
    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);
    const milliseconds = Math.floor((seconds % 1) * 100);

    return `${String(minutes).padStart(2, "0")}:${String(
      remaining
    ).padStart(2, "0")}.${String(milliseconds).padStart(2, "0")}`;
  }

  function formatDuration(seconds?: number) {
    if (seconds === undefined || seconds === null) return "--";

    const minutes = Math.floor(seconds / 60);
    const remaining = Math.floor(seconds % 60);

    return `${minutes}${t("m")} ${remaining}${t("s")}`;
  }

  function formatProcessingTime(seconds?: number) {
    if (seconds === undefined || seconds === null) return "--";

    if (seconds < 60) {
      return `${seconds.toFixed(2)} ${t("s")}`;
    }

    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    return `${minutes} ${t("min")} ${remaining.toFixed(2)} ${t("s")}`;
  }

  function formatDateTime(value?: string) {
    if (!value) return "--";

    return new Date(value).toLocaleString(
      locale === "en" ? "en-US" : "es-ES",
      {
        dateStyle: "medium",
        timeStyle: "short",
      }
    );
  }

  function formatNumber(value: number) {
    return value.toLocaleString(locale === "en" ? "en-US" : "es-ES");
  }

  async function getAudioDownloadUrl() {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return null;
    }

    const response = await fetch(
      `${API_URL}/transcriptions/${id}/download`,
      {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      }
    );

    const result = await response.json();

    if (response.status === 401) {
      localStorage.removeItem("audionet_access_token");
      localStorage.removeItem("audionet_refresh_token");
      window.location.href = "/";
      return null;
    }

    if (!response.ok) {
      throw new Error(
        typeof result.detail === "string"
          ? result.detail
          : t("No se pudo cargar el audio")
      );
    }

    return result.download_url as string;
  }

  async function downloadAudio() {
    try {
      setError("");
      const url = await getAudioDownloadUrl();

      if (url) {
        window.open(url, "_blank", "noopener,noreferrer");
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error de descarga")
      );
    }
  }

  async function loadAudioPlayer() {
    setIsAudioLoading(true);
    setError("");

    try {
      const url = await getAudioDownloadUrl();

      if (url) {
        setAudioUrl(url);
      }
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error al cargar el audio")
      );
    } finally {
      setIsAudioLoading(false);
    }
  }

  function seekToSegment(segment: Segment) {
    const audio = audioRef.current;

    if (!audio || !audioUrl) return;

    audio.currentTime = segment.start_time;
    setCurrentTime(segment.start_time);

    audio.play().catch(() => {
      setError(t("No se pudo reproducir el audio."));
    });
  }

  async function exportTranscription() {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    setExporting(true);
    setError("");

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/export`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(exportOptions),
        }
      );

      if (response.status === 401) {
        localStorage.removeItem("audionet_access_token");
        localStorage.removeItem("audionet_refresh_token");
        window.location.href = "/";
        return;
      }

      if (!response.ok) {
        let message = t("No se pudo exportar la transcripción");

        try {
          const result = await response.json();

          if (typeof result.detail === "string") {
            message = result.detail;
          }
        } catch {}

        throw new Error(message);
      }

      const blob = await response.blob();
      const downloadUrl = window.URL.createObjectURL(blob);

      const link = document.createElement("a");
      link.href = downloadUrl;
      link.download = `transcription_${id}.${exportOptions.format}`;

      document.body.appendChild(link);
      link.click();
      link.remove();

      window.URL.revokeObjectURL(downloadUrl);
      setShowExport(false);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : t("Error al exportar el documento")
      );
    } finally {
      setExporting(false);
    }
  }

  if (loading) {
    return (
      <main className="flex min-h-screen items-center justify-center bg-[#F5F7FB]">
        <p className="text-base text-slate-500">
          {t("Cargando transcripción...")}
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#F5F7FB] p-5 sm:p-8">
        <div className="mx-auto max-w-4xl">
          <p className="mb-5 text-sm text-red-600">
            {error || t("Transcripción no encontrada")}
          </p>

          <Link
            href="/dashboard"
            className="text-sm font-semibold text-blue-600 hover:underline"
          >
            {t("Volver al dashboard")}
          </Link>
        </div>
      </main>
    );
  }

  const reportCards = [
    {
      label: "Procesamiento",
      value: formatProcessingTime(data.processing_time_seconds),
      color: "text-blue-600",
    },
    {
      label: "Duración",
      value: formatDuration(data.duration),
      color: "text-indigo-600",
    },
    {
      label: "Palabras",
      value: data.word_count ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Caracteres",
      value: data.character_count ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Sin espacios",
      value: data.character_count_no_whitespace ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Párrafos",
      value: data.paragraph_count ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Segmentos",
      value: data.segment_count ?? data.segments?.length ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Velocidad",
      value:
        data.processing_speed != null
          ? `${data.processing_speed.toFixed(2)}×`
          : "--",
      color: "text-green-600",
    },
  ];

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F5F7FB]">
      <AppHeader />

      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {/* ENCABEZADO */}
        <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="mb-1.5 text-xs font-bold uppercase tracking-wider text-blue-600">
              {t("TRANSCRIPCIÓN")}
            </p>

            <h1 className="break-words text-xl font-bold leading-tight text-[#17233D] sm:text-2xl">
              {data.filename}
            </h1>

            <p className="mt-2 text-sm text-slate-500">
              {t("Idioma")}: {data.language || "--"} <span className="mx-1">·</span>
              {t("Duración")}: {formatDuration(data.duration)}{" "}
              <span className="mx-1">·</span>
              {t("Segmentos")}:{" "}
              {data.segment_count ?? data.segments?.length ?? 0}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2.5 sm:flex sm:shrink-0">
            <button
              onClick={downloadAudio}
              className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              {t("Descargar audio")}
            </button>

            <button
              onClick={() => {
                setError("");
                setShowExport(true);
              }}
              disabled={editing}
              className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700`}
            >
              {t("Exportar documento")}
            </button>
          </div>
        </div>

        {/* ERROR */}
        {error && (
          <div className="mb-5 flex items-start justify-between gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            <span className="break-words">{error}</span>
            <button
              type="button"
              onClick={() => setError("")}
              className="shrink-0 rounded px-1 text-lg font-bold leading-none"
              aria-label={t("Cerrar")}
            >
              ×
            </button>
          </div>
        )}

        {/* REPORTE */}
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-1.5 border-b border-slate-100 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
            <h2 className="text-base font-bold text-[#17233D]">
              {t("Reporte de procesamiento")}
            </h2>

            <p className="text-xs text-slate-400">
              {t("Finalizado")}: {formatDateTime(data.completed_at)}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-px bg-slate-100 sm:grid-cols-4 lg:grid-cols-8">
            {reportCards.map((card) => (
              <div
                key={card.label}
                className="min-w-0 bg-white px-3.5 py-3.5 sm:px-4 sm:py-4"
              >
                <p className="truncate text-xs text-slate-500">
                  {t(card.label)}
                </p>

                <p
                  className={`mt-1.5 break-words text-lg font-bold ${card.color}`}
                >
                  {typeof card.value === "number"
                    ? formatNumber(card.value)
                    : card.value}
                </p>
              </div>
            ))}
          </div>
        </section>

        {/* REPRODUCTOR */}
        <section className="mb-6 rounded-xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#17233D]">
                {t("Reproductor de audio")}
              </h2>

              <p className="mt-1 text-sm text-slate-500">
                {t("Escucha y navega por los segmentos.")}
              </p>
            </div>

            {!audioUrl && (
              <button
                type="button"
                onClick={loadAudioPlayer}
                disabled={isAudioLoading}
                className={`${buttonClass} w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto`}
              >
                {isAudioLoading
                  ? t("Cargando audio...")
                  : t("Cargar reproductor")}
              </button>
            )}
          </div>

          {audioUrl && (
            <div className="mt-4">
              <audio
                ref={audioRef}
                src={audioUrl}
                controls
                preload="metadata"
                className="h-11 w-full"
                onTimeUpdate={(e) =>
                  setCurrentTime(e.currentTarget.currentTime)
                }
                onSeeked={(e) =>
                  setCurrentTime(e.currentTarget.currentTime)
                }
                onEnded={() => setCurrentTime(data.duration ?? 0)}
              />

              <div className="mt-2 flex justify-between text-xs text-slate-400">
                <span>{formatTime(currentTime)}</span>
                <span>{formatDuration(data.duration)}</span>
              </div>
            </div>
          )}
        </section>

        {/* SEGMENTOS */}
        {data.segments && data.segments.length > 0 && (
          <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
            <div className="flex items-center justify-between gap-3 border-b border-slate-100 px-4 py-3.5">
              <div>
                <h2 className="text-base font-bold text-[#17233D]">
                  {t("Segmentos originales")}
                </h2>

                <p className="mt-1 text-xs text-slate-400">
                  {t("Selecciona un segmento para reproducirlo.")}
                </p>
              </div>

              <span className="rounded-lg bg-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-600">
                {data.segments.length}
              </span>
            </div>

            <div className="max-h-[560px] space-y-1.5 overflow-y-auto p-3 sm:p-4">
              {data.segments.map((segment) => {
                const active =
                  currentTime >= segment.start_time &&
                  currentTime < segment.end_time;

                return (
                  <button
                    type="button"
                    key={segment.id || segment.segment_order}
                    onClick={() => seekToSegment(segment)}
                    disabled={!audioUrl}
                    className={`flex w-full min-w-0 items-start gap-3 rounded-lg border px-3 py-3 text-left transition ${
                      active
                        ? "border-blue-200 bg-blue-50"
                        : "border-transparent hover:bg-slate-50"
                    } ${audioUrl ? "cursor-pointer" : "cursor-default"}`}
                  >
                    <span
                      className={`mt-0.5 shrink-0 rounded-md px-2 py-1.5 font-mono text-xs ${
                        active
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {formatTime(segment.start_time)}
                    </span>

                    <span
                      className={`min-w-0 break-words text-sm leading-6 ${
                        active
                          ? "font-medium text-blue-800"
                          : "text-slate-700"
                      }`}
                    >
                      {segment.text}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {/* HISTORIAL DE VERSIONES */}
        <section className="mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#17233D]">
                {t("Historial de versiones")}
              </h2>
              <p className="mt-1 text-xs text-slate-400">
                {t("Consulta, compara y restaura versiones anteriores.")}
              </p>
            </div>

            <button
              type="button"
              onClick={loadVersions}
              disabled={loadingVersions}
              className={`${buttonClass} border border-slate-200 bg-white text-slate-700 hover:bg-slate-50`}
            >
              {loadingVersions
                ? t("Cargando...")
                : t("Actualizar historial")}
            </button>
          </div>

          <div className="p-4 sm:p-5">
            {loadingVersions && versions.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-400">
                {t("Cargando historial...")}
              </p>
            ) : versions.length === 0 ? (
              <p className="py-5 text-center text-sm text-slate-400">
                {t("Todavía no hay versiones guardadas.")}
              </p>
            ) : (
              <>
                {versions.length > 1 && (
                  <div className="mb-4 flex flex-col gap-2 sm:flex-row">
                    <select
                      value={compareVersionId}
                      onChange={(e) => setCompareVersionId(e.target.value)}
                      className={inputClass}
                    >
                      <option value="">
                        {t("Seleccionar versión para comparar")}
                      </option>

                      {versions.slice(1).map((version) => (
                        <option key={version.id} value={version.id}>
                          {`V${version.version_number} · ${formatDateTime(
                            version.created_at
                          )}`}
                        </option>
                      ))}
                    </select>

                    <button
                      type="button"
                      onClick={compareVersions}
                      disabled={!compareVersionId}
                      className={`${buttonClass} bg-indigo-600 text-white hover:bg-indigo-700`}
                    >
                      {t("Comparar")}
                    </button>
                  </div>
                )}

                <div className="space-y-2">
                  {versions.map((version, index) => (
                    <div
                      key={version.id}
                      className="flex flex-col gap-3 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
                    >
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="rounded-md bg-blue-50 px-2 py-1 text-xs font-bold text-blue-700">
                            V{version.version_number}
                          </span>

                          {index === 0 && (
                            <span className="rounded-md bg-green-50 px-2 py-1 text-xs font-semibold text-green-700">
                              {t("Última versión guardada")}
                            </span>
                          )}

                          <span className="text-xs text-slate-400">
                            {version.change_type}
                          </span>
                        </div>

                        <p className="mt-1.5 text-xs text-slate-500">
                          {formatDateTime(version.created_at)}
                        </p>

                        <p className="mt-1 text-xs text-slate-400">
                          {formatNumber(
                            version.transcript_text?.length || 0
                          )}{" "}
                          {t("caracteres")}
                        </p>
                      </div>

                      <div className="grid grid-cols-2 gap-2 sm:flex">
                        <button
                          type="button"
                          onClick={() => viewVersion(version.id)}
                          className={`${buttonClass} border border-slate-200 text-slate-700 hover:bg-slate-50`}
                        >
                          {t("Ver")}
                        </button>

                        <button
                          type="button"
                          onClick={() => restoreVersion(version.id)}
                          disabled={restoringVersion || editing}
                          className={`${buttonClass} bg-amber-500 text-white hover:bg-amber-600`}
                        >
                          {restoringVersion
                            ? t("Restaurando...")
                            : t("Restaurar")}
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </section>

        {/* TEXTO TRANSCRITO */}
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h2 className="text-base font-bold text-[#17233D]">
                {t("Texto transcrito")}
              </h2>

              <p className="mt-1 text-xs text-slate-400">
                {t("Puedes editar y corregir el contenido.")}
              </p>
            </div>

            {!editing ? (
              <button
                onClick={() => {
                  setEditedText(data.transcript_text || "");
                  setEditing(true);
                  setError("");
                }}
                className={`${buttonClass} w-full bg-blue-600 text-white hover:bg-blue-700 sm:w-auto`}
              >
                {t("Editar texto")}
              </button>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:flex">
                <button
                  onClick={() => {
                    setEditedText(data.transcript_text || "");
                    setEditing(false);
                    setError("");
                  }}
                  disabled={saving}
                  className={`${buttonClass} border border-slate-200 text-slate-600 hover:bg-slate-50`}
                >
                  {t("Cancelar")}
                </button>

                <button
                  onClick={saveTranscription}
                  disabled={saving}
                  className={`${buttonClass} bg-green-600 text-white hover:bg-green-700`}
                >
                  {saving ? t("Guardando...") : t("Guardar cambios")}
                </button>
              </div>
            )}
          </div>

          <div className="p-4 sm:p-6">
            {editing ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={16}
                className="w-full resize-y rounded-lg border border-slate-200 p-4 text-sm leading-7 text-slate-700 outline-none transition focus:border-blue-500 focus:ring-2 focus:ring-blue-100 sm:text-base"
                placeholder={t("Escribe o corrige la transcripción...")}
              />
            ) : (
              <div className="whitespace-pre-wrap break-words text-sm leading-7 text-slate-700 sm:text-base">
                {data.transcript_text || t("No hay texto disponible.")}
              </div>
            )}
          </div>
        </section>

        <div className="mt-5 pb-3 text-center text-xs text-slate-400">
          AudioNet · {t("Transcripción")} {data.id}
        </div>
      </div>

      {/* MODAL DE VERSIONES */}
      {(showVersionContent || comparison) && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-3 backdrop-blur-[2px] sm:p-5">
          <div className="flex max-h-[90dvh] w-full max-w-5xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
              <h2 className="text-lg font-bold text-[#17233D]">
                {comparison
                  ? t("Comparación de versiones")
                  : `${t("Versión")} ${
                      selectedVersion?.version_number ?? ""
                    }`}
              </h2>

              <button
                type="button"
                onClick={() => {
                  setShowVersionContent(false);
                  setSelectedVersion(null);
                  setComparison(null);
                }}
                aria-label={t("Cerrar")}
                className="flex h-9 w-9 items-center justify-center rounded-lg text-2xl text-slate-400 hover:bg-slate-100"
              >
                ×
              </button>
            </div>

            <div className="min-h-0 overflow-y-auto p-4 sm:p-6">
              {comparison ? (
                <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
                  {[comparison.version_a, comparison.version_b].map(
                    (version) => (
                      <div key={version.id} className="min-w-0">
                        <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                          <h3 className="font-bold text-slate-700">
                            V{version.version_number}
                          </h3>

                          <span className="text-xs text-slate-400">
                            {formatDateTime(version.created_at)}
                          </span>
                        </div>

                        <pre className="max-h-[55vh] overflow-auto whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                          {version.transcript_text}
                        </pre>
                      </div>
                    )
                  )}
                </div>
              ) : selectedVersion ? (
                <>
                  <div className="mb-3 text-xs text-slate-400">
                    {formatDateTime(selectedVersion.created_at)}
                  </div>

                  <pre className="whitespace-pre-wrap break-words rounded-lg border border-slate-200 bg-slate-50 p-4 text-sm leading-7 text-slate-700">
                    {selectedVersion.transcript_text}
                  </pre>

                  <button
                    type="button"
                    onClick={() => restoreVersion(selectedVersion.id)}
                    disabled={restoringVersion || editing}
                    className={`${buttonClass} mt-4 bg-amber-500 text-white hover:bg-amber-600`}
                  >
                    {restoringVersion
                      ? t("Restaurando...")
                      : t("Restaurar esta versión")}
                  </button>
                </>
              ) : null}
            </div>
          </div>
        </div>
      )}

      {/* MODAL DE EXPORTACIÓN */}
      {showExport && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/50 p-0 backdrop-blur-[2px] sm:items-center sm:p-4">
          <div className="flex max-h-[94dvh] w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:max-h-[90dvh] sm:rounded-2xl">
            {/* CABECERA DEL MODAL */}
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-4 py-4 sm:px-6">
              <div>
                <h2 className="text-lg font-bold text-[#17233D]">
                  {t("Exportar transcripción")}
                </h2>

                <p className="mt-1 text-sm text-slate-500">
                  {t("Personaliza tu documento.")}
                </p>
              </div>

              <button
                type="button"
                onClick={() => setShowExport(false)}
                disabled={exporting}
                aria-label={t("Cerrar")}
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-2xl text-slate-400 transition hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50"
              >
                ×
              </button>
            </div>

            {/* CONTENIDO DEL MODAL */}
            <div className="min-h-0 space-y-5 overflow-y-auto p-4 sm:p-6">
              {/* FORMATO */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("Formato del documento")}
                </label>

                <div className="grid grid-cols-3 gap-2.5">
                  {[
                    { value: "docx", label: "Word", extension: ".docx" },
                    { value: "pdf", label: "PDF", extension: ".pdf" },
                    {
                      value: "txt",
                      label: t("Texto"),
                      extension: ".txt",
                    },
                  ].map((item) => (
                    <button
                      key={item.value}
                      type="button"
                      onClick={() =>
                        setExportOptions((current) => ({
                          ...current,
                          format: item.value as ExportOptions["format"],
                        }))
                      }
                      className={`rounded-xl border px-3 py-3 text-sm font-semibold transition ${
                        exportOptions.format === item.value
                          ? "border-blue-600 bg-blue-50 text-blue-700"
                          : "border-slate-200 text-slate-600 hover:bg-slate-50"
                      }`}
                    >
                      {item.label}

                      <span className="mt-1 block text-xs font-normal opacity-70">
                        {item.extension}
                      </span>
                    </button>
                  ))}
                </div>
              </div>

              {/* TIPO DE DOCUMENTO */}
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  {t("Tipo de documento")}
                </label>

                <select
                  value={exportOptions.document_type}
                  onChange={(e) =>
                    setExportOptions((current) => ({
                      ...current,
                      document_type: e.target.value as ExportOptions["document_type"],
                    }))
                  }
                  className={inputClass}
                >
                  <option value="standard">{t("General")}</option>
                  <option value="academic">{t("Académico")}</option>
                  <option value="song">{t("Canción")}</option>
                  <option value="poem">{t("Poema")}</option>
                  <option value="speech">{t("Discurso")}</option>
                  <option value="sermon">{t("Prédica")}</option>
                  <option value="interview">{t("Entrevista")}</option>
                  <option value="meeting">{t("Reunión")}</option>
                  <option value="judicial">{t("Documento judicial")}</option>
                </select>
              </div>

              {/* DATOS GENERALES */}
              <div>
                <h3 className="mb-3 text-sm font-semibold text-slate-700">
                  {t("Información del documento")}
                </h3>

                <div className="grid grid-cols-1 gap-3.5 sm:grid-cols-2">
                  {[
                    {
                      key: "title",
                      label: "Título",
                      placeholder: "Título del documento",
                    },
                    {
                      key: "header",
                      label: "Encabezado",
                      placeholder: "Ej. AudioNet",
                    },
                    {
                      key: "subtitle",
                      label: "Subtítulo",
                      placeholder: "Descripción adicional",
                    },
                    {
                      key: "author",
                      label: "Autor / responsable",
                      placeholder: "Nombre del autor",
                    },
                  ].map((field) => (
                    <div key={field.key}>
                      <label className="mb-1.5 block text-sm font-medium text-slate-700">
                        {t(field.label)}
                      </label>

                      <input
                        type="text"
                        value={
                          exportOptions[
                            field.key as keyof ExportOptions
                          ] as string
                        }
                        onChange={(e) =>
                          setExportOptions((current) => ({
                            ...current,
                            [field.key]: e.target.value,
                          }))
                        }
                        className={inputClass}
                        placeholder={t(field.placeholder)}
                      />
                    </div>
                  ))}
                </div>
              </div>

              {/* INFORMACIÓN JUDICIAL */}
              {exportOptions.document_type === "judicial" && (
                <div className="space-y-4 rounded-xl border border-blue-200 bg-blue-50/50 p-4 sm:p-5">
                  <div>
                    <h3 className="text-base font-bold text-[#17233D]">
                      {t("Identificación judicial")}
                    </h3>

                    <p className="mt-1 text-sm text-slate-500">
                      {t(
                        "Completa únicamente la información disponible."
                      )}
                    </p>
                  </div>

                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    {judicialFields.map((field) => (
                      <div key={field.key}>
                        <label className="mb-1.5 block text-sm font-medium text-slate-600">
                          {t(field.label)}
                        </label>

                        <input
                          type="text"
                          value={exportOptions[field.key] as string}
                          onChange={(e) =>
                            setExportOptions((current) => ({
                              ...current,
                              [field.key]: e.target.value,
                            }))
                          }
                          className={inputClass}
                        />
                      </div>
                    ))}
                  </div>

                  <div>
                    <label className="mb-1.5 block text-sm font-semibold text-slate-700">
                      {t("Participantes")}
                    </label>

                    <textarea
                      value={exportOptions.participants.join("\n")}
                      onChange={(e) =>
                        setExportOptions((current) => ({
                          ...current,
                          participants: e.target.value
                            .split("\n")
                            .map((person) => person.trim())
                            .filter(Boolean),
                        }))
                      }
                      rows={3}
                      placeholder={t("Un participante por línea.")}
                      className={inputClass}
                    />
                  </div>

                  <div className="space-y-3 border-t border-blue-100 pt-4">
                    {judicialCheckboxes.map((option) => (
                      <label
                        key={option.key}
                        className="flex cursor-pointer items-start gap-3 text-sm text-slate-700"
                      >
                        <input
                          type="checkbox"
                          checked={exportOptions[option.key]}
                          onChange={(e) =>
                            setExportOptions((current) => ({
                              ...current,
                              [option.key]: e.target.checked,
                            }))
                          }
                          className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                        />

                        <span>{t(option.label)}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {/* OPCIONES ADICIONALES */}
              <div className="space-y-3 border-t border-slate-100 pt-4">
                <p className="text-sm font-semibold text-slate-700">
                  {t("Opciones adicionales")}
                </p>

                {[
                  {
                    key: "include_page_numbers",
                    label: "Numerar páginas",
                  },
                  {
                    key: "include_date",
                    label: "Incluir fecha y hora",
                  },
                  {
                    key: "include_audio_info",
                    label: "Incluir nombre del archivo de audio",
                  },
                  {
                    key: "include_timestamps",
                    label: "Incluir marcas de tiempo",
                  },
                ].map((option) => (
                  <label
                    key={option.key}
                    className="flex cursor-pointer items-start gap-3 text-sm text-slate-600"
                  >
                    <input
                      type="checkbox"
                      checked={
                        exportOptions[
                          option.key as keyof ExportOptions
                        ] as boolean
                      }
                      onChange={(e) =>
                        setExportOptions((current) => ({
                          ...current,
                          [option.key]: e.target.checked,
                        }))
                      }
                      className="mt-0.5 h-4 w-4 shrink-0 accent-blue-600"
                    />

                    <span>{t(option.label)}</span>
                  </label>
                ))}
              </div>
            </div>

            {/* BOTONES DEL MODAL */}
            <div className="grid shrink-0 grid-cols-2 gap-2.5 border-t border-slate-200 bg-slate-50 p-4 sm:flex sm:justify-end sm:px-6">
              <button
                type="button"
                onClick={() => setShowExport(false)}
                disabled={exporting}
                className={`${buttonClass} border border-slate-300 bg-white text-slate-700 hover:bg-slate-100 sm:min-w-32`}
              >
                {t("Cancelar")}
              </button>

              <button
                type="button"
                onClick={exportTranscription}
                disabled={exporting}
                className={`${buttonClass} bg-blue-600 text-white hover:bg-blue-700 sm:min-w-48`}
              >
                {exporting
                  ? t("Generando documento...")
                  : t("Descargar documento")}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}

export default function TranscriptionPage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <p className="text-sm text-slate-500">
            {t("Cargando transcripción...")}
          </p>
        </div>
      }
    >
      <TranscriptionContent />
    </Suspense>
  );
}
