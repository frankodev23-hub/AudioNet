"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";

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
  word_count?: number;
}

interface User {
  id: string;
  email: string;
}

interface Usage {
  total_seconds: number;
  total_minutes: number;
  current_month_seconds: number;
  transcription_count: number;
}

function Icon({
  name,
  size = 18,
}: {
  name: string;
  size?: number;
}) {
  const common = {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.8,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    "aria-hidden": true as const,
  };

  switch (name) {
    case "audio":
      return (
        <svg {...common}>
          <path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4M23 9v6" />
        </svg>
      );
    case "check":
      return (
        <svg {...common}>
          <path d="m5 12 4 4L19 6" />
        </svg>
      );
    case "clock":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M12 7v5l3 2" />
        </svg>
      );
    case "alert":
      return (
        <svg {...common}>
          <path d="M12 9v4M12 17h.01" />
          <circle cx="12" cy="12" r="9" />
        </svg>
      );
    case "refresh":
      return (
        <svg {...common}>
          <path d="M20 7v5h-5M4 17v-5h5" />
          <path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" />
        </svg>
      );
    case "upload":
      return (
        <svg {...common}>
          <path d="M12 16V4m-5 5 5-5 5 5" />
          <path d="M4 16v4h16v-4" />
        </svg>
      );
    case "download":
      return (
        <svg {...common}>
          <path d="M12 4v12m-5-5 5 5 5-5" />
          <path d="M4 19v1h16v-1" />
        </svg>
      );
    case "file":
      return (
        <svg {...common}>
          <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
          <path d="M14 2v6h6M8 13h8M8 17h8" />
        </svg>
      );
    case "trash":
      return (
        <svg {...common}>
          <path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" />
          <path d="M10 11v5M14 11v5" />
        </svg>
      );
    case "user":
      return (
        <svg {...common}>
          <circle cx="12" cy="8" r="4" />
          <path d="M4 21a8 8 0 0 1 16 0" />
        </svg>
      );
    case "calendar":
      return (
        <svg {...common}>
          <rect x="3" y="5" width="18" height="16" rx="2" />
          <path d="M16 3v4M8 3v4M3 10h18" />
        </svg>
      );
    case "language":
      return (
        <svg {...common}>
          <circle cx="12" cy="12" r="9" />
          <path d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18" />
        </svg>
      );
    default:
      return null;
  }
}

