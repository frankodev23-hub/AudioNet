export type Locale = "es" | "en";

export const translations: Record<Locale, Record<string, string>> = {
  es: {
    // ==========================================
    // MENÚ Y NAVEGACIÓN
    // ==========================================

    "Inicio": "Inicio",
    "Dashboard": "Panel de control",
    "Historial": "Historial",
    "Estadísticas": "Estadísticas",
    "Seleccionar idioma": "Seleccionar idioma",
    "Abrir menú": "Abrir menú",
    "Cerrar menú": "Cerrar menú",
    "Próximamente": "Próximamente",
    "Mi plan": "Mi plan",
    "Facturación": "Facturación",
    "Configuración": "Configuración",
    "Ayuda y soporte": "Ayuda y soporte",

    // ==========================================
    // GENERAL
    // ==========================================

    "Cargando...": "Cargando...",
    "Cargando transcripciones...": "Cargando transcripciones...",
    "Cargando transcripción...": "Cargando transcripción...",
    "Error de conexión": "Error de conexión",
    "Error de conexión con el servidor.": "Error de conexión con el servidor.",
    "Cancelar": "Cancelar",
    "Guardar": "Guardar",
    "Guardar cambios": "Guardar cambios",
    "Guardando...": "Guardando...",
    "Eliminar": "Eliminar",
    "Descargar": "Descargar",
    "Actualizar": "Actualizar",
    "Reintentar": "Reintentar",
    "Volver": "Volver",
    "Usuario": "Usuario",
    "Archivo": "Archivo",
    "Idioma": "Idioma",
    "Duración": "Duración",
    "Fecha": "Fecha",
    "Estado": "Estado",
    "Acciones": "Acciones",
    "Error": "Error",
    "Completado": "Completado",
    "Procesando": "Procesando",
    "m": "m",
    "s": "s",
    "min": "min",

    // ==========================================
    // INICIO DE SESIÓN
    // ==========================================

    "Inteligencia artificial para audio": "Inteligencia artificial para audio",
    "Tus audios.": "Tus audios.",
    "Tus palabras.": "Tus palabras.",
    "En texto.": "En texto.",
    "Bienvenido": "Bienvenido",
    "Iniciar sesión": "Iniciar sesión",
    "Correo electrónico": "Correo electrónico",
    "Contraseña": "Contraseña",
    "Mostrar": "Mostrar",
    "Ocultar": "Ocultar",
    "¿Olvidaste tu contraseña?": "¿Olvidaste tu contraseña?",
    "¿No tienes una cuenta?": "¿No tienes una cuenta?",
    "Regístrate": "Regístrate",
    "Ingresando...": "Ingresando...",
    "Iniciar sesión con tu cuenta": "Iniciar sesión con tu cuenta",
    "Correo electrónico o contraseña incorrectos.": "Correo electrónico o contraseña incorrectos.",
    "Tu cuenta aún no ha sido verificada.": "Tu cuenta aún no ha sido verificada.",
    "Debes verificar tu correo electrónico antes de iniciar sesión.": "Debes verificar tu correo electrónico antes de iniciar sesión.",
    "No se pudo iniciar sesión.": "No se pudo iniciar sesión.",
    "Credenciales incorrectas.": "Credenciales incorrectas.",

    // ==========================================
    // REGISTRO
    // ==========================================

    "Comienza a": "Comienza a",
    "transformar": "transformar",
    "tus audios.": "tus audios.",
    "Crea tu cuenta y descubre una forma más sencilla de convertir tus grabaciones en texto.": "Crea tu cuenta y descubre una forma más sencilla de convertir tus grabaciones en texto.",
    "Crear cuenta": "Crear cuenta",
    "Crear mi cuenta": "Crear mi cuenta",
    "Creando cuenta...": "Creando cuenta...",
    "Tu nombre completo": "Tu nombre completo",
    "Nombre completo": "Nombre completo",
    "Confirmar contraseña": "Confirmar contraseña",
    "¿Ya tienes una cuenta?": "¿Ya tienes una cuenta?",
    "Las contraseñas no coinciden.": "Las contraseñas no coinciden.",
    "La contraseña debe tener al menos 8 caracteres.": "La contraseña debe tener al menos 8 caracteres.",
    "No se pudo crear la cuenta.": "No se pudo crear la cuenta.",
    "Cuenta creada correctamente.": "Cuenta creada correctamente.",
    "Revisa tu correo electrónico para verificar tu cuenta.": "Revisa tu correo electrónico para verificar tu cuenta.",
    "Verifica tu correo electrónico": "Verifica tu correo electrónico",
    "Volver al inicio de sesión": "Volver al inicio de sesión",

    // ==========================================
    // DASHBOARD
    // ==========================================

    "Mi cuenta": "Mi cuenta",
    "Cerrar sesión": "Cerrar sesión",
    "Panel de control": "Panel de control",
    "Administra tus audios y transcripciones desde un solo lugar.": "Administra tus audios y transcripciones desde un solo lugar.",
    "Consumo total": "Consumo total",
    "Desde la creación de tu cuenta": "Desde la creación de tu cuenta",
    "Consumo este mes": "Consumo este mes",
    "Minutos procesados durante este mes": "Minutos procesados durante este mes",
    "Audios contabilizados": "Audios contabilizados",
    "Transcripciones procesadas correctamente": "Transcripciones procesadas correctamente",
    "Nueva transcripción": "Nueva transcripción",
    "Selecciona un archivo de audio para convertirlo en texto.": "Selecciona un archivo de audio para convertirlo en texto.",
    "Español": "Español",
    "Inglés": "Inglés",
    "Portugués": "Portugués",
    "Francés": "Francés",
    "Alemán": "Alemán",
    "Italiano": "Italiano",
    "Automático": "Automático",
    "Subiendo audio...": "Subiendo audio...",
    "Mantén esta página abierta hasta que termine la subida.": "Mantén esta página abierta hasta que termine la subida.",
    "Audio recibido. Puedes cerrar esta página mientras se transcribe.": "Audio recibido. Puedes cerrar esta página mientras se transcribe.",
    "Procesando audio...": "Procesando audio...",
    "Transcribir audio": "Transcribir audio",
    "Procesando tu archivo...": "Procesando tu archivo...",
    "Esto puede tardar varios minutos.": "Esto puede tardar varios minutos.",
    "Historial de transcripciones": "Historial de transcripciones",
    "Consulta y administra tus archivos.": "Consulta y administra tus archivos.",
    "Todavía no tienes transcripciones.": "Todavía no tienes transcripciones.",
    "Sube tu primer audio para comenzar.": "Sube tu primer audio para comenzar.",
    "Ver reporte de procesamiento →": "Ver reporte de procesamiento →",
    "Ver reporte": "Ver reporte",
    "Idioma de transcripción": "Idioma de transcripción",
    "¿Estás seguro de eliminar esta transcripción?": "¿Estás seguro de eliminar esta transcripción?",
    "Sesión no válida": "Sesión no válida",
    "Algunos datos no pudieron cargarse. Puedes intentarlo nuevamente.": "Algunos datos no pudieron cargarse. Puedes intentarlo nuevamente.",
    "Selecciona un archivo de audio.": "Selecciona un archivo de audio.",
    "No se recibió el enlace de descarga.": "No se recibió el enlace de descarga.",
    "Todos los derechos reservados.": "Todos los derechos reservados.",

    // ==========================================
    // TRANSCRIPCIÓN
    // ==========================================

    "Transcripción": "Transcripción",
    "TRANSCRIPCIÓN": "TRANSCRIPCIÓN",
    "No se pudo cargar la transcripción": "No se pudo cargar la transcripción",
    "No se pudo guardar la transcripción": "No se pudo guardar la transcripción",
    "Error al guardar la transcripción": "Error al guardar la transcripción",
    "No se pudo descargar el audio": "No se pudo descargar el audio",
    "Error de descarga": "Error de descarga",
    "No se pudo exportar la transcripción": "No se pudo exportar la transcripción",
    "Error al exportar el documento": "Error al exportar el documento",
    "Transcripción no encontrada": "Transcripción no encontrada",
    "Volver al dashboard": "Volver al panel de control",
    "Descargar audio": "Descargar audio",
    "Exportar documento": "Exportar documento",
    "Texto transcrito": "Texto transcrito",
    "Puedes editar y corregir el contenido.": "Puedes editar y corregir el contenido.",
    "Editar texto": "Editar texto",
    "Escribe o corrige la transcripción...": "Escribe o corrige la transcripción...",
    "No hay texto disponible.": "No hay texto disponible.",
    "Segmentos originales": "Segmentos originales",
    "Texto original dividido por marcas de tiempo.": "Texto original dividido por marcas de tiempo.",

    // ==========================================
    // REPORTE DE PROCESAMIENTO
    // ==========================================

    "Reporte de procesamiento": "Reporte de procesamiento",
    "Métricas calculadas sobre el texto original generado por Whisper.": "Métricas calculadas sobre el texto original generado por Whisper.",
    "Tiempo de procesamiento": "Tiempo de procesamiento",
    "Duración del audio": "Duración del audio",
    "Palabras": "Palabras",
    "Caracteres (con espacios)": "Caracteres (con espacios)",
    "Caracteres (sin espacios)": "Caracteres (sin espacios)",
    "Párrafos": "Párrafos",
    "Segmentos": "Segmentos",
    "Velocidad": "Velocidad",
    "tiempo real": "tiempo real",
    "Finalizado": "Finalizado",
    "El reporte conserva las cifras originales aunque edites posteriormente la transcripción.": "El reporte conserva las cifras originales aunque edites posteriormente la transcripción.",

    // ==========================================
    // EXPORTACIÓN
    // ==========================================

    "Exportar transcripción": "Exportar transcripción",
    "Personaliza tu documento.": "Personaliza tu documento.",
    "Formato del documento": "Formato del documento",
    "Word": "Word",
    "PDF": "PDF",
    "Texto": "Texto",
    "Título": "Título",
    "Título del documento": "Título del documento",
    "Encabezado": "Encabezado",
    "Ej. AudioNet": "Ej. AudioNet",
    "Subtítulo": "Subtítulo",
    "Descripción adicional (opcional)": "Descripción adicional (opcional)",
    "Opciones adicionales": "Opciones adicionales",
    "Incluir fecha y hora": "Incluir fecha y hora",
    "Incluir nombre del archivo de audio": "Incluir nombre del archivo de audio",
    "Incluir marcas de tiempo": "Incluir marcas de tiempo",
    "Generando documento...": "Generando documento...",
    "Descargar documento": "Descargar documento",
  },

  en: {
    // ==========================================
    // MENÚ Y NAVEGACIÓN
    // ==========================================

    "Inicio": "Home",
    "Dashboard": "Dashboard",
    "Historial": "History",
    "Estadísticas": "Statistics",
    "Seleccionar idioma": "Select language",
    "Abrir menú": "Open menu",
    "Cerrar menú": "Close menu",
    "Próximamente": "Coming soon",
    "Mi plan": "My plan",
    "Facturación": "Billing",
    "Configuración": "Settings",
    "Ayuda y soporte": "Help and support",

    // ==========================================
    // GENERAL
    // ==========================================

    "Cargando...": "Loading...",
    "Cargando transcripciones...": "Loading transcripts...",
    "Cargando transcripción...": "Loading transcript...",
    "Error de conexión": "Connection error",
    "Error de conexión con el servidor.": "Server connection error.",
    "Cancelar": "Cancel",
    "Guardar": "Save",
    "Guardar cambios": "Save changes",
    "Guardando...": "Saving...",
    "Eliminar": "Delete",
    "Descargar": "Download",
    "Actualizar": "Refresh",
    "Reintentar": "Retry",
    "Volver": "Back",
    "Usuario": "User",
    "Archivo": "File",
    "Idioma": "Language",
    "Duración": "Duration",
    "Fecha": "Date",
    "Estado": "Status",
    "Acciones": "Actions",
    "Error": "Error",
    "Completado": "Completed",
    "Procesando": "Processing",
    "m": "m",
    "s": "s",
    "min": "min",

    // ==========================================
    // INICIO DE SESIÓN
    // ==========================================

    "Inteligencia artificial para audio": "Artificial intelligence for audio",
    "Tus audios.": "Your audio.",
    "Tus palabras.": "Your words.",
    "En texto.": "In text.",
    "Bienvenido": "Welcome",
    "Iniciar sesión": "Sign in",
    "Correo electrónico": "Email address",
    "Contraseña": "Password",
    "Mostrar": "Show",
    "Ocultar": "Hide",
    "¿Olvidaste tu contraseña?": "Forgot your password?",
    "¿No tienes una cuenta?": "Don't have an account?",
    "Regístrate": "Sign up",
    "Ingresando...": "Signing in...",
    "Iniciar sesión con tu cuenta": "Sign in to your account",
    "Correo electrónico o contraseña incorrectos.": "Incorrect email or password.",
    "Tu cuenta aún no ha sido verificada.": "Your account has not been verified yet.",
    "Debes verificar tu correo electrónico antes de iniciar sesión.": "You must verify your email address before signing in.",
    "No se pudo iniciar sesión.": "Unable to sign in.",
    "Credenciales incorrectas.": "Incorrect credentials.",

    // ==========================================
    // REGISTRO
    // ==========================================

    "Comienza a": "Start",
    "transformar": "transforming",
    "tus audios.": "your audio.",
    "Crea tu cuenta y descubre una forma más sencilla de convertir tus grabaciones en texto.": "Create your account and discover an easier way to turn your recordings into text.",
    "Crear cuenta": "Create account",
    "Crear mi cuenta": "Create my account",
    "Creando cuenta...": "Creating account...",
    "Tu nombre completo": "Your full name",
    "Nombre completo": "Full name",
    "Confirmar contraseña": "Confirm password",
    "¿Ya tienes una cuenta?": "Already have an account?",
    "Las contraseñas no coinciden.": "Passwords do not match.",
    "La contraseña debe tener al menos 8 caracteres.": "The password must contain at least 8 characters.",
    "No se pudo crear la cuenta.": "Unable to create the account.",
    "Cuenta creada correctamente.": "Account created successfully.",
    "Revisa tu correo electrónico para verificar tu cuenta.": "Check your email to verify your account.",
    "Verifica tu correo electrónico": "Verify your email address",
    "Volver al inicio de sesión": "Back to sign in",

    // ==========================================
    // DASHBOARD
    // ==========================================

    "Mi cuenta": "My account",
    "Cerrar sesión": "Sign out",
    "Panel de control": "Dashboard",
    "Administra tus audios y transcripciones desde un solo lugar.": "Manage your audio files and transcripts from one place.",
    "Consumo total": "Total usage",
    "Desde la creación de tu cuenta": "Since account creation",
    "Consumo este mes": "Usage this month",
    "Minutos procesados durante este mes": "Minutes processed this month",
    "Audios contabilizados": "Audio files processed",
    "Transcripciones procesadas correctamente": "Successfully processed transcripts",
    "Nueva transcripción": "New transcript",
    "Selecciona un archivo de audio para convertirlo en texto.": "Select an audio file to convert it into text.",
    "Español": "Spanish",
    "Inglés": "English",
    "Portugués": "Portuguese",
    "Francés": "French",
    "Alemán": "German",
    "Italiano": "Italian",
    "Automático": "Automatic",
    "Subiendo audio...": "Uploading audio...",
    "Mantén esta página abierta hasta que termine la subida.": "Keep this page open until the upload finishes.",
    "Audio recibido. Puedes cerrar esta página mientras se transcribe.": "Audio received. You can close this page while it is transcribed.",
    "Procesando audio...": "Processing audio...",
    "Transcribir audio": "Transcribe audio",
    "Procesando tu archivo...": "Processing your file...",
    "Esto puede tardar varios minutos.": "This may take several minutes.",
    "Historial de transcripciones": "Transcription history",
    "Consulta y administra tus archivos.": "View and manage your files.",
    "Todavía no tienes transcripciones.": "You don't have any transcripts yet.",
    "Sube tu primer audio para comenzar.": "Upload your first audio file to get started.",
    "Ver reporte de procesamiento →": "View processing report →",
    "Ver reporte": "View report",
    "Idioma de transcripción": "Transcription language",
    "¿Estás seguro de eliminar esta transcripción?": "Are you sure you want to delete this transcript?",
    "Sesión no válida": "Invalid session",
    "Algunos datos no pudieron cargarse. Puedes intentarlo nuevamente.": "Some data could not be loaded. Please try again.",
    "Selecciona un archivo de audio.": "Select an audio file.",
    "No se recibió el enlace de descarga.": "No download link was received.",
    "Todos los derechos reservados.": "All rights reserved.",

    // ==========================================
    // TRANSCRIPCIÓN
    // ==========================================

    "Transcripción": "Transcription",
    "TRANSCRIPCIÓN": "TRANSCRIPTION",
    "No se pudo cargar la transcripción": "Unable to load the transcript",
    "No se pudo guardar la transcripción": "Unable to save the transcript",
    "Error al guardar la transcripción": "Error saving the transcript",
    "No se pudo descargar el audio": "Unable to download the audio",
    "Error de descarga": "Download error",
    "No se pudo exportar la transcripción": "Unable to export the transcript",
    "Error al exportar el documento": "Error exporting the document",
    "Transcripción no encontrada": "Transcript not found",
    "Volver al dashboard": "Back to dashboard",
    "Descargar audio": "Download audio",
    "Exportar documento": "Export document",
    "Texto transcrito": "Transcribed text",
    "Puedes editar y corregir el contenido.": "You can edit and correct the content.",
    "Editar texto": "Edit text",
    "Escribe o corrige la transcripción...": "Write or correct the transcript...",
    "No hay texto disponible.": "No text available.",
    "Segmentos originales": "Original segments",
    "Texto original dividido por marcas de tiempo.": "Original text divided by timestamps.",

    // ==========================================
    // REPORTE DE PROCESAMIENTO
    // ==========================================

    "Reporte de procesamiento": "Processing report",
    "Métricas calculadas sobre el texto original generado por Whisper.": "Metrics calculated from the original text generated by Whisper.",
    "Tiempo de procesamiento": "Processing time",
    "Duración del audio": "Audio duration",
    "Palabras": "Words",
    "Caracteres (con espacios)": "Characters (with spaces)",
    "Caracteres (sin espacios)": "Characters (without spaces)",
    "Párrafos": "Paragraphs",
    "Segmentos": "Segments",
    "Velocidad": "Speed",
    "tiempo real": "real time",
    "Finalizado": "Completed",
    "El reporte conserva las cifras originales aunque edites posteriormente la transcripción.": "The report preserves the original figures even if you edit the transcript later.",

    // ==========================================
    // EXPORTACIÓN
    // ==========================================

    "Exportar transcripción": "Export transcript",
    "Personaliza tu documento.": "Customize your document.",
    "Formato del documento": "Document format",
    "Word": "Word",
    "PDF": "PDF",
    "Texto": "Text",
    "Título": "Title",
    "Título del documento": "Document title",
    "Encabezado": "Header",
    "Ej. AudioNet": "E.g. AudioNet",
    "Subtítulo": "Subtitle",
    "Descripción adicional (opcional)": "Additional description (optional)",
    "Opciones adicionales": "Additional options",
    "Incluir fecha y hora": "Include date and time",
    "Incluir nombre del archivo de audio": "Include audio filename",
    "Incluir marcas de tiempo": "Include timestamps",
    "Generando documento...": "Generating document...",
    "Descargar documento": "Download document",
  },
};