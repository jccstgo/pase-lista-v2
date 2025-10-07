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

## Ejecución
Inicia el servidor con:
```bash
npm start
```

Si aparece `Error: la autenticación password falló para el usuario "postgres"`, significa que las credenciales de `DATABASE_URL` no coinciden con las configuradas en PostgreSQL. Corrige la contraseña o crea un usuario con esa contraseña.