export default function DashboardPage() {
  const { t, locale } = useLanguage();

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [usage, setUsage] = useState<Usage | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("es");

  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [latestTranscriptionId, setLatestTranscriptionId] = useState("");

  // --------------------------------------------------
  // API REQUEST
  // --------------------------------------------------

  async function apiRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      throw new Error("Sesión no válida");
    }

    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${token}`,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("audionet_access_token");
      localStorage.removeItem("audionet_refresh_token");

      window.location.href = "/";
      throw new Error("Sesión expirada");
    }

    return response;
  }

  // --------------------------------------------------
  // LOAD DASHBOARD
  // --------------------------------------------------

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const results = await Promise.allSettled([
        apiRequest("/auth/me"),
        apiRequest("/transcriptions?limit=100&offset=0"),
        apiRequest("/usage/me"),
      ]);

      const [userResult, historyResult, usageResult] = results;

      let hasErrors = false;

      if (userResult.status === "fulfilled" && userResult.value.ok) {
        try {
          const userData = await userResult.value.json();
          setUser(userData);
        } catch {
          setUser(null);
          hasErrors = true;
        }
      } else {
        setUser(null);
        hasErrors = true;
      }

      if (
        historyResult.status === "fulfilled" &&
        historyResult.value.ok
      ) {
        try {
          const historyData = await historyResult.value.json();

          setTranscriptions(
            Array.isArray(historyData.transcriptions)
              ? historyData.transcriptions
              : []
          );
        } catch {
          setTranscriptions([]);
          hasErrors = true;
        }
      } else {
        setTranscriptions([]);
        hasErrors = true;
      }

      if (usageResult.status === "fulfilled" && usageResult.value.ok) {
        try {
          const usageData = await usageResult.value.json();
          setUsage(usageData);
        } catch {
          setUsage(null);
          hasErrors = true;
        }
      } else {
        setUsage(null);
        hasErrors = true;
      }

      if (hasErrors) {
        setError(
          "Algunos datos no pudieron cargarse. Puedes intentarlo nuevamente."
        );
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de conexión con el servidor."
      );
    } finally {
      setLoading(false);
    }
  }, [API_URL]);

  // --------------------------------------------------
  // INITIALIZATION
  // --------------------------------------------------

  useEffect(() => {
    const token = localStorage.getItem("audionet_access_token");

    if (!token) {
      window.location.href = "/";
      return;
    }

    loadDashboard();
  }, [loadDashboard]);

  // --------------------------------------------------
  // UPLOAD AND TRANSCRIBE
  // --------------------------------------------------

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedFile) {
      setError("Selecciona un archivo de audio.");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");
    setLatestTranscriptionId("");

    try {
      const formData = new FormData();
      formData.append("file", selectedFile);

      const response = await apiRequest(
        `/upload-and-transcribe?language=${language}`,
        {
          method: "POST",
          body: formData,
        }
      );

      const result = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof result.detail === "string"
            ? result.detail
            : "No se pudo procesar el audio."
        );
      }

      setMessage(
        "Audio transcrito correctamente. El reporte está disponible."
      );

      setLatestTranscriptionId(result.id);
      setSelectedFile(null);

      const input = document.getElementById(
        "audio-file"
      ) as HTMLInputElement | null;

      if (input) {
        input.value = "";
      }

      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al procesar el audio."
      );
    } finally {
      setUploading(false);
    }
  }

  // --------------------------------------------------
  // DELETE TRANSCRIPTION
  // --------------------------------------------------

  async function handleDelete(id: string) {
    if (
      !window.confirm(
        t("¿Estás seguro de eliminar esta transcripción?")
      )
    ) {
      return;
    }

    setError("");

    try {
      const response = await apiRequest(`/transcriptions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la transcripción.");
      }

      setTranscriptions((current) =>
        current.filter((item) => item.id !== id)
      );

      if (latestTranscriptionId === id) {
        setLatestTranscriptionId("");
      }

      setMessage("Transcripción eliminada correctamente.");
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error al eliminar la transcripción."
      );
    }
  }

  // --------------------------------------------------
  // DOWNLOAD TRANSCRIPTION
  // --------------------------------------------------

  async function handleDownload(id: string) {
    setError("");

    try {
      const response = await apiRequest(
        `/transcriptions/${id}/download`
      );

      if (!response.ok) {
        throw new Error("No se pudo obtener el archivo.");
      }

      const result = await response.json();

      if (result.download_url) {
        window.open(
          result.download_url,
          "_blank",
          "noopener,noreferrer"
        );
      } else {
        throw new Error("No se recibió el enlace de descarga.");
      }
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de descarga."
      );
    }
  }

  // --------------------------------------------------
  // FORMAT HELPERS
  // --------------------------------------------------

  function formatDuration(seconds?: number) {
    if (seconds === undefined || seconds === null) {
      return "--";
    }

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}${t("m")} ${remainingSeconds}${t("s")}`;
  }

  function formatDate(date?: string) {
    if (!date) {
      return "--";
    }

    return new Date(date).toLocaleDateString(
      locale === "en" ? "en-US" : "es-ES",
      {
        day: "2-digit",
        month: "short",
        year: "numeric",
      }
    );
  }

  function getStatus(item: Transcription) {
    if (item.status === "completed") {
      return {
        label: t("Completado"),
        className: "bg-emerald-50 text-emerald-700 border-emerald-100",
        icon: "check",
      };
    }

    if (item.status === "processing") {
      return {
        label: t("Procesando"),
        className: "bg-amber-50 text-amber-700 border-amber-100",
        icon: "clock",
      };
    }

    return {
      label: t("Error"),
      className: "bg-red-50 text-red-700 border-red-100",
      icon: "alert",
    };
  }

  // --------------------------------------------------
  // STATISTICS
  // --------------------------------------------------

  const completed = transcriptions.filter(
    (item) => item.status === "completed"
  ).length;

  const processing = transcriptions.filter(
    (item) => item.status === "processing"
  ).length;

  const failed = transcriptions.filter(
    (item) => item.status === "failed"
  ).length;

  const transcriptionStats = [
    {
      label: "Total de audios",
      value: transcriptions.length,
      color: "text-blue-600",
      bg: "bg-blue-50",
      icon: "audio",
    },
    {
      label: "Completados",
      value: completed,
      color: "text-emerald-600",
      bg: "bg-emerald-50",
      icon: "check",
    },
    {
      label: "En proceso",
      value: processing,
      color: "text-amber-600",
      bg: "bg-amber-50",
      icon: "clock",
    },
    {
      label: "Con errores",
      value: failed,
      color: "text-red-600",
      bg: "bg-red-50",
      icon: "alert",
    },
  ];

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F5F7FB] text-[#17233D]">
      <AppHeader />

      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        {/* TITLE */}

        <div
          id="dashboard"
          className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between"
        >
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">
              {t("Panel de control")}
            </h1>

            <p className="mt-1 text-sm text-slate-500">
              {t("Administra tus audios y transcripciones desde un solo lugar.")}
            </p>
          </div>

          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 sm:text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm">
              <Icon name="user" size={16} />
            </span>

            <span className="min-w-0 truncate">
              {loading
                ? t("Cargando...")
                : user?.email || t("Usuario")}
            </span>
          </div>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between">
            <span className="break-words">{t(error)}</span>

            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex min-h-9 items-center gap-2 self-start rounded-lg px-3 font-semibold transition hover:bg-red-100 disabled:opacity-50 sm:self-auto"
            >
              <Icon name="refresh" size={15} />
              {t("Reintentar")}
            </button>
          </div>
        )}

        {/* SUCCESS MESSAGE */}

        {message && (
          <div className="mb-4 flex flex-col gap-2 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 sm:flex-row sm:items-center sm:justify-between">
            <span>{t(message)}</span>

            {latestTranscriptionId && (
              <Link
                href={`/dashboard/${latestTranscriptionId}`}
                className="inline-flex min-h-9 items-center gap-2 self-start rounded-lg px-2 font-semibold text-emerald-800 transition hover:bg-emerald-100"
              >
                <Icon name="file" size={15} />
                {t("Ver reporte de procesamiento →")}
              </Link>
            )}
          </div>
        )}

        {/* TRANSCRIPTION STATISTICS */}

        <section
          id="statistics"
          className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4"
        >
          {transcriptionStats.map((stat) => (
            <div
              key={stat.label}
              className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}
              >
                <Icon name={stat.icon} size={18} />
              </div>

              <div className="min-w-0">
                <p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">
                  {t(stat.label)}
                </p>

                <p className={`mt-0.5 text-xl font-bold leading-tight ${stat.color}`}>
                  {loading ? "..." : stat.value}
                </p>
              </div>
            </div>
          ))}
        </section>

        {/* USAGE STATISTICS */}

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              {t("Consumo total")}
            </p>

            <p className="mt-1 text-xl font-bold text-blue-600">
              {loading
                ? "..."
                : `${Number(usage?.total_minutes || 0).toFixed(2)} ${t("min")}`}
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {t("Desde la creación de tu cuenta")}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              {t("Consumo este mes")}
            </p>

            <p className="mt-1 text-xl font-bold text-indigo-600">
              {loading
                ? "..."
                : `${(
                    Number(usage?.current_month_seconds || 0) / 60
                  ).toFixed(2)} ${t("min")}`}
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {t("Minutos procesados durante este mes")}
            </p>
          </div>

          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm">
            <p className="text-xs font-medium text-slate-500">
              {t("Audios contabilizados")}
            </p>

            <p className="mt-1 text-xl font-bold text-emerald-600">
              {loading ? "..." : usage?.transcription_count ?? 0}
            </p>

            <p className="mt-1 text-[11px] text-slate-400">
              {t("Transcripciones procesadas correctamente")}
            </p>
          </div>
        </section>

        {/* NEW TRANSCRIPTION */}

        <section className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start gap-3">
            <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600">
              <Icon name="upload" size={18} />
            </div>

            <div>
              <h2 className="text-base font-bold">
                {t("Nueva transcripción")}
              </h2>

              <p className="mt-0.5 text-xs text-slate-500 sm:text-sm">
                {t("Selecciona un archivo de audio para convertirlo en texto.")}
              </p>
            </div>
          </div>

          <form
            onSubmit={handleUpload}
            className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]"
          >
            <div className="min-w-0">
              <label
                htmlFor="audio-file"
                className="mb-1.5 block text-xs font-semibold text-slate-600"
              >
                {t("Archivo")}
              </label>

              <input
                id="audio-file"
                type="file"
                accept=".mp3,.wav,.m4a,.flac,.ogg,.mp4"
                disabled={uploading}
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0] || null)
                }
                className="block min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700"
              />

              {selectedFile && (
                <p className="mt-1.5 break-all text-[11px] text-slate-500">
                  {selectedFile.name}
                </p>
              )}
            </div>

            <div>
              <label
                htmlFor="transcription-language"
                className="mb-1.5 block text-xs font-semibold text-slate-600"
              >
                {t("Idioma")}
              </label>

              <select
                id="transcription-language"
                value={language}
                onChange={(e) => setLanguage(e.target.value)}
                disabled={uploading}
                className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                aria-label={t("Idioma de transcripción")}
              >
                <option value="es">{t("Español")}</option>
                <option value="en">{t("Inglés")}</option>
                <option value="pt">{t("Portugués")}</option>
                <option value="fr">{t("Francés")}</option>
                <option value="de">{t("Alemán")}</option>
                <option value="it">{t("Italiano")}</option>
                <option value="auto">{t("Automático")}</option>
              </select>
            </div>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto"
            >
              {uploading ? (
                <>
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
                  {t("Procesando audio...")}
                </>
              ) : (
                <>
                  <Icon name="audio" size={17} />
                  {t("Transcribir audio")}
                </>
              )}
            </button>
          </form>

          {uploading && (
            <div className="mt-4">
              <div className="mb-2 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between">
                <span>{t("Procesando tu archivo...")}</span>
                <span>{t("Esto puede tardar varios minutos.")}</span>
              </div>

              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" />
              </div>
            </div>
          )}
        </section>

        {/* TRANSCRIPTION HISTORY */}

        <section
          id="history"
          className="overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm"
        >
          <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
            <div>
              <h2 className="text-base font-bold">
                {t("Historial de transcripciones")}
              </h2>

              <p className="mt-0.5 text-xs text-slate-500">
                {t("Consulta y administra tus archivos.")}
              </p>
            </div>

            <button
              type="button"
              onClick={loadDashboard}
              disabled={loading}
              className="inline-flex min-h-9 items-center justify-center gap-2 self-start rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-50 disabled:opacity-50 sm:self-auto"
            >
              <Icon name="refresh" size={15} />
              {loading ? t("Cargando...") : t("Actualizar")}
            </button>
          </div>

          {loading ? (
            <div className="px-4 py-10 text-center text-sm text-slate-400">
              {t("Cargando transcripciones...")}
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="px-4 py-10 text-center">
              <div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400">
                <Icon name="audio" size={22} />
              </div>

              <p className="text-sm font-medium text-slate-600">
                {t("Todavía no tienes transcripciones.")}
              </p>

              <p className="mt-1 text-xs text-slate-400">
                {t("Sube tu primer audio para comenzar.")}
              </p>
            </div>
          ) : (
            <>
              {/* MOBILE HISTORY CARDS */}

              <div className="divide-y divide-slate-100 md:hidden">
                {transcriptions.map((item) => {
                  const status = getStatus(item);

                  return (
                    <article key={item.id} className="space-y-3 px-4 py-3.5">
                      <div className="flex min-w-0 items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <p className="break-words text-sm font-semibold text-slate-800">
                            {item.filename}
                          </p>

                          <p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400">
                            <Icon name="calendar" size={12} />
                            {formatDate(item.created_at)}
                          </p>
                        </div>

                        <span
                          className={`inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${status.className}`}
                        >
                          <Icon name={status.icon} size={11} />
                          {status.label}
                        </span>
                      </div>

                      <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500">
                        <span>
                          <span className="text-slate-400">
                            {t("Idioma")}:{" "}
                          </span>
                          {item.language || "--"}
                        </span>

                        <span>
                          <span className="text-slate-400">
                            {t("Duración")}:{" "}
                          </span>
                          {formatDuration(item.duration)}
                        </span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                        <Link
                          href={`/dashboard/${item.id}`}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-700 transition hover:bg-blue-100"
                        >
                          <Icon name="file" size={14} />
                          {t("Ver reporte")}
                        </Link>

                        {item.status === "completed" && (
                          <button
                            type="button"
                            onClick={() => handleDownload(item.id)}
                            className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 transition hover:bg-slate-100"
                          >
                            <Icon name="download" size={14} />
                            {t("Descargar")}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => handleDelete(item.id)}
                          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-red-500 transition hover:bg-red-50"
                        >
                          <Icon name="trash" size={14} />
                          {t("Eliminar")}
                        </button>
                      </div>
                    </article>
                  );
                })}
              </div>

              {/* DESKTOP TABLE */}

              <div className="hidden overflow-x-auto md:block">
                <table className="w-full min-w-[780px] text-xs">
                  <thead className="bg-slate-50 text-slate-500">
                    <tr>
                      <th className="px-5 py-3 text-left font-semibold">
                        {t("Archivo")}
                      </th>

                      <th className="px-4 py-3 text-left font-semibold">
                        {t("Idioma")}
                      </th>

                      <th className="px-4 py-3 text-left font-semibold">
                        {t("Duración")}
                      </th>

                      <th className="px-4 py-3 text-left font-semibold">
                        {t("Fecha")}
                      </th>

                      <th className="px-4 py-3 text-left font-semibold">
                        {t("Estado")}
                      </th>

                      <th className="px-5 py-3 text-right font-semibold">
                        {t("Acciones")}
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {transcriptions.map((item) => {
                      const status = getStatus(item);

                      return (
                        <tr
                          key={item.id}
                          className="transition hover:bg-slate-50/70"
                        >
                          <td className="max-w-[280px] break-words px-5 py-3 font-medium text-slate-700">
                            {item.filename}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {item.language || "--"}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {formatDuration(item.duration)}
                          </td>

                          <td className="px-4 py-3 text-slate-500">
                            {formatDate(item.created_at)}
                          </td>

                          <td className="px-4 py-3">
                            <span
                              className={`inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${status.className}`}
                            >
                              <Icon name={status.icon} size={11} />
                              {status.label}
                            </span>
                          </td>

                          <td className="whitespace-nowrap px-5 py-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <Link
                                href={`/dashboard/${item.id}`}
                                title={t("Ver reporte")}
                                aria-label={t("Ver reporte")}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-blue-600 transition hover:bg-blue-50"
                              >
                                <Icon name="file" size={16} />
                              </Link>

                              {item.status === "completed" && (
                                <button
                                  type="button"
                                  onClick={() => handleDownload(item.id)}
                                  title={t("Descargar")}
                                  aria-label={t("Descargar")}
                                  className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-500 transition hover:bg-slate-100 hover:text-blue-600"
                                >
                                  <Icon name="download" size={16} />
                                </button>
                              )}

                              <button
                                type="button"
                                onClick={() => handleDelete(item.id)}
                                title={t("Eliminar")}
                                aria-label={t("Eliminar")}
                                className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-slate-400 transition hover:bg-red-50 hover:text-red-600"
                              >
                                <Icon name="trash" size={16} />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </section>

        {/* FOOTER */}

        <footer className="pb-3 pt-6 text-center text-[11px] text-slate-400">
          © 2026 AudioNet. {t("Todos los derechos reservados.")}
        </footer>
      </div>
    </main>
  );
}