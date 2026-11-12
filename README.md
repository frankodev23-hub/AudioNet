AudioNet — Ficha técnica del proyecto
Estado: Operativo en producción
Arquitectura: Aplicación web Full Stack
Modelo de despliegue: Servicios distribuidos en la nube.
1. Arquitectura tecnológica
AudioNet está construido con una arquitectura desacoplada, donde el frontend, backend, procesamiento de audio, base de datos y almacenamiento funcionan como servicios independientes.
Componente	Tecnología	Función
Frontend	Next.js 16.4.6	Interfaz de usuario
Framework UI	React 19.3.0	Componentes interactivos
Lenguaje frontend	TypeScript	Tipado y seguridad del código
Estilos	Tailwind CSS 4.3.3	Diseño visual
Backend	Python + FastAPI	API y lógica de negocio
Servidor API	Uvicorn	Ejecución del backend
Motor de transcripción	Faster-Whisper	Reconocimiento de voz
Modelo de IA	Whisper	Conversión de audio a texto
Procesamiento GPU	CUDA	Aceleración del procesamiento
Base de datos	Supabase	Persistencia de información
Autenticación	Supabase Auth	Gestión de usuarios y sesiones
Almacenamiento	Cloudflare R2	Archivos de audio
Infraestructura API	Runpod Pods	Ejecución del backend
Infraestructura IA	Runpod Serverless	Procesamiento de transcripciones
Hosting frontend	Netlify	Publicación de la aplicación
Repositorio	GitHub privado	Control de versiones


2. Arquitectura de funcionamiento
El flujo de procesamiento es el siguiente:
                 USUARIO
                    |
                    ▼
          FRONTEND - NETLIFY
             Next.js / React
                    |
                    ▼
             BACKEND - RUNPOD
                FastAPI
                    |
          ┌─────────┴─────────┐
          ▼                   ▼
     SUPABASE              CLOUDFLARE R2
   Base de datos          Archivos de audio
          |                   |
          └─────────┬─────────┘
                    |
                    ▼
             RUNPOD SERVERLESS
               Faster-Whisper
                    |
                    ▼
             RESULTADO DE IA
                    |
                    ▼
             BACKEND - RUNPOD
                    |
                    ▼
             SUPABASE / R2
                    |
                    ▼
           FRONTEND - NETLIFY
                    |
                    ▼
             USUARIO FINAL

3. Backend
Desarrollado en Python utilizando FastAPI.
Responsabilidades
- Autenticación y autorización.
- Recepción de archivos de audio.
- Comunicación con Runpod Serverless.
- Administración de transcripciones.
- Integración con Supabase.
- Gestión de archivos mediante Cloudflare R2.
- Generación de documentos descargables.
Endpoints principales
Método	Endpoint	Función
GET	/	Estado de la aplicación
GET	/health	Comprobación de disponibilidad
POST	/auth/login	Inicio de sesión
GET	/auth/me	Usuario autenticado
POST	/upload-and-transcribe	Carga y transcripción
GET	/transcriptions	Listado de transcripciones
GET	/transcriptions/{id}	Obtener transcripción
PATCH	/transcriptions/{id}	Actualizar transcripción
POST	/transcriptions/{id}/export	Exportar documento
GET	/transcriptions/{id}/download	Descargar audio
DELETE	/transcriptions/{id}	Eliminar transcripción


4. Motor de inteligencia artificial
Se utiliza Faster-Whisper, una implementación optimizada del modelo Whisper.

Infraestructura: Runpod Serverless.

Características:
- Reconocimiento automático de voz.
- Procesamiento de archivos de audio.
- Generación de texto transcrito.
- Procesamiento acelerado mediante GPU CUDA.
- Comunicación mediante API.
5. Base de datos y almacenamiento
Supabase
Se utiliza para:
- Registro y autenticación de usuarios.
- Almacenamiento de transcripciones.
- Información asociada a cada usuario.
- Gestión de registros.
- Políticas de seguridad mediante Row Level Security (RLS).
Cloudflare R2
Se utiliza para almacenar:
- Archivos de audio originales.
- Recursos asociados a las transcripciones.
El almacenamiento está desacoplado de la base de datos.
6. Exportación de documentos
AudioNet incorpora generación de documentos mediante:
Formato	Tecnología
Word (.docx)	python-docx
PDF (.pdf)	ReportLab
Texto (.txt)	Generación desde Python


La aplicación permite trabajar con el contenido de las transcripciones y exportarlo a diferentes formatos.
7. Infraestructura de producción
Servicio	Plataforma
Frontend	Netlify
Backend	Runpod Pod
Procesamiento IA	Runpod Serverless
Base de datos	Supabase
Almacenamiento	Cloudflare R2
Código fuente	GitHub


Imágenes Docker
Backend:
frankodev/audionet-api:latest

Worker:
frankodev/audionet-worker:latest

8. Seguridad
La arquitectura contempla:
- Autenticación mediante tokens de Supabase.
- Validación de usuarios en el backend.
- Uso de Service Role Key exclusivamente en el servidor.
- Separación de información por identificador de usuario.
- Políticas RLS en Supabase.
- Variables de entorno para credenciales.
- Exclusión de archivos .env del repositorio Git.
- Comunicación HTTPS entre servicios públicos.
9. Estructura del proyecto
AudioNet/
│
├── backend/
│   ├── main.py
│   ├── database.py
│   ├── exports.py
│   ├── storage.py
│   ├── requirements.txt
│   ├── Dockerfile
│   └── .dockerignore
│
├── frontend/
│   ├── src/
│   │   └── app/
│   ├── package.json
│   ├── package-lock.json
│   ├── next.config.ts
│   └── netlify.toml
│
├── worker/
│   ├── handler.py
│   ├── Dockerfile
│   └── requirements.txt
│
├── AudioNet.py
├── AudioNet.pyproj
├── AudioNet.sln
└── .gitignore

10. Estado actual y siguientes mejoras
Área	Estado
Despliegue frontend	Operativo
API backend	Operativa
Autenticación	Operativa
Procesamiento de audio	Operativo
Base de datos	Conectada
Almacenamiento	Conectado
Exportación	Implementada
Edición de transcripciones	Implementada


Próxima fase recomendada
1. Pruebas de seguridad y aislamiento entre usuarios.
2. Pruebas de carga y concurrencia.
3. Optimización de costos de infraestructura.
4. Monitoreo de errores y disponibilidad.
5. Copias de seguridad y recuperación.
6. Mejoras de experiencia de usuario.
Conclusión
AudioNet es una plataforma Full Stack con procesamiento de voz mediante inteligencia artificial, infraestructura distribuida y almacenamiento en la nube.

Su arquitectura modular permite escalar independientemente la interfaz, la API y el procesamiento de inteligencia artificial, sin tener que reconstruir toda la plataforma.

Importante: esta ficha describe la arquitectura y las tecnologías configuradas según nuestro proceso de despliegue. No representa todavía una auditoría completa del código, rendimiento, seguridad o escalabilidad.
