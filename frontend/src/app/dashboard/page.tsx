"use client";

import { useCallback, useEffect, useState, type FormEvent } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";

interface Tag {
  id: string;
  name: string;
  color?: string;
}

interface Category {
  id: string;
  name: string;
  color?: string;
}

interface Folder {
  id: string;
  name: string;
  description?: string | null;
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
  word_count?: number;
  folder_id?: string | null;
  category_id?: string | null;
  tags?: Tag[];
  category?: Category | null;
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

type ViewMode = "all" | "trash" | "folder" | "category" | "tag";

function Icon({ name, size = 18 }: { name: string; size?: number }) {
  const common = {
    width: size, height: size, viewBox: "0 0 24 24", fill: "none",
    stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const, "aria-hidden": true as const,
  };
  switch (name) {
    case "audio": return <svg {...common}><path d="M3 10v4M7 6v12M11 3v18M15 7v10M19 10v4M23 9v6" /></svg>;
    case "check": return <svg {...common}><path d="m5 12 4 4L19 6" /></svg>;
    case "clock": return <svg {...common}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>;
    case "alert": return <svg {...common}><path d="M12 9v4M12 17h.01" /><circle cx="12" cy="12" r="9" /></svg>;
    case "refresh": return <svg {...common}><path d="M20 7v5h-5M4 17v-5h5" /><path d="M5.6 9a7 7 0 0 1 11.6-2L20 12M4 12l2.8 5a7 7 0 0 0 11.6-2" /></svg>;
    case "upload": return <svg {...common}><path d="M12 16V4m-5 5 5-5 5 5" /><path d="M4 16v4h16v-4" /></svg>;
    case "download": return <svg {...common}><path d="M12 4v12m-5-5 5 5 5-5" /><path d="M4 19v1h16v-1" /></svg>;
    case "file": return <svg {...common}><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6M8 13h8M8 17h8" /></svg>;
    case "trash": return <svg {...common}><path d="M3 6h18M8 6V4h8v2m3 0-1 14H6L5 6" /><path d="M10 11v5M14 11v5" /></svg>;
    case "user": return <svg {...common}><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></svg>;
    case "calendar": return <svg {...common}><rect x="3" y="5" width="18" height="16" rx="2" /><path d="M16 3v4M8 3v4M3 10h18" /></svg>;
    case "folder": return <svg {...common}><path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" /></svg>;
    case "tag": return <svg {...common}><path d="M20 13 13 20 3 10V3h7z" /><circle cx="7.5" cy="7.5" r="1" /></svg>;
    case "copy": return <svg {...common}><rect x="8" y="8" width="12" height="12" rx="2" /><path d="M16 8V5a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h3" /></svg>;
    case "plus": return <svg {...common}><path d="M12 5v14M5 12h14" /></svg>;
    case "restore": return <svg {...common}><path d="M3 12a9 9 0 1 0 3-6.7L3 8" /><path d="M3 3v5h5M12 7v5l3 2" /></svg>;
    default: return null;
  }
}

export default function DashboardPage() {
  const { t, locale } = useLanguage();
  const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";
  const backgroundTranscription = process.env.NEXT_PUBLIC_ASYNC_TRANSCRIPTION === "true";

  const [usage, setUsage] = useState<Usage | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [transcriptions, setTranscriptions] = useState<Transcription[]>([]);
  const [trashItems, setTrashItems] = useState<Transcription[]>([]);
  const [folders, setFolders] = useState<Folder[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [tags, setTags] = useState<Tag[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [language, setLanguage] = useState("es");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [uploadReceipt, setUploadReceipt] = useState<{ id: string; status: string } | null>(null);
  const [viewMode, setViewMode] = useState<ViewMode>("all");
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [search, setSearch] = useState("");
  const [showOrganizer, setShowOrganizer] = useState(false);
  const [newName, setNewName] = useState("");
  const [newDescription, setNewDescription] = useState("");
  const [newColor, setNewColor] = useState("#64748b");
  const [organizerType, setOrganizerType] = useState<"folder" | "category" | "tag">("folder");
  const [busyId, setBusyId] = useState("");
  const hasProcessing = transcriptions.some((item) => item.status === "processing");
  const uploadStatus = uploadReceipt && (
    transcriptions.find((item) => item.id === uploadReceipt.id)?.status ?? uploadReceipt.status
  );

  const apiRequest = useCallback(async (endpoint: string, options: RequestInit = {}): Promise<Response> => {
    const token = localStorage.getItem("audionet_access_token");
    if (!token) {
      window.location.href = "/";
      throw new Error("Sesión no válida");
    }
    const headers = new Headers(options.headers);
    headers.set("Authorization", `Bearer ${token}`);
    const response = await fetch(`${API_URL}${endpoint}`, { ...options, headers });
    if (response.status === 401) {
      localStorage.removeItem("audionet_access_token");
      localStorage.removeItem("audionet_refresh_token");
      window.location.href = "/";
      throw new Error("Sesión expirada");
    }
    return response;
  }, [API_URL]);

  async function requestJson(endpoint: string, options: RequestInit = {}) {
    const response = await apiRequest(endpoint, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(typeof data.detail === "string" ? data.detail : "No se pudo completar la operación.");
    }
    return data;
  }

  const loadDashboard = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const results = await Promise.allSettled([
        apiRequest("/auth/me"),
        apiRequest("/transcriptions?limit=100&offset=0"),
        apiRequest("/usage/me"),
        apiRequest("/folders"),
        apiRequest("/categories"),
        apiRequest("/tags"),
      ]);
      const [u, h, us, f, c, tg] = results;
      let hasErrors = false;
      if (u.status === "fulfilled" && u.value.ok) setUser(await u.value.json()); else { setUser(null); hasErrors = true; }
      if (h.status === "fulfilled" && h.value.ok) {
        const d = await h.value.json();
        setTranscriptions(Array.isArray(d.transcriptions) ? d.transcriptions : []);
      } else { setTranscriptions([]); hasErrors = true; }
      if (us.status === "fulfilled" && us.value.ok) setUsage(await us.value.json()); else { setUsage(null); hasErrors = true; }
      if (f.status === "fulfilled" && f.value.ok) { const d = await f.value.json(); setFolders(Array.isArray(d.folders) ? d.folders : []); } else hasErrors = true;
      if (c.status === "fulfilled" && c.value.ok) { const d = await c.value.json(); setCategories(Array.isArray(d.categories) ? d.categories : []); } else hasErrors = true;
      if (tg.status === "fulfilled" && tg.value.ok) { const d = await tg.value.json(); setTags(Array.isArray(d.tags) ? d.tags : []); } else hasErrors = true;
      if (hasErrors) setError("Algunos datos no pudieron cargarse. Puedes intentarlo nuevamente.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error de conexión con el servidor.");
    } finally { setLoading(false); }
  }, [apiRequest]);

