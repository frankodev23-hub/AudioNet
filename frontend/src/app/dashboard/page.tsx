"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
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

      // USER
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

      // TRANSCRIPTION HISTORY
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

      // USAGE
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

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
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
    if (!window.confirm(t("¿Estás seguro de eliminar esta transcripción?"))) {
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
        window.open(result.download_url, "_blank", "noopener,noreferrer");
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
  // LOGOUT
  // --------------------------------------------------

  function handleLogout() {
    localStorage.removeItem("audionet_access_token");
    localStorage.removeItem("audionet_refresh_token");

    window.location.href = "/";
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

  // --------------------------------------------------
  // RENDER
  // --------------------------------------------------

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#17233D]">
      {/* HEADER */}

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
              A
            </div>

            <span className="text-2xl font-bold">AudioNet</span>
          </div>

          <div className="flex items-center gap-5">
            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold">
                {loading ? t("Cargando...") : user?.email || t("Usuario")}
              </p>

              <p className="text-xs text-slate-400">
                {t("Mi cuenta")}
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-slate-500 hover:text-red-600"
            >
              {t("Cerrar sesión")}
            </button>
          </div>
        </div>
      </header>

      {/* MAIN CONTENT */}

      <div className="max-w-7xl mx-auto px-6 py-10">
        {/* TITLE */}

        <div className="mb-9">
          <h1 className="text-3xl font-bold">
            {t("Panel de control")}
          </h1>

          <p className="text-slate-500 mt-2">
            {t("Administra tus audios y transcripciones desde un solo lugar.")}
          </p>
        </div>

        {/* ERROR */}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm flex justify-between items-center gap-4">
            <span>{t(error)}</span>

            <button
              onClick={loadDashboard}
              disabled={loading}
              className="font-semibold underline whitespace-nowrap"
            >
              {t("Reintentar")}
            </button>
          </div>
        )}

        {/* SUCCESS MESSAGE */}

        {message && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <span>{t(message)}</span>

            {latestTranscriptionId && (
              <Link
                href={`/dashboard/${latestTranscriptionId}`}
                className="font-semibold text-green-800 underline"
              >
                {t("Ver reporte de procesamiento →")}
              </Link>
            )}
          </div>
        )}

        {/* TRANSCRIPTION STATISTICS */}

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5 mb-10">
          {[
            {
              label: "Total de audios",
              value: transcriptions.length,
              color: "text-blue-600",
            },
            {
              label: "Completados",
              value: completed,
              color: "text-green-600",
            },
            {
              label: "En proceso",
              value: processing,
              color: "text-amber-600",
            },
            {
              label: "Con errores",
              value: failed,
              color: "text-red-600",
            },
          ].map((stat) => (
            <div
              key={stat.label}
              className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm"
            >
              <p className="text-sm text-slate-500">
                {t(stat.label)}
              </p>

              <p className={`text-3xl font-bold mt-3 ${stat.color}`}>
                {loading ? "..." : stat.value}
              </p>
            </div>
          ))}
        </div>

        {/* USAGE STATISTICS */}

        <section className="grid grid-cols-1 md:grid-cols-3 gap-5 mb-10">
          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">
              {t("Consumo total")}
            </p>

            <p className="text-3xl font-bold text-blue-600 mt-3">
              {loading
                ? "..."
                : `${Number(usage?.total_minutes || 0).toFixed(2)} ${t("min")}`}
            </p>

            <p className="text-xs text-slate-400 mt-2">
              {t("Desde la creación de tu cuenta")}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">
              {t("Consumo este mes")}
            </p>

            <p className="text-3xl font-bold text-indigo-600 mt-3">
              {loading
                ? "..."
                : `${(
                    Number(usage?.current_month_seconds || 0) / 60
                  ).toFixed(2)} ${t("min")}`}
            </p>

            <p className="text-xs text-slate-400 mt-2">
              {t("Minutos procesados durante este mes")}
            </p>
          </div>

          <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
            <p className="text-sm text-slate-500">
              {t("Audios contabilizados")}
            </p>

            <p className="text-3xl font-bold text-green-600 mt-3">
              {loading ? "..." : usage?.transcription_count ?? 0}
            </p>

            <p className="text-xs text-slate-400 mt-2">
              {t("Transcripciones procesadas correctamente")}
            </p>
          </div>
        </section>

        {/* NEW TRANSCRIPTION */}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-10">
          <div className="mb-6">
            <h2 className="text-xl font-bold">
              {t("Nueva transcripción")}
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              {t("Selecciona un archivo de audio para convertirlo en texto.")}
            </p>
          </div>

          <form
            onSubmit={handleUpload}
            className="flex flex-col lg:flex-row gap-4"
          >
            <div className="flex-1">
              <input
                id="audio-file"
                type="file"
                accept=".mp3,.wav,.m4a,.flac,.ogg,.mp4"
                disabled={uploading}
                onChange={(e) =>
                  setSelectedFile(e.target.files?.[0] || null)
                }
                className="w-full border border-slate-200 rounded-xl p-3 text-sm bg-slate-50"
              />
            </div>

            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
              disabled={uploading}
              className="border border-slate-200 rounded-xl px-4 py-3 bg-white text-sm"
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

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading
                ? t("Procesando audio...")
                : t("Transcribir audio")}
            </button>
          </form>

          {uploading && (
            <div className="mt-5">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>{t("Procesando tu archivo...")}</span>
                <span>{t("Esto puede tardar varios minutos.")}</span>
              </div>

              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-blue-600 rounded-full animate-pulse" />
              </div>
            </div>
          )}
        </section>

        {/* TRANSCRIPTION HISTORY */}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">
          <div className="p-6 border-b border-slate-100 flex justify-between items-center">
            <div>
              <h2 className="text-xl font-bold">
                {t("Historial de transcripciones")}
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                {t("Consulta y administra tus archivos.")}
              </p>
            </div>

            <button
              onClick={loadDashboard}
              disabled={loading}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              {loading ? t("Cargando...") : t("Actualizar")}
            </button>
          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">
              {t("Cargando transcripciones...")}
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 text-lg">
                {t("Todavía no tienes transcripciones.")}
              </p>

              <p className="text-sm text-slate-400 mt-2">
                {t("Sube tu primer audio para comenzar.")}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-6 py-4 font-semibold">
                      {t("Archivo")}
                    </th>
                    <th className="text-left px-6 py-4 font-semibold">
                      {t("Idioma")}
                    </th>
                    <th className="text-left px-6 py-4 font-semibold">
                      {t("Duración")}
                    </th>
                    <th className="text-left px-6 py-4 font-semibold">
                      {t("Fecha")}
                    </th>
                    <th className="text-left px-6 py-4 font-semibold">
                      {t("Estado")}
                    </th>
                    <th className="text-right px-6 py-4 font-semibold">
                      {t("Acciones")}
                    </th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">
                  {transcriptions.map((item) => (
                    <tr key={item.id} className="hover:bg-slate-50">
                      <td className="px-6 py-4 font-semibold text-slate-700">
                        {item.filename}
                      </td>

                      <td className="px-6 py-4 text-slate-500">
                        {item.language || "--"}
                      </td>

                      <td className="px-6 py-4 text-slate-500">
                        {formatDuration(item.duration)}
                      </td>

                      <td className="px-6 py-4 text-slate-500">
                        {formatDate(item.created_at)}
                      </td>

                      <td className="px-6 py-4">
                        <span
                          className={`px-3 py-1 rounded-full text-xs font-semibold ${
                            item.status === "completed"
                              ? "bg-green-100 text-green-700"
                              : item.status === "processing"
                              ? "bg-amber-100 text-amber-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {item.status === "completed"
                            ? t("Completado")
                            : item.status === "processing"
                            ? t("Procesando")
                            : t("Error")}
                        </span>
                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <Link
                          href={`/dashboard/${item.id}`}
                          className="text-slate-700 hover:text-blue-600 font-semibold mr-4"
                        >
                          {t("Ver reporte")}
                        </Link>

                        {item.status === "completed" && (
                          <button
                            onClick={() => handleDownload(item.id)}
                            className="text-blue-600 hover:text-blue-800 font-semibold mr-4"
                          >
                            {t("Descargar")}
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-red-500 hover:text-red-700 font-semibold"
                        >
                          {t("Eliminar")}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        {/* FOOTER */}

        <footer className="text-center text-xs text-slate-400 mt-10">
          © 2026 AudioNet. {t("Todos los derechos reservados.")}
        </footer>
      </div>
    </main>
  );
}