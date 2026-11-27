"use client";

import { useEffect, useRef, useState, type FormEvent } from "react";

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

export default function ResetPasswordPage() {
  const token = useRef("");
  const initialized = useRef(false);
  const [state, setState] = useState<"loading" | "ready" | "invalid" | "done">("loading");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    // Supabase's default recovery template redirects with a short-lived access token.
    const fragment = new URLSearchParams(window.location.hash.slice(1));
    window.history.replaceState(null, "", window.location.pathname);
    const accessToken = fragment.get("access_token");
    if (fragment.get("type") !== "recovery" || !accessToken || !SUPABASE_URL || !SUPABASE_KEY) {
      setState("invalid");
      return;
    }
    token.current = accessToken;
    setState("ready");
  }, []);

  async function reset(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (saving || !token.current) return;
    const data = new FormData(event.currentTarget);
    const password = String(data.get("password"));
    if (password !== data.get("confirmation")) {
      setError("Las contraseñas deben coincidir.");
      return;
    }
    setError("");
    setSaving(true);
    try {
      const response = await fetch(SUPABASE_URL + "/auth/v1/user", {
        method: "PUT",
        headers: {
          apikey: SUPABASE_KEY!,
          Authorization: "Bearer " + token.current,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ password }),
        signal: AbortSignal.timeout(10000),
      });
      if (response.status === 401 || response.status === 403) {
        token.current = "";
        setState("invalid");
      } else if (!response.ok) {
        setError("Supabase no aceptó la contraseña. Usa una nueva y vuelve a intentar.");
      } else {
        const revoke = await fetch(SUPABASE_URL + "/auth/v1/logout?scope=global", {
          method: "POST",
          headers: { apikey: SUPABASE_KEY!, Authorization: "Bearer " + token.current },
          signal: AbortSignal.timeout(5000),
        }).catch(() => null);
        token.current = "";
        if (!revoke?.ok) setError("La contraseña cambió. No se pudo confirmar el cierre de las sesiones anteriores.");
        setState("done");
      }
    } catch {
      setError("No se pudo confirmar el cambio. Intenta entrar con la nueva contraseña o solicita otro enlace.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <main className="mx-auto my-16 max-w-md px-5 text-slate-900">
      <h1 className="mb-5 text-3xl font-bold">Restablecer contraseña</h1>
      {state === "loading" && <p>Verificando el enlace…</p>}
      {state === "invalid" && <p>El enlace está vencido o es inválido. Solicita uno nuevo al equipo de AudioNet.</p>}
      {state === "done" && <p>Contraseña actualizada. <a className="underline" href="/login">Iniciar sesión</a></p>}
      {state === "ready" && (
        <form className="grid gap-4" onSubmit={reset}>
          <label className="grid gap-1">Nueva contraseña
            <input className="rounded border p-2" autoComplete="new-password" type="password" name="password" minLength={8} maxLength={72} required />
          </label>
          <label className="grid gap-1">Confirmar contraseña
            <input className="rounded border p-2" autoComplete="new-password" type="password" name="confirmation" minLength={8} maxLength={72} required />
          </label>
          <button className="rounded bg-blue-700 p-2 font-semibold text-white" disabled={saving}>
            {saving ? "Guardando…" : "Cambiar contraseña"}
          </button>
        </form>
      )}
      {error && <p className="mt-4 text-red-700" role="alert">{error}</p>}
    </main>
  );
}
