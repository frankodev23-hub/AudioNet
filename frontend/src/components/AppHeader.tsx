"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useLanguage } from "@/components/LanguageProvider";

export default function AppHeader() {
  const { t, locale, setLocale } = useLanguage();
  const pathname = usePathname();

  const [authenticated, setAuthenticated] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);

  useEffect(() => {
    const checkSession = () => {
      setAuthenticated(
        Boolean(localStorage.getItem("audionet_access_token"))
      );
    };

    checkSession();
    window.addEventListener("storage", checkSession);

    return () => window.removeEventListener("storage", checkSession);
  }, [pathname]);

  useEffect(() => {
    setMenuOpen(false);
  }, [pathname]);

  function handleLogout() {
    localStorage.removeItem("audionet_access_token");
    localStorage.removeItem("audionet_refresh_token");
    window.location.href = "/";
  }

  const futureOptions = [
    "Mi plan",
    "Facturación",
    "Configuración",
    "Ayuda y soporte",
  ];

  const linkClass = (href: string) =>
    `block rounded-lg px-3 py-2 text-sm font-medium transition ${
      pathname === href
        ? "bg-blue-50 text-blue-700"
        : "text-slate-600 hover:bg-slate-50 hover:text-blue-600"
    }`;

  return (
    <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/95 backdrop-blur">
      <div className="mx-auto flex min-h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">

        {/* LOGO */}
        <Link
          href={authenticated ? "/dashboard" : "/"}
          className="flex shrink-0 items-center gap-2"
        >
          <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-600 text-lg font-bold text-white">
            A
          </span>

          <span className="text-xl font-bold tracking-tight text-[#17233D]">
            AudioNet
          </span>
        </Link>

        {/* DESKTOP NAVIGATION */}
        <nav className="hidden items-center gap-1 lg:flex">
          {authenticated ? (
            <>
              <Link href="/dashboard" className={linkClass("/dashboard")}>
                {t("Dashboard")}
              </Link>

              <Link href="/dashboard#history" className={linkClass("/dashboard#history")}>
                {t("Historial")}
              </Link>

              <Link href="/dashboard#statistics" className={linkClass("/dashboard#statistics")}>
                {t("Estadísticas")}
              </Link>
            </>
          ) : (
            <>
              <Link href="/" className={linkClass("/")}>
                {t("Inicio")}
              </Link>

              <Link href="/" className={linkClass("/")}>
                {t("Iniciar sesión")}
              </Link>

              <Link href="/register" className={linkClass("/register")}>
                {t("Crear cuenta")}
              </Link>
            </>
          )}
        </nav>

        {/* DESKTOP ACTIONS */}
        <div className="hidden items-center gap-3 lg:flex">

          <select
            value={locale}
            onChange={(e) => setLocale(e.target.value as "es" | "en")}
            aria-label={t("Seleccionar idioma")}
            className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700 outline-none focus:border-blue-500"
          >
            <option value="es">Español</option>
            <option value="en">English</option>
          </select>

          {authenticated && (
            <button
              onClick={handleLogout}
              className="rounded-lg px-3 py-2 text-sm font-semibold text-slate-500 transition hover:bg-red-50 hover:text-red-600"
            >
              {t("Cerrar sesión")}
            </button>
          )}
        </div>

        {/* MOBILE BUTTON */}
        <button
          type="button"
          onClick={() => setMenuOpen(!menuOpen)}
          aria-label={menuOpen ? t("Cerrar menú") : t("Abrir menú")}
          aria-expanded={menuOpen}
          className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50 lg:hidden"
        >
          {menuOpen ? (
            <span className="text-2xl leading-none">×</span>
          ) : (
            <span className="text-xl leading-none">☰</span>
          )}
        </button>
      </div>

      {/* MOBILE MENU */}
      {menuOpen && (
        <div className="border-t border-slate-100 bg-white px-4 py-4 shadow-lg lg:hidden">
          <nav className="flex flex-col gap-1">

            {authenticated ? (
              <>
                <Link href="/dashboard" className={linkClass("/dashboard")}>
                  {t("Dashboard")}
                </Link>

                <Link href="/dashboard#history" className={linkClass("/dashboard#history")}>
                  {t("Historial")}
                </Link>

                <Link href="/dashboard#statistics" className={linkClass("/dashboard#statistics")}>
                  {t("Estadísticas")}
                </Link>
              </>
            ) : (
              <>
                <Link href="/" className={linkClass("/")}>
                  {t("Inicio")}
                </Link>

                <Link href="/" className={linkClass("/")}>
                  {t("Iniciar sesión")}
                </Link>

                <Link href="/register" className={linkClass("/register")}>
                  {t("Crear cuenta")}
                </Link>
              </>
            )}

            <div className="my-2 border-t border-slate-100" />

            <p className="px-3 py-2 text-xs font-semibold uppercase tracking-wider text-slate-400">
              {t("Próximamente")}
            </p>

            {futureOptions.map((option) => (
              <div
                key={option}
                className="flex cursor-not-allowed items-center justify-between rounded-lg px-3 py-2 text-sm text-slate-400"
                aria-disabled="true"
              >
                {t(option)}
                <span className="text-xs">{t("Próximamente")}</span>
              </div>
            ))}

            <div className="my-2 border-t border-slate-100" />

            <label className="px-3 text-xs font-semibold text-slate-500">
              {t("Idioma")}
            </label>

            <select
              value={locale}
              onChange={(e) => setLocale(e.target.value as "es" | "en")}
              className="mx-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700"
            >
              <option value="es">Español</option>
              <option value="en">English</option>
            </select>

            {authenticated && (
              <button
                onClick={handleLogout}
                className="mt-2 rounded-lg px-3 py-3 text-left text-sm font-semibold text-red-600 hover:bg-red-50"
              >
                {t("Cerrar sesión")}
              </button>
            )}
          </nav>
        </div>
      )}
    </header>
  );
}