"use client";

import { useEffect, useState, Suspense } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

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

interface ExportOptions {
  format: "docx" | "pdf" | "txt";
  title: string;
  header: string;
  subtitle: string;
  include_date: boolean;
  include_audio_info: boolean;
  include_timestamps: boolean;
}

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
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);

  const [exportOptions, setExportOptions] = useState<ExportOptions>({
    format: "docx",
    title: "Transcripción",
    header: "AudioNet",
    subtitle: "",
    include_date: true,
    include_audio_info: true,
    include_timestamps: false,
  });

  // Actualizar el título predeterminado según el idioma seleccionado.
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
      } catch (err) {
        setError(
          err instanceof Error ? err.message : t("Error de conexión")
        );
      } finally {
        setLoading(false);
      }
    }

    loadTranscription();
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
              transcript_text: editedText,
            }
          : current
      );

      setEditing(false);
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

  async function downloadAudio() {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    try {
      const response = await fetch(
        `${API_URL}/transcriptions/${id}/download`,
        {
          headers: {
            Authorization: `Bearer ${token}`,
          },
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : t("No se pudo descargar el audio")
        );
      }

      window.open(result.download_url, "_blank");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : t("Error de descarga")
      );
    }
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
      <main className="min-h-screen flex items-center justify-center bg-[#F5F7FB]">
        <p className="text-slate-500">
          {t("Cargando transcripción...")}
        </p>
      </main>
    );
  }

  if (!data) {
    return (
      <main className="min-h-screen bg-[#F5F7FB] p-8">
        <div className="max-w-4xl mx-auto">
          <p className="text-red-600 mb-5">
            {error || t("Transcripción no encontrada")}
          </p>

          <Link
            href="/dashboard"
            className="text-blue-600 font-semibold"
          >
            {t("Volver al dashboard")}
          </Link>
        </div>
      </main>
    );
  }

  const reportCards = [
    {
      label: "Tiempo de procesamiento",
      value: formatProcessingTime(data.processing_time_seconds),
      color: "text-blue-600",
    },
    {
      label: "Duración del audio",
      value: formatDuration(data.duration),
      color: "text-indigo-600",
    },
    {
      label: "Palabras",
      value: data.word_count ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Caracteres (con espacios)",
      value: data.character_count ?? "--",
      color: "text-slate-800",
    },
    {
      label: "Caracteres (sin espacios)",
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
          ? `${data.processing_speed.toFixed(2)}× ${t("tiempo real")}`
          : "--",
      color: "text-green-600",
    },
  ];

  return (
    <main className="min-h-screen bg-[#F5F7FB]">
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-6 py-5 flex justify-between items-center">
          <Link
            href="/dashboard"
            className="text-blue-600 font-semibold"
          >
            ← {t("Volver al dashboard")}
          </Link>

          <span className="text-xl font-bold text-[#17233D]">
            AudioNet
          </span>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10">
        <div className="flex flex-col sm:flex-row justify-between gap-5 mb-8">
          <div>
            <p className="text-sm text-blue-600 font-semibold mb-2">
              {t("TRANSCRIPCIÓN")}
            </p>

            <h1 className="text-3xl font-bold text-[#17233D] break-all">
              {data.filename}
            </h1>

            <p className="text-sm text-slate-500 mt-3">
              {t("Idioma")}: {data.language || "--"} ·{" "}
              {t("Duración")}: {formatDuration(data.duration)} ·{" "}
              {t("Segmentos")}:{" "}
              {data.segment_count ?? data.segments?.length ?? 0}
            </p>
          </div>

          <div className="flex flex-wrap gap-3 h-fit">
            <button
              onClick={downloadAudio}
              className="px-5 py-3 bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-xl font-semibold"
            >
              {t("Descargar audio")}
            </button>

            <button
              onClick={() => {
                setError("");
                setShowExport(true);
              }}
              disabled={editing}
              className="px-5 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-semibold disabled:opacity-50"
            >
              {t("Exportar documento")}
            </button>
          </div>
        </div>

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-600">
            {error}
          </div>
        )}

        {/* REPORTE ORIGINAL DE PROCESAMIENTO */}
        <section className="mb-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div>
              <h2 className="text-xl font-bold text-[#17233D]">
                {t("Reporte de procesamiento")}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                {t(
                  "Métricas calculadas sobre el texto original generado por Whisper."
                )}
              </p>
            </div>

            <div className="text-sm text-slate-500">
              {t("Finalizado")}:{" "}
              <span className="font-semibold text-slate-700">
                {formatDateTime(data.completed_at)}
              </span>
            </div>
          </div>

          <div className="p-6 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {reportCards.map((card) => (
              <div
                key={card.label}
                className="rounded-xl bg-slate-50 border border-slate-100 p-4"
              >
                <p className="text-xs text-slate-500">
                  {t(card.label)}
                </p>

                <p className={`text-2xl font-bold mt-2 ${card.color}`}>
                  {typeof card.value === "number"
                    ? formatNumber(card.value)
                    : card.value}
                </p>
              </div>
            ))}
          </div>

          <div className="px-6 pb-6 text-xs text-slate-400">
            {t(
              "El reporte conserva las cifras originales aunque edites posteriormente la transcripción."
            )}
          </div>
        </section>

        {/* MODAL DE EXPORTACIÓN */}
        {showExport && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4">
            <div className="bg-white w-full max-w-xl rounded-2xl shadow-xl overflow-hidden max-h-[90vh] overflow-y-auto">
              <div className="p-6 border-b border-slate-200 flex justify-between items-center">
                <div>
                  <h2 className="text-xl font-bold text-[#17233D]">
                    {t("Exportar transcripción")}
                  </h2>

                  <p className="text-sm text-slate-500 mt-1">
                    {t("Personaliza tu documento.")}
                  </p>
                </div>

                <button
                  onClick={() => setShowExport(false)}
                  disabled={exporting}
                  className="text-slate-400 hover:text-slate-700 text-2xl"
                >
                  ×
                </button>
              </div>

              <div className="p-6 space-y-5">
                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t("Formato del documento")}
                  </label>

                  <div className="grid grid-cols-3 gap-3">
                    {[
                      {
                        value: "docx",
                        label: "Word",
                        extension: ".docx",
                      },
                      {
                        value: "pdf",
                        label: "PDF",
                        extension: ".pdf",
                      },
                      {
                        value: "txt",
                        label: t("Texto"),
                        extension: ".txt",
                      },
                    ].map((item) => (
                      <button
                        key={item.value}
                        onClick={() =>
                          setExportOptions({
                            ...exportOptions,
                            format: item.value as ExportOptions["format"],
                          })
                        }
                        className={`p-3 rounded-xl border text-sm font-semibold transition ${
                          exportOptions.format === item.value
                            ? "border-blue-600 bg-blue-50 text-blue-700"
                            : "border-slate-200 text-slate-600 hover:bg-slate-50"
                        }`}
                      >
                        {item.label}

                        <span className="block text-xs font-normal mt-1">
                          {item.extension}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t("Título")}
                  </label>

                  <input
                    type="text"
                    value={exportOptions.title}
                    onChange={(e) =>
                      setExportOptions({
                        ...exportOptions,
                        title: e.target.value,
                      })
                    }
                    style={{ colorScheme: "light" }}
                    className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg px-4 py-3 text-sm outline-none shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder={t("Título del documento")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t("Encabezado")}
                  </label>

                  <input
                    type="text"
                    value={exportOptions.header}
                    onChange={(e) =>
                      setExportOptions({
                        ...exportOptions,
                        header: e.target.value,
                      })
                    }
                    className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg px-4 py-3 text-sm outline-none shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder={t("Ej. AudioNet")}
                  />
                </div>

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    {t("Subtítulo")}
                  </label>

                  <input
                    type="text"
                    value={exportOptions.subtitle}
                    onChange={(e) =>
                      setExportOptions({
                        ...exportOptions,
                        subtitle: e.target.value,
                      })
                    }
                    className="w-full bg-white text-slate-900 placeholder:text-slate-400 border border-slate-300 rounded-lg px-4 py-3 text-sm outline-none shadow-sm focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition"
                    placeholder={t("Descripción adicional (opcional)")}
                  />
                </div>

                <div className="border-t border-slate-100 pt-5 space-y-4">
                  <p className="text-sm font-semibold text-slate-700">
                    {t("Opciones adicionales")}
                  </p>

                  {[
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
                      className="flex items-center gap-3 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={
                          exportOptions[
                            option.key as keyof ExportOptions
                          ] as boolean
                        }
                        onChange={(e) =>
                          setExportOptions({
                            ...exportOptions,
                            [option.key]: e.target.checked,
                          })
                        }
                        className="w-4 h-4 accent-blue-600"
                      />

                      <span className="text-sm text-slate-600">
                        {t(option.label)}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="p-6 bg-slate-50 border-t border-slate-200 flex flex-col-reverse sm:flex-row justify-end gap-3">
                <button
                  onClick={() => setShowExport(false)}
                  disabled={exporting}
                  className="px-5 py-3 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-white disabled:opacity-50"
                >
                  {t("Cancelar")}
                </button>

                <button
                  onClick={exportTranscription}
                  disabled={exporting}
                  className="px-5 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold disabled:opacity-50"
                >
                  {exporting
                    ? t("Generando documento...")
                    : t("Descargar documento")}
                </button>
              </div>
            </div>
          </div>
        )}

        {/* TEXTO TRANSCRITO */}
        <section className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="p-6 border-b border-slate-100 flex flex-col sm:flex-row justify-between gap-4 items-start sm:items-center">
            <div>
              <h2 className="text-xl font-bold text-[#17233D]">
                {t("Texto transcrito")}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
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
                className="px-4 py-2 rounded-lg bg-blue-600 hover:bg-blue-700 text-white font-semibold text-sm"
              >
                {t("Editar texto")}
              </button>
            ) : (
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    setEditedText(data.transcript_text || "");
                    setEditing(false);
                    setError("");
                  }}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg border border-slate-300 hover:bg-slate-50 text-slate-700 text-sm disabled:opacity-50"
                >
                  {t("Cancelar")}
                </button>

                <button
                  onClick={saveTranscription}
                  disabled={saving}
                  className="px-4 py-2 rounded-lg bg-green-600 hover:bg-green-700 text-white text-sm font-semibold disabled:opacity-50"
                >
                  {saving
                    ? t("Guardando...")
                    : t("Guardar cambios")}
                </button>
              </div>
            )}
          </div>

          <div className="p-6 sm:p-10">
            {editing ? (
              <textarea
                value={editedText}
                onChange={(e) => setEditedText(e.target.value)}
                rows={18}
                className="w-full border border-slate-200 rounded-xl p-5 text-slate-700 leading-8 outline-none focus:border-blue-500 resize-y"
                placeholder={t(
                  "Escribe o corrige la transcripción..."
                )}
              />
            ) : (
              <div className="text-slate-700 leading-8 whitespace-pre-wrap">
                {data.transcript_text || t("No hay texto disponible.")}
              </div>
            )}
          </div>
        </section>

        {/* SEGMENTOS ORIGINALES */}
        {data.segments && data.segments.length > 0 && (
          <section className="mt-8 bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
            <div className="p-6 border-b border-slate-100">
              <h2 className="text-xl font-bold text-[#17233D]">
                {t("Segmentos originales")}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                {t(
                  "Texto original dividido por marcas de tiempo."
                )}
              </p>
            </div>

            <div className="p-6 sm:p-10 space-y-5">
              {data.segments.map((segment) => (
                <div
                  key={segment.id || segment.segment_order}
                  className="flex gap-5"
                >
                  <span className="text-xs font-mono text-blue-600 bg-blue-50 rounded-lg px-2 py-1 h-fit whitespace-nowrap">
                    {formatTime(segment.start_time)}
                  </span>

                  <p className="text-slate-700 leading-8">
                    {segment.text}
                  </p>
                </div>
              ))}
            </div>
          </section>
        )}

        <div className="mt-6 text-sm text-slate-400">
          AudioNet · {t("Transcripción")} {data.id}
        </div>
      </div>
    </main>
  );
}

export default function TranscriptionPage() {
  const { t } = useLanguage();

  return (
    <Suspense
      fallback={
        <div className="min-h-screen flex items-center justify-center">
          <p>{t("Cargando transcripción...")}</p>
        </div>
      }
    >
      <TranscriptionContent />
    </Suspense>
  );
}