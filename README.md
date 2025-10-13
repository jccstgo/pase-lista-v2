# Sistema Pase Lista v2

## Requisitos previos
- Node.js 18 o superior
- PostgreSQL 13 o superior

## Instalación
1. Instala dependencias:
   ```bash
   npm install
   ```
2. Copia el archivo de ejemplo de variables de entorno:
   ```bash
   cp .env.example .env
   ```
3. Ajusta las variables del archivo `.env` según tu entorno.

## Configuración de la base de datos
El sistema usa PostgreSQL mediante la variable `DATABASE_URL`. Su valor por defecto es:

```
postgresql://postgres:postgres@localhost:5432/pase_lista
```

Si tu usuario `postgres` tiene una contraseña diferente o utilizas otro usuario, debes actualizar `DATABASE_URL` en tu `.env`:

```
DATABASE_URL=postgresql://USUARIO:CONTRASENA@HOST:PUERTO/NOMBRE_BASE
```

Asegúrate de que:
- El servidor de PostgreSQL esté en ejecución.
- El usuario y contraseña sean válidos.
- La base de datos `pase_lista` exista (`createdb pase_lista`).

## Persistencia y carga de información
- Todos los datos de alumnos, asistencias, configuraciones, dispositivos y claves administrativas se almacenan directamente en PostgreSQL.
- La carpeta `data/` ya no contiene archivos CSV dentro del repositorio; se crea dinámicamente en el servidor únicamente cuando se generan respaldos.
- Para cargar listas de alumnos utiliza el panel de administración (`/admin`) y sube la información mediante la opción "Subir estudiantes".
- Los respaldos que exporta el sistema se guardan en `data/backups/`, directorio que está ignorado en Git para evitar subir información sensible.

## Ejecución
Inicia el servidor con:
```bash
npm start
```

## Solución de problemas

### Error: la autenticación password falló para el usuario "postgres"
Si durante el arranque ves un mensaje como:

```
❌ Error inicializando la base de datos PostgreSQL: error: la autenticación password falló para el usuario "postgres"
```

la conexión a PostgreSQL se rechazó porque la contraseña indicada no coincide con la registrada para ese usuario. Para corregirlo:

1. Abre tu archivo `.env` y revisa el valor de `DATABASE_URL`.
2. Comprueba cuál es la contraseña real del usuario configurado (por defecto `postgres`).
3. Actualiza `DATABASE_URL` con las credenciales correctas. Por ejemplo:
   ```
   DATABASE_URL=postgresql://postgres:tu_contraseña_real@localhost:5432/pase_lista
   ```
4. Guarda los cambios y ejecuta de nuevo `npm start`.

Si todavía aparece el error, verifica que el servidor de PostgreSQL esté en ejecución, que la base de datos exista y que el usuario tenga permisos de acceso. En Windows, revisa además el archivo `pg_hba.conf` para confirmar que permite conexiones locales con autenticación por contraseña.

## Convenciones y lineamientos del proyecto

Desde la versión localizada al español, todo el código fuente emplea identificadores, clases, métodos y mensajes en nuestro idioma. Para mantener la coherencia del repositorio:

- Usa **PascalCase** en clases y controladores (`ControladorAsistencias`).
- Prefiere **camelCase** en funciones, variables y manejadores (`registrarAsistencia`, `obtenerEstudiantePorId`).
- Declara constantes en **MAYÚSCULAS_CON_GUIONES_BAJOS** (`TIEMPO_MAXIMO_SESION`).
- Nombra archivos y módulos siguiendo kebab-case o snake_case según lo permita el ecosistema de Node.js (`servicio-asistencias.js`, `controlador_autenticacion.js`).
- Conserva en inglés únicamente los contratos externos (dependencias NPM, variables de entorno, rutas públicas existentes) para evitar rupturas con integraciones.

Cuando agregues nuevas funcionalidades, procura documentar las traducciones elegidas para términos técnicos en los comentarios o en esta sección para facilitar su reutilización en el resto del equipo.
