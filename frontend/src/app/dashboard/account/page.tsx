"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import AppHeader from "@/components/AppHeader";
import { useLanguage } from "@/components/LanguageProvider";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

type Movement = { id: number; kind: string; label: string; seconds: number; amount_cents: number; created_at: string };
type Pack = { id: string; label: string; seconds: number; amount_cents: number };
type Wallet = {
  mode: "disabled" | "simulated" | "stripe_test" | "stripe_live";
  available_seconds: number;
  reserved_seconds: number;
  used_seconds: number;
  packs: Pack[];
  recharges: Movement[];
  usage: Movement[];
  more_recharges?: boolean;
  more_usage?: boolean;
};

const rechargesUnavailable = "Las recargas no están disponibles en este momento.";

async function creditRequest(path: string, options: RequestInit = {}) {
  const accessToken = localStorage.getItem("audionet_access_token");
  if (!accessToken) {
    window.location.replace("/");
    throw new Error("Sesión expirada");
  }
  const headers = new Headers(options.headers);
  headers.set("Authorization", `Bearer ${accessToken}`);
  const response = await fetch(`${API_URL}/credits${path}`, { ...options, cache: "no-store", headers });
  if (response.status === 401) {
    localStorage.removeItem("audionet_access_token");
    localStorage.removeItem("audionet_refresh_token");
    window.location.replace("/");
    throw new Error("Sesión expirada");
  }
  if (path === "/recharges" && response.status === 503) throw new Error(rechargesUnavailable);
  if (!response.ok) throw new Error("No se pudo acceder a tu cuenta de créditos.");
  return response.json();
}

function formatDuration(seconds: number) {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
}

