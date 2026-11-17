# Sistema de gestión de socios

Trabajo integrador de Cherai Venencia, 4.º 9.ª

## ¿Qué hace?

Permite iniciar sesión y administrar socios, categorías y usuarios desde una página web.

- Un **ADMIN** puede administrar usuarios, categorías y socios.
- Un **OPERADOR** puede registrar y editar socios.
- El sistema guarda un historial de acciones importantes.

## ¿Cómo está hecho?

- **Página web:** la pantalla que usa la persona.
- **Servidor:** recibe y revisa las solicitudes.
- **MySQL:** guarda la información.

## Seguridad, explicado simple

- Las contraseñas se guardan como un hash: el sistema no guarda la contraseña original.
- El DNI y el email se guardan cifrados en la base de datos.
- Hay permisos distintos para ADMIN y OPERADOR.
- Después de varios intentos fallidos, el acceso se bloquea por un rato.
- Las bajas de socios y categorías son lógicas: se desactivan, pero no se borran de la base.

## Qué necesitás

- Node.js 18 o más nuevo.
- MySQL 8.

## Cómo iniciar el sistema en Windows

Abrí PowerShell dentro de esta carpeta y seguí estos pasos.

### 1. Instalar el proyecto

```powershell
npm install
Copy-Item .env.example .env
```

### 2. Preparar la configuración

Abrí el archivo `.env` y completá los datos de conexión a MySQL: `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD` y `DB_NAME`.

El sistema también necesita cuatro claves secretas. Ejecutá este comando **cuatro veces**:

```powershell
node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
```

Copiá cada resultado en uno de estos campos de `.env`, usando un resultado diferente para cada uno:

- `SESSION_SECRET`
- `DATA_ENCRYPTION_KEY`
- `EXPORT_ENCRYPTION_KEY`
- `DNI_HASH_KEY`

No compartas las claves ni publiques el archivo `.env`.

### 3. Crear las tablas y el primer administrador

En `.env`, completá temporalmente `BOOTSTRAP_ADMIN_USERNAME` y `BOOTSTRAP_ADMIN_PASSWORD`. La contraseña debe tener al menos 12 caracteres.

Después ejecutá:

```powershell
npm run db:init
npm run admin:create
```

Cuando termine, podés borrar `BOOTSTRAP_ADMIN_USERNAME` y `BOOTSTRAP_ADMIN_PASSWORD` de `.env`.

### 4. Abrir la página

```powershell
npm run dev
```

Entrá a [http://localhost:3000](http://localhost:3000). Para detener el sistema, volvé a PowerShell y apretá `Ctrl+C`.

## Para mostrar el proyecto

Podés explicar que el sistema tiene una página web, un servidor y una base de datos. El servidor controla quién puede hacer cada acción y protege algunos datos antes de guardarlos.

Para comprobar que sigue funcionando:

```powershell
npm test
npm run build
```