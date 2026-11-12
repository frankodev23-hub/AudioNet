"use client";

import { useEffect, useState } from "react";

interface Transcription {
  id: string;
  filename: string;
  status: string;
  language?: string;
  duration?: number;
  transcript_text?: string;
  created_at?: string;
  completed_at?: string;
}

interface User {
  id: string;
  email: string;
}

export default function DashboardPage() {
  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  const [user, setUser] = useState<User | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const token =
    typeof window !== "undefined"
      ? localStorage.getItem("audionet_access_token")
      : null;

  async function apiRequest(endpoint: string, options: RequestInit = {}) {
    const response = await fetch(`${API_URL}${endpoint}`, {
      ...options,
      headers: {
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });

    if (response.status === 401) {
      localStorage.removeItem("audionet_access_token");
      localStorage.removeItem("audionet_refresh_token");
      window.location.href = "/";
      throw new Error("Sesion expirada");
    }

    return response;
  }

  async function loadDashboard() {
    setLoading(true);
    setError("");

    try {
      const [userResponse, historyResponse] = await Promise.all([
        apiRequest("/auth/me"),
        apiRequest("/transcriptions?limit=100&offset=0"),
      ]);

      if (!userResponse.ok || !historyResponse.ok) {
        throw new Error("No se pudieron cargar los datos");
      }

      const userData = await userResponse.json();
      const historyData = await historyResponse.json();

      setUser(userData);
      setTranscriptions(historyData.transcriptions || []);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error de conexion"
      );
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    if (!localStorage.getItem("audionet_access_token")) {
      window.location.href = "/";
      return;
    }

    loadDashboard();
  }, []);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    if (!selectedFile) {
      setError("Selecciona un archivo de audio");
      return;
    }

    setUploading(true);
    setError("");
    setMessage("");

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

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          typeof data.detail === "string"
            ? data.detail
            : "No se pudo procesar el audio"
        );
      }

      setMessage("Audio transcrito correctamente.");
      setSelectedFile(null);

      const input = document.getElementById(
        "audio-file"
      ) as HTMLInputElement;

      if (input) input.value = "";

      await loadDashboard();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al procesar el audio"
      );
    } finally {
      setUploading(false);
    }
  }

  async function handleDelete(id: string) {
    if (!confirm("¿Estas seguro de eliminar esta transcripcion?")) {
      return;
    }

    try {
      const response = await apiRequest(`/transcriptions/${id}`, {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("No se pudo eliminar la transcripcion");
      }

      setTranscriptions((current) =>
        current.filter((item) => item.id !== id)
      );

      setMessage("Transcripcion eliminada correctamente.");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error al eliminar"
      );
    }
  }

  async function handleDownload(id: string) {
    try {
      const response = await apiRequest(
        `/transcriptions/${id}/download`
      );

      if (!response.ok) {
        throw new Error("No se pudo obtener el archivo");
      }

      const data = await response.json();
      window.open(data.download_url, "_blank");
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Error de descarga"
      );
    }
  }

  function handleLogout() {
    localStorage.removeItem("audionet_access_token");
    localStorage.removeItem("audionet_refresh_token");
    window.location.href = "/";
  }

  function formatDuration(seconds?: number) {
    if (seconds === undefined || seconds === null) return "--";

    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.floor(seconds % 60);

    return `${minutes}m ${remainingSeconds}s`;
  }

  function formatDate(date?: string) {
    if (!date) return "--";

    return new Date(date).toLocaleDateString("es-ES", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  }

  const completed = transcriptions.filter(
    (item) => item.status === "completed"
  ).length;

  const processing = transcriptions.filter(
    (item) => item.status === "processing"
  ).length;

  const failed = transcriptions.filter(
    (item) => item.status === "failed"
  ).length;

  return (
    <main className="min-h-screen bg-[#F5F7FB] text-[#17233D]">

      {/* HEADER */}

      <header className="bg-white border-b border-slate-200">
        <div className="max-w-7xl mx-auto px-6 py-5 flex justify-between items-center">

          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
              A
            </div>

            <span className="text-2xl font-bold">
              AudioNet
            </span>
          </div>

          <div className="flex items-center gap-5">

            <div className="hidden sm:block text-right">
              <p className="text-sm font-semibold">
                {user?.email || "Cargando..."}
              </p>

              <p className="text-xs text-slate-400">
                Mi cuenta
              </p>
            </div>

            <button
              onClick={handleLogout}
              className="text-sm font-semibold text-slate-500 hover:text-red-600"
            >
              Cerrar sesion
            </button>

          </div>
        </div>
      </header>

      {/* CONTENT */}

      <div className="max-w-7xl mx-auto px-6 py-10">

        <div className="mb-9">
          <h1 className="text-3xl font-bold">
            Panel de control
          </h1>

          <p className="text-slate-500 mt-2">
            Administra tus audios y transcripciones desde un solo lugar.
          </p>
        </div>

        {/* ALERTS */}

        {error && (
          <div className="mb-6 p-4 rounded-xl bg-red-50 border border-red-200 text-red-700 text-sm">
            {error}
          </div>
        )}

        {message && (
          <div className="mb-6 p-4 rounded-xl bg-green-50 border border-green-200 text-green-700 text-sm">
            {message}
          </div>
        )}

        {/* STATISTICS */}

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
                {stat.label}
              </p>

              <p className={`text-3xl font-bold mt-3 ${stat.color}`}>
                {loading ? "..." : stat.value}
              </p>
            </div>
          ))}

        </div>

        {/* UPLOAD */}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 mb-10">

          <div className="mb-6">
            <h2 className="text-xl font-bold">
              Nueva transcripcion
            </h2>

            <p className="text-sm text-slate-500 mt-1">
              Selecciona un archivo de audio para convertirlo en texto.
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
            >
              <option value="es">Español</option>
              <option value="en">Ingles</option>
              <option value="pt">Portugues</option>
              <option value="fr">Frances</option>
              <option value="de">Aleman</option>
              <option value="it">Italiano</option>
              <option value="auto">Automatico</option>
            </select>

            <button
              type="submit"
              disabled={uploading || !selectedFile}
              className="px-8 py-3 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {uploading ? "Procesando audio..." : "Transcribir audio"}
            </button>

          </form>

          {uploading && (
            <div className="mt-5">
              <div className="flex justify-between text-sm text-slate-500 mb-2">
                <span>Procesando tu archivo...</span>
                <span>Esto puede tardar varios minutos.</span>
              </div>

              <div className="h-2 bg-slate-100 rounded-full overflow-hidden">
                <div className="h-full w-1/2 bg-blue-600 rounded-full animate-pulse" />
              </div>
            </div>
          )}

        </section>

        {/* HISTORY */}

        <section className="bg-white rounded-2xl border border-slate-200 shadow-sm">

          <div className="p-6 border-b border-slate-100 flex justify-between items-center">

            <div>
              <h2 className="text-xl font-bold">
                Historial de transcripciones
              </h2>

              <p className="text-sm text-slate-500 mt-1">
                Consulta y administra tus archivos.
              </p>
            </div>

            <button
              onClick={loadDashboard}
              disabled={loading}
              className="text-sm font-semibold text-blue-600 hover:text-blue-800 disabled:opacity-50"
            >
              Actualizar
            </button>

          </div>

          {loading ? (
            <div className="p-12 text-center text-slate-400">
              Cargando transcripciones...
            </div>
          ) : transcriptions.length === 0 ? (
            <div className="p-12 text-center">
              <p className="text-slate-400 text-lg">
                Todavia no tienes transcripciones.
              </p>

              <p className="text-sm text-slate-400 mt-2">
                Sube tu primer audio para comenzar.
              </p>
            </div>
          ) : (

            <div className="overflow-x-auto">

              <table className="w-full text-sm">

                <thead className="bg-slate-50 text-slate-500">
                  <tr>
                    <th className="text-left px-6 py-4 font-semibold">
                      Archivo
                    </th>

                    <th className="text-left px-6 py-4 font-semibold">
                      Idioma
                    </th>

                    <th className="text-left px-6 py-4 font-semibold">
                      Duracion
                    </th>

                    <th className="text-left px-6 py-4 font-semibold">
                      Fecha
                    </th>

                    <th className="text-left px-6 py-4 font-semibold">
                      Estado
                    </th>

                    <th className="text-right px-6 py-4 font-semibold">
                      Acciones
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
                            ? "Completado"
                            : item.status === "processing"
                            ? "Procesando"
                            : "Error"}
                        </span>

                      </td>

                      <td className="px-6 py-4 text-right whitespace-nowrap">
                        <button
  onClick={() =>
    window.location.href = `/dashboard/${item.id}`
  }
  className="text-slate-700 hover:text-blue-600 font-semibold mr-4"
>
  Ver
</button>

                        {item.status === "completed" && (
                          <button
                            onClick={() => handleDownload(item.id)}
                            className="text-blue-600 hover:text-blue-800 font-semibold mr-4"
                          >
                            Descargar
                          </button>
                        )}

                        <button
                          onClick={() => handleDelete(item.id)}
                          className="text-red-500 hover:text-red-700 font-semibold"
                        >
                          Eliminar
                        </button>

                      </td>

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          )}

        </section>

        <footer className="text-center text-xs text-slate-400 mt-10">
          © 2026 AudioNet. Todos los derechos reservados.
        </footer>

      </div>

    </main>
  );
}