export default function AccountPage() {
  const { locale, t } = useLanguage();
  const [wallet, setWallet] = useState<Wallet>();
  const [loading, setLoading] = useState(true);
  const [rechargeOffset, setRechargeOffset] = useState(0);
  const [usageOffset, setUsageOffset] = useState(0);
  const [pending, setPending] = useState<string>();
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const lastAttempt = useRef<{ pack_id: string; request_id: string } | null>(null);
  const money = new Intl.NumberFormat(locale, { style: "currency", currency: "USD", currencyDisplay: "code" });
  const date = new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short" });

  const refresh = useCallback(async (signal?: AbortSignal, recharges = 0, usage = 0) => {
    const data: Wallet = await creditRequest(`/me?recharge_offset=${recharges}&usage_offset=${usage}`, { signal });
    if (signal?.aborted) return;
    setWallet(data);
    setRechargeOffset(recharges);
    setUsageOffset(usage);
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    const checkout = new URLSearchParams(window.location.search).get("checkout");
    if (checkout === "success") {
      setNotice("Stripe completó el proceso de pago. Actualiza el saldo si el abono aún no aparece.");
    } else if (checkout === "cancelled") {
      setNotice("Recarga cancelada.");
    }
    refresh(controller.signal).catch(() => {
      if (!controller.signal.aborted) setError("No se pudo acceder a tu cuenta de créditos.");
    }).finally(() => {
      if (!controller.signal.aborted) setLoading(false);
    });
    return () => controller.abort();
  }, [refresh]);

  const hasReservedTime = Boolean(wallet?.reserved_seconds);
  useEffect(() => {
    if (!hasReservedTime || loading || pending) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function checkBalance() {
      try {
        await refresh(controller.signal, rechargeOffset, usageOffset);
      } catch {
        // Keep the displayed balance if a temporary refresh fails.
      } finally {
        if (!controller.signal.aborted) timer = setTimeout(checkBalance, 8000);
      }
    }
    timer = setTimeout(checkBalance, 8000);
    return () => {
      controller.abort();
      clearTimeout(timer);
    };
  }, [hasReservedTime, loading, pending, rechargeOffset, refresh, usageOffset]);

  async function recharge(packId: string) {
    setPending(packId);
    setError("");
    setNotice("");
    if (lastAttempt.current?.pack_id !== packId) {
      lastAttempt.current = { pack_id: packId, request_id: crypto.randomUUID() };
    }
    try {
      const result = await creditRequest("/recharges", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(lastAttempt.current),
      });
      if ((result.mode === "stripe_test" || result.mode === "stripe_live") && result.checkout_url) {
        window.location.assign(result.checkout_url);
        return;
      }
      lastAttempt.current = null;
      setNotice("Recarga simulada acreditada.");
      await refresh();
    } catch (error) {
      setError(error instanceof Error && error.message === rechargesUnavailable
        ? rechargesUnavailable
        : "No se pudo confirmar la recarga. Puedes volver a intentarlo.");
    } finally {
      setPending(undefined);
    }
  }

  async function reloadWallet(recharges = rechargeOffset, usage = usageOffset) {
    setLoading(true);
    setError("");
    try {
      await refresh(undefined, recharges, usage);
    } catch {
      setError("No se pudo acceder a tu cuenta de créditos.");
    } finally {
      setLoading(false);
    }
  }

  function pagination(isRecharge: boolean) {
    const offset = isRecharge ? rechargeOffset : usageOffset;
    const hasNext = isRecharge ? wallet?.more_recharges : wallet?.more_usage;
    if (!offset && !hasNext) return null;
    const changePage = (next: number) => isRecharge ? reloadWallet(next, usageOffset) : reloadWallet(rechargeOffset, next);
    const style = "rounded border border-slate-200 px-3 py-1 text-sm hover:bg-slate-50 disabled:opacity-40";
    return (
      <div className="mt-3 flex gap-2">
        <button className={style} disabled={loading || !!pending || offset === 0} onClick={() => changePage(offset - 25)}>{t("Anterior")}</button>
        <button className={style} disabled={loading || !!pending || !hasNext} onClick={() => changePage(offset + 25)}>{t("Siguiente")}</button>
      </div>
    );
  }

  function history(entries: Movement[], isRecharge: boolean) {
    if (!entries.length) return <p className="mt-4 text-sm text-slate-600">{t("Aún no hay movimientos.")}</p>;
    return (
      <ul className="mt-3 divide-y divide-slate-100">
        {entries.map((entry) => (
          <li key={entry.id} className="flex items-start justify-between gap-4 py-3">
            <div className="min-w-0">
              <p className="break-words text-sm font-semibold text-slate-800">{isRecharge ? t(entry.label) : entry.label}</p>
              <p className="text-xs text-slate-500">{date.format(new Date(entry.created_at))}</p>
            </div>
            <div className="shrink-0 text-right">
              <p className={`text-sm font-semibold tabular-nums ${isRecharge ? "text-emerald-700" : "text-slate-700"}`}>
                {isRecharge ? "+" : "−"}{formatDuration(Math.abs(entry.seconds))}
              </p>
              {isRecharge && <p className="text-xs text-slate-500">{money.format(entry.amount_cents / 100)} · {t("Prueba")}</p>}
            </div>
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <AppHeader />
      <main className="mx-auto max-w-5xl px-4 pb-12 pt-7 sm:px-6">
        <Link href="/dashboard" className="text-sm font-semibold text-blue-700 hover:underline">{t("Volver a transcripciones")}</Link>
        <div className="mt-4 flex flex-wrap items-end justify-between gap-3">
          <h1 className="text-3xl font-bold tracking-tight">{t("Mi cuenta")}</h1>
          <button disabled={loading || !!pending} onClick={() => reloadWallet()} className="rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold hover:bg-slate-100 disabled:opacity-50">{t("Actualizar")}</button>
        </div>
        {error && <p role="alert" className="mt-4 rounded-xl bg-red-50 p-3 text-sm text-red-800">{t(error)}</p>}
        {notice && <p role="status" className="mt-4 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">{t(notice)}</p>}
        {loading && !wallet && <p className="mt-4 text-sm text-slate-600">{t("Cargando...")}</p>}
        {wallet?.mode === "disabled" && <p className="mt-4 text-sm text-slate-700">{t("Las recargas están desactivadas en este entorno.")}</p>}
        {wallet && wallet.mode !== "disabled" && (
          <>
            <section aria-label={t("Saldo disponible")} className="mt-6 grid gap-3 sm:grid-cols-3">
              <div className="rounded-2xl bg-slate-900 p-5 text-white">
                <p className="text-sm font-medium text-blue-200">{t("Saldo disponible")}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatDuration(wallet.available_seconds)}</p>
                <p className="mt-2 text-xs text-slate-300">{t("Minutos y segundos de audio")}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-600">{t("Tiempo reservado")}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatDuration(wallet.reserved_seconds)}</p>
                <p className="mt-2 text-xs text-slate-500">{t("Audios pendientes de transcripción")}</p>
              </div>
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <p className="text-sm font-semibold text-slate-600">{t("Tiempo consumido")}</p>
                <p className="mt-2 text-3xl font-bold tabular-nums">{formatDuration(wallet.used_seconds)}</p>
                <p className="mt-2 text-xs text-slate-500">{t("Desde la activación de los créditos")}</p>
              </div>
            </section>
            <section className="mt-7">
              <h2 className="text-lg font-bold">{t("Recargar créditos")}</h2>
              <p className="mt-1 text-sm text-slate-600">{t(wallet.packs.length === 0 ? rechargesUnavailable : wallet.mode === "simulated" ? "Modo simulado. Las recargas no generan cargos." : wallet.mode === "stripe_test" ? "Stripe en modo de prueba. Usa una tarjeta de prueba." : "Paga con tarjeta en Stripe.")}</p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                {wallet.packs.map((pack) => (
                  <article key={pack.id} className="flex flex-wrap items-end justify-between gap-4 rounded-2xl border border-slate-200 bg-white p-5">
                    <div>
                      <h3 className="text-sm font-semibold text-slate-600">{t(pack.label)}</h3>
                      <p className="mt-1 text-xl font-bold">{pack.seconds / 60} {t("minutos de audio")}</p>
                      <p className="mt-1 text-sm text-slate-600">{money.format(pack.amount_cents / 100)}</p>
                    </div>
                    <button disabled={!!pending} onClick={() => recharge(pack.id)} className="rounded-lg bg-blue-700 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-800 disabled:opacity-50">
                      {t(pending === pack.id ? "Procesando..." : wallet.mode === "simulated" ? "Simular recarga" : wallet.mode === "stripe_test" ? "Abrir Stripe de prueba" : "Pagar con Stripe")}
                    </button>
                  </article>
                ))}
              </div>
            </section>
            <div className="mt-7 grid items-start gap-3 sm:grid-cols-2">
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold">{t("Recargas recientes")}</h2>
                {history(wallet.recharges, true)}
                {pagination(true)}
              </section>
              <section className="rounded-2xl border border-slate-200 bg-white p-5">
                <h2 className="text-lg font-bold">{t("Consumo reciente")}</h2>
                {history(wallet.usage, false)}
                {pagination(false)}
              </section>
            </div>
          </>
        )}
      </main>
    </div>
  );
}