  const loadTrash = useCallback(async () => {
    try {
      const data = await requestJson("/transcriptions/trash?limit=100&offset=0");
      setTrashItems(Array.isArray(data.transcriptions) ? data.transcriptions : []);
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo cargar la papelera."); }
  }, [API_URL]);

  useEffect(() => {
    if (!localStorage.getItem("audionet_access_token")) { window.location.href = "/"; return; }
    loadDashboard();
  }, [loadDashboard]);

  useEffect(() => { if (viewMode === "trash") loadTrash(); }, [viewMode, loadTrash]);

  useEffect(() => {
    if (!hasProcessing) return;
    let timer: ReturnType<typeof setTimeout>;
    let active = true;
    const controller = new AbortController();

    async function refreshProcessing() {
      try {
        const [history, consumption] = await Promise.all([
          apiRequest("/transcriptions?limit=100&offset=0", { signal: controller.signal }),
          apiRequest("/usage/me", { signal: controller.signal }),
        ]);
        if (history.ok) {
          const { transcriptions: items } = await history.json();
          if (active && Array.isArray(items)) setTranscriptions(items);
        }
        if (consumption.ok) {
          const usage = await consumption.json();
          if (active) setUsage(usage);
        }
      } catch {
        // Se vuelve a consultar si se interrumpe la conexión.
      } finally {
        if (active) timer = setTimeout(refreshProcessing, 7000);
      }
    }

    timer = setTimeout(refreshProcessing, 7000);
    return () => {
      active = false;
      clearTimeout(timer);
      controller.abort();
    };
  }, [apiRequest, hasProcessing]);

  async function handleUpload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!selectedFile) { setError("Selecciona un archivo de audio."); return; }
    setUploading(true);
    setError("");
    setMessage("");
    setUploadReceipt(null);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      const response = await apiRequest(`/upload-and-transcribe?language=${language}&background=${backgroundTranscription}`, { method: "POST", body: formData });
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.detail === "string" ? result.detail : "No se pudo procesar el audio.");
      setUploadReceipt({ id: result.id, status: result.status });
      setSelectedFile(null);
      const input = document.getElementById("audio-file") as HTMLInputElement | null;
      if (input) input.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Error al procesar el audio.");
      return;
    } finally {
      setUploading(false);
    }
    await loadDashboard();
  }

  async function handleDelete(id: string) {
    if (!window.confirm(t("¿Estás seguro de enviar esta transcripción a la papelera?"))) return;
    try {
      await requestJson(`/transcriptions/${id}`, { method: "DELETE" });
      setTranscriptions((current) => current.filter((item) => item.id !== id));
      setMessage("Transcripción enviada a la papelera.");
    } catch (err) { setError(err instanceof Error ? err.message : "Error al eliminar."); }
  }

  async function handleDownload(id: string) {
    try {
      const data = await requestJson(`/transcriptions/${id}/download`);
      if (!data.download_url) throw new Error("No se recibió el enlace de descarga.");
      window.open(data.download_url, "_blank", "noopener,noreferrer");
    } catch (err) { setError(err instanceof Error ? err.message : "Error de descarga."); }
  }

  async function handleDuplicate(item: Transcription) {
    const title = window.prompt("Nombre de la copia:", `Copia de ${item.filename}`);
    if (title === null) return;
    try {
      await requestJson(`/transcriptions/${item.id}/duplicate`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() || null }),
      });
      setMessage("Transcripción duplicada correctamente.");
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo duplicar."); }
  }

  async function createOrganizer(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!newName.trim()) return;
    const endpoint = organizerType === "folder" ? "/folders" : organizerType === "category" ? "/categories" : "/tags";
    const payload = organizerType === "folder"
      ? { name: newName.trim(), description: newDescription.trim() || null }
      : { name: newName.trim(), color: newColor };
    try {
      await requestJson(endpoint, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      setNewName(""); setNewDescription(""); setNewColor("#64748b");
      setMessage("Elemento creado correctamente.");
      setShowOrganizer(false);
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo crear."); }
  }

  async function deleteOrganizer(type: "folder" | "category" | "tag", id: string, name: string) {
    if (!window.confirm(`¿Eliminar "${name}"?`)) return;
    const endpoint = type === "folder" ? `/folders/${id}` : type === "category" ? `/categories/${id}` : `/tags/${id}`;
    try {
      await requestJson(endpoint, { method: "DELETE" });
      setMessage("Elemento eliminado.");
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar."); }
  }

  async function assignFolder(transcriptionId: string, folderId: string) {
    try {
      await requestJson(`/transcriptions/${transcriptionId}/folder`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ folder_id: folderId || null }),
      });
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo mover de carpeta."); }
  }

  async function assignCategory(transcriptionId: string, categoryId: string) {
    try {
      await requestJson(`/transcriptions/${transcriptionId}/category`, {
        method: "PATCH", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category_id: categoryId || null }),
      });
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo asignar la categoría."); }
  }

  async function toggleTag(transcriptionId: string, tagId: string, assigned: boolean) {
    try {
      if (assigned) await requestJson(`/transcriptions/${transcriptionId}/tags/${tagId}`, { method: "DELETE" });
      else await requestJson(`/transcriptions/${transcriptionId}/tags`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ tag_id: tagId }),
      });
      await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo actualizar la etiqueta."); }
  }

  async function restoreItem(id: string) {
    try {
      await requestJson(`/transcriptions/${id}/restore`, { method: "POST" });
      setMessage("Transcripción restaurada.");
      await loadTrash(); await loadDashboard();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo restaurar."); }
  }

  async function permanentlyDelete(id: string) {
    if (!window.confirm("Esta acción eliminará definitivamente la transcripción y su audio. ¿Continuar?")) return;
    try {
      await requestJson(`/transcriptions/${id}/permanent`, { method: "DELETE" });
      setMessage("Transcripción eliminada definitivamente.");
      await loadTrash();
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo eliminar definitivamente."); }
  }

  async function emptyTrash() {
    if (!trashItems.length) return;
    if (!window.confirm(`Se eliminarán definitivamente ${trashItems.length} elementos y sus audios. ¿Continuar?`)) return;
    try {
      await requestJson("/transcriptions/trash/empty", { method: "POST" });
      setTrashItems([]);
      setMessage("Papelera vaciada.");
    } catch (err) { setError(err instanceof Error ? err.message : "No se pudo vaciar la papelera."); }
  }

  function formatDuration(seconds?: number) {
    if (seconds === undefined || seconds === null) return "--";
    return `${Math.floor(seconds / 60)}${t("m")} ${Math.floor(seconds % 60)}${t("s")}`;
  }
  function formatDate(date?: string) {
    if (!date) return "--";
    return new Date(date).toLocaleDateString(locale === "en" ? "en-US" : "es-ES", { day: "2-digit", month: "short", year: "numeric" });
  }
  function getStatus(item: Transcription) {
    if (item.status === "completed") return { label: t("Completado"), className: "bg-emerald-50 text-emerald-700 border-emerald-100", icon: "check" };
    if (item.status === "processing") return { label: t("Procesando"), className: "bg-amber-50 text-amber-700 border-amber-100", icon: "clock" };
    return { label: t("Error"), className: "bg-red-50 text-red-700 border-red-100", icon: "alert" };
  }

  const completed = transcriptions.filter((x) => x.status === "completed").length;
  const processing = transcriptions.filter((x) => x.status === "processing").length;
  const failed = transcriptions.filter((x) => x.status === "failed").length;
  const transcriptionStats = [
    { label: "Total de audios", value: transcriptions.length, color: "text-blue-600", bg: "bg-blue-50", icon: "audio" },
    { label: "Completados", value: completed, color: "text-emerald-600", bg: "bg-emerald-50", icon: "check" },
    { label: "En proceso", value: processing, color: "text-amber-600", bg: "bg-amber-50", icon: "clock" },
    { label: "Con errores", value: failed, color: "text-red-600", bg: "bg-red-50", icon: "alert" },
  ];

  const sourceItems = viewMode === "trash" ? trashItems : transcriptions;
  const visibleItems = sourceItems.filter((item) => {
    const matchesSearch = item.filename.toLowerCase().includes(search.toLowerCase());
    if (!matchesSearch || viewMode === "trash") return matchesSearch;
    if (viewMode === "folder") return item.folder_id === selectedGroupId;
    if (viewMode === "category") return item.category_id === selectedGroupId;
    if (viewMode === "tag") return (item.tags || []).some((tag) => tag.id === selectedGroupId);
    return true;
  });
  const selectedTitle = viewMode === "trash" ? "Papelera"
    : viewMode === "folder" ? folders.find((x) => x.id === selectedGroupId)?.name || "Carpeta"
    : viewMode === "category" ? categories.find((x) => x.id === selectedGroupId)?.name || "Categoría"
    : viewMode === "tag" ? tags.find((x) => x.id === selectedGroupId)?.name || "Etiqueta"
    : "Historial de transcripciones";

  return (
    <main className="min-h-screen w-full overflow-x-hidden bg-[#F5F7FB] text-[#17233D]">
      <AppHeader />
      <div className="mx-auto w-full max-w-7xl px-4 py-5 sm:px-6 sm:py-7 lg:px-8">
        <div id="dashboard" className="mb-6 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-xl font-bold tracking-tight sm:text-2xl">{t("Panel de control")}</h1>
            <p className="mt-1 text-sm text-slate-500">{t("Administra tus audios y transcripciones desde un solo lugar.")}</p>
          </div>
          <div className="flex min-w-0 items-center gap-2 text-xs text-slate-500 sm:text-sm">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white text-slate-500 shadow-sm"><Icon name="user" size={16} /></span>
            <span className="min-w-0 truncate">{loading ? t("Cargando...") : user?.email || t("Usuario")}</span>
          </div>
        </div>

        {error && <div className="mb-4 flex flex-col gap-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 sm:flex-row sm:items-center sm:justify-between"><span className="break-words">{t(error)}</span><button type="button" onClick={loadDashboard} disabled={loading} className="inline-flex min-h-9 items-center gap-2 self-start rounded-lg px-3 font-semibold hover:bg-red-100 disabled:opacity-50 sm:self-auto"><Icon name="refresh" size={15} />{t("Reintentar")}</button></div>}
        {message && <div className="mb-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{t(message)}</div>}

        <section id="statistics" className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {transcriptionStats.map((stat) => <div key={stat.label} className="flex min-w-0 items-center gap-3 rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm sm:p-4"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${stat.bg} ${stat.color}`}><Icon name={stat.icon} size={18} /></div><div className="min-w-0"><p className="truncate text-[11px] font-medium text-slate-500 sm:text-xs">{t(stat.label)}</p><p className={`mt-0.5 text-xl font-bold leading-tight ${stat.color}`}>{loading ? "..." : stat.value}</p></div></div>)}
        </section>

        <section className="mb-6 grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium text-slate-500">{t("Consumo total")}</p><p className="mt-1 text-xl font-bold text-blue-600">{loading ? "..." : `${Number(usage?.total_minutes || 0).toFixed(2)} ${t("min")}`}</p><p className="mt-1 text-[11px] text-slate-400">{t("Desde la creación de tu cuenta")}</p></div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium text-slate-500">{t("Consumo este mes")}</p><p className="mt-1 text-xl font-bold text-indigo-600">{loading ? "..." : `${(Number(usage?.current_month_seconds || 0) / 60).toFixed(2)} ${t("min")}`}</p><p className="mt-1 text-[11px] text-slate-400">{t("Minutos procesados durante este mes")}</p></div>
          <div className="rounded-xl border border-slate-200/80 bg-white px-4 py-3 shadow-sm"><p className="text-xs font-medium text-slate-500">{t("Audios contabilizados")}</p><p className="mt-1 text-xl font-bold text-emerald-600">{loading ? "..." : usage?.transcription_count ?? 0}</p><p className="mt-1 text-[11px] text-slate-400">{t("Transcripciones procesadas correctamente")}</p></div>
        </section>

        <section className="mb-6 rounded-xl border border-slate-200/80 bg-white p-4 shadow-sm sm:p-5">
          <div className="mb-4 flex items-start gap-3"><div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-blue-50 text-blue-600"><Icon name="upload" size={18} /></div><div><h2 className="text-base font-bold">{t("Nueva transcripción")}</h2><p className="mt-0.5 text-xs text-slate-500 sm:text-sm">{t("Selecciona un archivo de audio para convertirlo en texto.")}</p></div></div>
          <form onSubmit={handleUpload} className="grid grid-cols-1 items-end gap-3 lg:grid-cols-[minmax(0,1fr)_180px_auto]">
            <div className="min-w-0"><label htmlFor="audio-file" className="mb-1.5 block text-xs font-semibold text-slate-600">{t("Archivo")}</label><input id="audio-file" type="file" accept=".mp3,.wav,.m4a,.flac,.ogg,.mp4" disabled={uploading} onChange={(e) => setSelectedFile(e.target.files?.[0] || null)} className="block min-h-11 w-full min-w-0 rounded-lg border border-slate-200 bg-slate-50 px-2 py-2 text-xs text-slate-600 file:mr-2 file:rounded-md file:border-0 file:bg-blue-50 file:px-2 file:py-1.5 file:text-xs file:font-semibold file:text-blue-700" />{selectedFile && <p className="mt-1.5 break-all text-[11px] text-slate-500">{selectedFile.name}</p>}</div>
            <div><label htmlFor="transcription-language" className="mb-1.5 block text-xs font-semibold text-slate-600">{t("Idioma")}</label><select id="transcription-language" value={language} onChange={(e) => setLanguage(e.target.value)} disabled={uploading} className="min-h-11 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"><option value="es">{t("Español")}</option><option value="en">{t("Inglés")}</option><option value="pt">{t("Portugués")}</option><option value="fr">{t("Francés")}</option><option value="de">{t("Alemán")}</option><option value="it">{t("Italiano")}</option><option value="auto">{t("Automático")}</option></select></div>
            <button type="submit" disabled={uploading || !selectedFile} className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-blue-700 disabled:cursor-not-allowed disabled:opacity-50 lg:w-auto">{uploading ? <><span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />{t(backgroundTranscription ? "Subiendo audio..." : "Procesando audio...")}</> : <><Icon name="audio" size={17} />{t("Transcribir audio")}</>}</button>
          </form>
          {uploading && <div className="mt-4"><div className="mb-2 flex flex-col gap-1 text-xs text-slate-500 sm:flex-row sm:justify-between"><span>{t(backgroundTranscription ? "Subiendo audio..." : "Procesando tu archivo...")}</span><span>{t(backgroundTranscription ? "Mantén esta página abierta hasta que termine la subida." : "Esto puede tardar varios minutos.")}</span></div><div className="h-1.5 overflow-hidden rounded-full bg-slate-100"><div className="h-full w-1/2 animate-pulse rounded-full bg-blue-600" /></div></div>}
          <div role="status">
            {uploadStatus === "processing" && (
              <p className="mt-4 rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-800">
                {t("Audio recibido. Puedes cerrar esta página mientras se transcribe.")}
              </p>
            )}
            {uploadStatus === "completed" && uploadReceipt && (
              <div className="mt-4 flex flex-wrap items-center gap-2 rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                <span>{t("Audio transcrito correctamente. El reporte está disponible.")}</span>
                <Link href={`/dashboard/${uploadReceipt.id}`} className="font-semibold underline">
                  {t("Ver reporte")}
                </Link>
              </div>
            )}
            {uploadStatus === "failed" && (
              <p className="mt-4 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-800">
                {t("No se pudo transcribir el audio. Revisa su estado en el historial.")}
              </p>
            )}
            {!uploadReceipt && hasProcessing && (
              <p className="mt-4 rounded-lg bg-blue-50 px-3 py-2 text-sm text-blue-800">
                {t("Hay audios en proceso. Puedes volver más tarde.")}
              </p>
            )}
          </div>
        </section>

        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[230px_minmax(0,1fr)]">
          <aside className="rounded-xl border border-slate-200/80 bg-white p-3 shadow-sm">
            <div className="mb-2 flex items-center justify-between px-2"><h2 className="text-xs font-bold uppercase tracking-wide text-slate-400">{t("Biblioteca")}</h2><button onClick={() => setShowOrganizer((v) => !v)} className="rounded-lg p-1.5 text-blue-600 hover:bg-blue-50" title="Crear carpeta, categoría o etiqueta"><Icon name="plus" size={16} /></button></div>
            <button onClick={() => setViewMode("all")} className={`mb-1 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${viewMode === "all" ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="audio" size={16} />{t("Todos los audios")}<span className="ml-auto text-xs text-slate-400">{transcriptions.length}</span></button>
            <button onClick={() => setViewMode("trash")} className={`mb-3 flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm ${viewMode === "trash" ? "bg-red-50 font-semibold text-red-700" : "text-slate-600 hover:bg-slate-50"}`}><Icon name="trash" size={16} />{t("Papelera")}</button>
            <div className="mb-1 flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon name="folder" size={14} />{t("Carpetas")}</div>
            {folders.map((folder) => <div key={folder.id} className="group flex items-center gap-1"><button onClick={() => { setViewMode("folder"); setSelectedGroupId(folder.id); }} className={`min-w-0 flex-1 truncate rounded-lg px-3 py-2 text-left text-sm ${viewMode === "folder" && selectedGroupId === folder.id ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}>{folder.name}</button><button onClick={() => deleteOrganizer("folder", folder.id, folder.name)} className="rounded p-1 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Eliminar carpeta">×</button></div>)}
            <div className="mb-1 mt-3 flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon name="tag" size={14} />{t("Categorías")}</div>
            {categories.map((category) => <div key={category.id} className="group flex items-center gap-1"><button onClick={() => { setViewMode("category"); setSelectedGroupId(category.id); }} className={`flex min-w-0 flex-1 items-center gap-2 truncate rounded-lg px-3 py-2 text-left text-sm ${viewMode === "category" && selectedGroupId === category.id ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: category.color || "#64748b" }} />{category.name}</button><button onClick={() => deleteOrganizer("category", category.id, category.name)} className="rounded p-1 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Eliminar categoría">×</button></div>)}
            <div className="mb-1 mt-3 flex items-center gap-2 px-3 py-2 text-[11px] font-bold uppercase tracking-wide text-slate-400"><Icon name="tag" size={14} />{t("Etiquetas")}</div>
            {tags.map((tag) => <div key={tag.id} className="group flex items-center gap-1"><button onClick={() => { setViewMode("tag"); setSelectedGroupId(tag.id); }} className={`flex min-w-0 flex-1 items-center gap-2 truncate rounded-lg px-3 py-2 text-left text-sm ${viewMode === "tag" && selectedGroupId === tag.id ? "bg-blue-50 font-semibold text-blue-700" : "text-slate-600 hover:bg-slate-50"}`}><span className="h-2 w-2 shrink-0 rounded-full" style={{ backgroundColor: tag.color || "#64748b" }} />{tag.name}</button><button onClick={() => deleteOrganizer("tag", tag.id, tag.name)} className="rounded p-1 text-slate-300 opacity-0 hover:text-red-500 group-hover:opacity-100" title="Eliminar etiqueta">×</button></div>)}
          </aside>

          <section id="history" className="min-w-0 overflow-hidden rounded-xl border border-slate-200/80 bg-white shadow-sm">
            {showOrganizer && <form onSubmit={createOrganizer} className="border-b border-blue-100 bg-blue-50/60 p-4">
              <div className="mb-3 flex items-center justify-between"><h3 className="text-sm font-bold text-slate-800">{t("Crear elemento")}</h3><button type="button" onClick={() => setShowOrganizer(false)} className="text-slate-400 hover:text-slate-700">✕</button></div>
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-[150px_minmax(0,1fr)_auto]">
                <select value={organizerType} onChange={(e) => setOrganizerType(e.target.value as typeof organizerType)} className="min-h-10 rounded-lg border border-slate-200 bg-white px-3 text-sm"><option value="folder">{t("Carpeta")}</option><option value="category">{t("Categoría")}</option><option value="tag">{t("Etiqueta")}</option></select>
                <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder={t("Nombre")} maxLength={80} required className="min-h-10 min-w-0 rounded-lg border border-slate-200 bg-white px-3 text-sm outline-none focus:border-blue-400" />
                <button type="submit" className="min-h-10 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white hover:bg-blue-700">{t("Crear")}</button>
              </div>
              {organizerType === "folder" ? <input value={newDescription} onChange={(e) => setNewDescription(e.target.value)} placeholder={t("Descripción (opcional)")} className="mt-2 min-h-10 w-full rounded-lg border border-slate-200 bg-white px-3 text-sm" /> : <div className="mt-2 flex items-center gap-2 text-xs text-slate-500"><label>{t("Color")}</label><input type="color" value={newColor} onChange={(e) => setNewColor(e.target.value)} className="h-8 w-12 cursor-pointer rounded border-0 bg-transparent" /></div>}
            </form>}

            <div className="flex flex-col gap-3 border-b border-slate-100 px-4 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
              <div><h2 className="text-base font-bold">{t(selectedTitle)}</h2><p className="mt-0.5 text-xs text-slate-500">{viewMode === "trash" ? t("Los elementos aquí pueden restaurarse o eliminarse definitivamente.") : t("Consulta y administra tus archivos.")}</p></div>
              <div className="flex flex-wrap items-center gap-2">
                <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder={t("Buscar archivo...")} className="min-h-9 w-full rounded-lg border border-slate-200 px-3 text-xs outline-none focus:border-blue-400 sm:w-44" />
                {viewMode === "trash" && <button onClick={emptyTrash} disabled={!trashItems.length} className="min-h-9 rounded-lg bg-red-600 px-3 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-40">{t("Vaciar papelera")}</button>}
                <button type="button" onClick={() => viewMode === "trash" ? loadTrash() : loadDashboard()} disabled={loading} className="inline-flex min-h-9 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"><Icon name="refresh" size={15} />{t("Actualizar")}</button>
              </div>
            </div>

            {loading && viewMode !== "trash" ? <div className="px-4 py-10 text-center text-sm text-slate-400">{t("Cargando transcripciones...")}</div>
              : visibleItems.length === 0 ? <div className="px-4 py-10 text-center"><div className="mx-auto mb-3 flex h-11 w-11 items-center justify-center rounded-xl bg-slate-50 text-slate-400"><Icon name={viewMode === "trash" ? "trash" : "audio"} size={22} /></div><p className="text-sm font-medium text-slate-600">{t(viewMode === "trash" ? "La papelera está vacía." : "No hay transcripciones en esta vista.")}</p></div>
              : <div className="divide-y divide-slate-100">
                {visibleItems.map((item) => {
                  const status = getStatus(item);
                  const itemTags = Array.isArray(item.tags) ? item.tags : [];
                  const categoryId = item.category_id || item.category?.id || "";
                  return <article key={item.id} className="space-y-3 px-4 py-4 sm:px-5">
                    <div className="flex min-w-0 flex-col justify-between gap-2 sm:flex-row sm:items-start">
                      <div className="min-w-0"><p className="break-words text-sm font-semibold text-slate-800">{item.filename}</p><p className="mt-1 flex items-center gap-1 text-[11px] text-slate-400"><Icon name="calendar" size={12} />{formatDate(item.created_at)}</p></div>
                      <span className={`inline-flex w-fit shrink-0 items-center gap-1 rounded-full border px-2 py-1 text-[10px] font-semibold ${status.className}`}><Icon name={status.icon} size={11} />{status.label}</span>
                    </div>
                    <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500"><span><span className="text-slate-400">{t("Idioma")}: </span>{item.language || "--"}</span><span><span className="text-slate-400">{t("Duración")}: </span>{formatDuration(item.duration)}</span></div>
                    {viewMode !== "trash" && <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      <label className="text-[11px] font-medium text-slate-500">{t("Carpeta")}<select value={item.folder_id || ""} onChange={(e) => assignFolder(item.id, e.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">{t("Sin carpeta")}</option>{folders.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                      <label className="text-[11px] font-medium text-slate-500">{t("Categoría")}<select value={categoryId} onChange={(e) => assignCategory(item.id, e.target.value)} className="mt-1 min-h-9 w-full rounded-lg border border-slate-200 bg-white px-2 text-xs"><option value="">{t("Sin categoría")}</option>{categories.map((x) => <option key={x.id} value={x.id}>{x.name}</option>)}</select></label>
                    </div>}
                    {viewMode !== "trash" && <div className="flex flex-wrap gap-1.5">{tags.map((tag) => { const assigned = itemTags.some((x) => x.id === tag.id); return <button key={tag.id} onClick={() => toggleTag(item.id, tag.id, assigned)} className={`rounded-full border px-2.5 py-1 text-[10px] font-medium transition ${assigned ? "border-transparent text-white" : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"}`} style={assigned ? { backgroundColor: tag.color || "#64748b" } : undefined}>{assigned ? "✓ " : "+ "}{tag.name}</button>; })}</div>}
                    <div className="flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2">
                      {viewMode === "trash" ? <>
                        <button onClick={() => restoreItem(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-emerald-50 px-3 text-xs font-semibold text-emerald-700 hover:bg-emerald-100"><Icon name="restore" size={14} />{t("Restaurar")}</button>
                        <button onClick={() => permanentlyDelete(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-3 text-xs font-semibold text-red-600 hover:bg-red-50"><Icon name="trash" size={14} />{t("Eliminar definitivamente")}</button>
                      </> : <>
                        {item.status !== "processing" && <Link href={`/dashboard/${item.id}`} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-blue-50 px-3 text-xs font-semibold text-blue-700 hover:bg-blue-100"><Icon name="file" size={14} />{t("Ver reporte")}</Link>}
                        {item.status === "completed" && <button onClick={() => handleDownload(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Icon name="download" size={14} />{t("Descargar")}</button>}
                        {item.status !== "processing" && <button onClick={() => handleDuplicate(item)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-slate-600 hover:bg-slate-100"><Icon name="copy" size={14} />{t("Duplicar")}</button>}
                        <button onClick={() => handleDelete(item.id)} className="inline-flex min-h-9 items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-red-500 hover:bg-red-50"><Icon name="trash" size={14} />{t("Papelera")}</button>
                      </>}
                    </div>
                  </article>;
                })}
              </div>}
          </section>
        </div>

        <footer className="pb-3 pt-6 text-center text-[11px] text-slate-400">© 2026 AudioNet. {t("Todos los derechos reservados.")}</footer>
      </div>
    </main>
  );
}