"use client";

import { useState } from "react";
import Link from "next/link";

export default function Register() {
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const API_URL =
    process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

  async function handleRegister(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();

    setError("");

    if (password !== confirmPassword) {
      setError("Las contraseñas no coinciden.");
      return;
    }

    if (password.length < 8) {
      setError("La contraseña debe tener al menos 8 caracteres.");
      return;
    }

    setLoading(true);

    try {
      const response = await fetch(`${API_URL}/auth/register`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          full_name: fullName,
          email,
          password,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(
          data.detail || "No se pudo crear la cuenta."
        );
      }

      setSuccess(true);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Error de conexión con el servidor."
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
            Comienza a
            <br />
            transformar
            <br />
            <span className="text-blue-400">
              tus audios.
            </span>
          </h1>

          <p className="text-lg text-slate-300 leading-8 max-w-lg">
            Crea tu cuenta y descubre una forma más sencilla
            de convertir tus grabaciones en texto.
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
                Formatos de exportación
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

          <div className="lg:hidden flex items-center gap-3 mb-10">
            <div className="w-11 h-11 rounded-xl bg-blue-600 flex items-center justify-center text-white font-bold text-xl">
              A
            </div>

            <span className="text-2xl font-bold text-[#101C36]">
              AudioNet
            </span>
          </div>

          {!success ? (
            <>
              <div className="mb-8">

                <p className="text-sm font-semibold text-blue-600 mb-3 uppercase tracking-wider">
                  Únete a AudioNet
                </p>

                <h2 className="text-3xl font-bold text-[#17233D]">
                  Crear una cuenta
                </h2>

                <p className="text-slate-500 mt-3">
                  Regístrate para comenzar a transcribir tus audios.
                </p>

              </div>

              <form onSubmit={handleRegister} className="space-y-5">

                {/* NOMBRE */}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Nombre completo
                  </label>

                  <input
                    type="text"
                    required
                    autoComplete="name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Tu nombre completo"
                    className="w-full h-13 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {/* CORREO */}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Correo electrónico
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

                {/* CONTRASEÑA */}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Contraseña
                  </label>

                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Mínimo 8 caracteres"
                    className="w-full h-13 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {/* CONFIRMAR CONTRASEÑA */}

                <div>
                  <label className="block text-sm font-semibold text-slate-700 mb-2">
                    Confirmar contraseña
                  </label>

                  <input
                    type={showPassword ? "text" : "password"}
                    required
                    minLength={8}
                    autoComplete="new-password"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
                    placeholder="Repite tu contraseña"
                    className="w-full h-13 px-4 py-3 rounded-xl border border-slate-200 bg-white text-slate-800 outline-none transition focus:border-blue-500 focus:ring-4 focus:ring-blue-500/10"
                  />
                </div>

                {/* MOSTRAR CONTRASEÑA */}

                <div className="flex justify-end">
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="text-sm font-medium text-blue-600 hover:text-blue-800"
                  >
                    {showPassword ? "Ocultar contraseñas" : "Mostrar contraseñas"}
                  </button>
                </div>

                {/* ERROR */}

                {error && (
                  <div className="rounded-xl bg-red-50 border border-red-200 p-4 text-sm text-red-700">
                    {error}
                  </div>
                )}

                {/* REGISTRAR */}

                {/* <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-13 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-lg shadow-blue-600/20 transition disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {loading ? "Creando cuenta..." : "Crear mi cuenta"}
                </button> */}

              </form>

              <div className="mt-8 text-center text-sm text-slate-500">
                ¿Ya tienes una cuenta?{" "}
                <Link
                  href="/"
                  className="font-semibold text-blue-600 hover:text-blue-800"
                >
                  Inicia sesión
                </Link>
              </div>
            </>
          ) : (
            <div className="text-center">

              <div className="w-16 h-16 mx-auto mb-6 rounded-full bg-green-100 flex items-center justify-center text-green-600 text-3xl">
                ✓
              </div>

              <h2 className="text-3xl font-bold text-[#17233D]">
                ¡Cuenta creada!
              </h2>

              <p className="text-slate-500 mt-4 leading-7">
                Hemos enviado un correo de verificación a:
              </p>

              <p className="font-semibold text-[#17233D] mt-2">
                {email}
              </p>

              <p className="text-slate-500 mt-4 leading-7">
                Revisa tu bandeja de entrada y confirma tu correo
                para comenzar a utilizar AudioNet.
              </p>

              <Link
                href="/"
                className="inline-flex mt-8 w-full h-13 items-center justify-center rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition"
              >
                Volver al inicio de sesión
              </Link>

            </div>
          )}

          <div className="mt-10 pt-6 border-t border-slate-200">
            <p className="text-center text-xs text-slate-400">
              Acceso seguro mediante autenticación de Supabase.
            </p>
          </div>

        </div>

      </section>

    </main>
  );
}