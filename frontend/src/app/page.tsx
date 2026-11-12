"use client";

import { useState } from "react";

export default function Home() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState("");

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  async function handleLogin(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");
    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/login`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.detail || "No se pudo iniciar sesion");
      }

      localStorage.setItem("audionet_access_token", data.access_token);
      localStorage.setItem("audionet_refresh_token", data.refresh_token);

      window.location.href = "/dashboard";
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de conexion con el servidor"
      );
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-[#F5F7FB] flex">

      {/* PANEL IZQUIERDO */}

      <section className="hidden lg:flex lg:w-1/2 bg-[#101C36] relative overflow-hidden flex-col justify-between p-16 text-white">

        <div className="absolute w-[500px] h-[500px] rounded-full bg-blue-500/10 blur-3xl -top-40 -left-40" />
        <div className="absolute w-[500px] h-[500px] rounded-full bg-indigo-500/10 blur-3xl bottom-0 right-0" />

        <div className="relative z-10">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-xl bg-blue-500 flex items-center justify-center font-bold text-xl">
              A
            </div>

            <span className="text-2xl font-semibold tracking-wide">
              AudioNet
            </span>
          </div>
        </div>

        <div className="relative z-10 max-w-xl">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-white/10 border border-white/10 text-sm text-blue-200 mb-8">
            <span className="w-2 h-2 rounded-full bg-green-400" />
            Inteligencia artificial para audio
          </div>

          <h1 className="text-5xl xl:text-6xl font-bold leading-tight mb-8">
            Tus audios.
            <br />
            Tus palabras.
            <br />
            <span className="text-blue-400">En texto.</span>
          </h1>

          <p className="text-lg text-slate-300 leading-8 max-w-lg">
            Convierte tus grabaciones en transcripciones precisas.
            Organiza, edita y exporta todo desde una sola plataforma.
          </p>

          <div className="grid grid-cols-3 gap-6 mt-14 pt-8 border-t border-white/10">

            <div>
              <p className="text-2xl font-bold">IA</p>
              <p className="text-sm text-slate-400 mt-1">
                Reconocimiento inteligente
              </p>
            </div>

            <div>
              <p className="text-2xl font-bold">24/7</p>
              <p className="text-sm text-slate-400 mt-1">
                Acceso a tu contenido
              </p>
            </div>

            <div>
              <p className="text-2xl font-bold">Multi</p>
              <p className="text-sm text-slate-400 mt-1">
                Formatos de exportacion
              </p>
            </div>

          </div>
        </div>

        <div className="relative z-10 text-sm text-slate-500">
          © 2026 AudioNet. Todos los derechos reservados.
        </div>

      </section>

      {/* PANEL DERECHO */}

      <section className="w-full lg:w-1/2 flex items-center justify-center p-6 sm:p-12">

        <div className="w-full max-w-md">

          <div className="lg:hidden flex items-center gap-3 mb-12">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
              A
            </div>

            <span className="text-2xl font-bold text-[#101C36]">
              AudioNet
            </span>
          </div>

          <div className="mb-10">
            <p className="text-sm font-semibold text-blue-600 mb-3 uppercase tracking-wider">
              Bienvenido
            </p>

            <h2 className="text-3xl font-bold text-[#17233D]">
              Iniciar sesion
            </h2>

            <p className="text-slate-500 mt-3">
              Ingresa tus credenciales para acceder a tu cuenta.
            </p>
          </div>

          <form onSubmit={handleLogin} className="space-y-6">

            <div>
              <label className="block text-sm font-semibold text-slate-700 mb-2">
                Correo electronico
              </label>

              <input
                type="email"
                required
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="nombre@correo.com"
                className="w-full h-13 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
              />
            </div>

            <div>
              <div className="flex justify-between items-center mb-2">
                <label className="block text-sm font-semibold text-slate-700">
                  Contrasena
                </label>
              </div>

              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  required
                  autoComplete="current-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Ingresa tu contrasena"
                  className="w-full h-13 px-4 pr-16 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                />

                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-sm font-medium text-blue-600 hover:text-blue-800"
                >
                  {showPassword ? "Ocultar" : "Mostrar"}
                </button>
              </div>
            </div>

            {error && (
              <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                {error}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full h-13 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {loading ? "Verificando acceso..." : "Ingresar a AudioNet"}
            </button>

          </form>

          <div className="mt-10 pt-6 border-t border-slate-200">
            <p className="text-center text-xs text-slate-400">
              Acceso seguro mediante autenticacion de Supabase.
            </p>
          </div>

        </div>

      </section>

    </main>
  );
}