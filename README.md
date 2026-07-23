# ✨ Alahya T. Saltares Ortega — XV Años

Invitación digital de quinceañera con **RSVP** y **muro de deseos**, lista para **GitHub** + **Render** + **PostgreSQL**.

![stack](https://img.shields.io/badge/Node-18+-339933?logo=node.js&logoColor=white)
![pg](https://img.shields.io/badge/PostgreSQL-Render-4169E1?logo=postgresql&logoColor=white)
![render](https://img.shields.io/badge/Deploy-Render-46E3B7?logo=render&logoColor=white)

## Qué incluye

- Landing de gala (rosa blush + oro + tipografía editorial)
- Cuenta regresiva en vivo
- Itinerario, detalles y código de vestimenta
- **RSVP** guardado en PostgreSQL (nombre, invitados, alergias, mensaje)
- **Muro de deseos** público
- Panel admin de confirmaciones (`GET /api/rsvps` + header secreto)
- Funciona en local **sin** Postgres (memoria) para previsualizar

## Arranque local

```bash
cd alahya-quince
cp .env.example .env
npm install
npm start
```

Abre [http://localhost:3000](http://localhost:3000).

Con PostgreSQL local:

```env
DATABASE_URL=postgresql://usuario:clave@localhost:5432/alahya_quince
ADMIN_SECRET=tu-secreto-largo
EVENT_DATE=2026-08-15T18:00:00-04:00
```

Las tablas se crean solas al arrancar.

## Despliegue en Render (recomendado)

### Opción A — Blueprint (`render.yaml`)

1. Sube este repo a GitHub.
2. En [Render](https://dashboard.render.com) → **New** → **Blueprint**.
3. Conecta el repositorio. Render crea:
   - Web Service `alahya-quince`
   - Base de datos Postgres `alahya-quince-db`
   - `DATABASE_URL` y `ADMIN_SECRET` automáticos
4. Deploy. La URL quedará tipo `https://alahya-quince.onrender.com`.

### Opción B — Manual

1. **New PostgreSQL** → copia la *Internal Database URL*.
2. **New Web Service** → conecta el repo.
   - Runtime: Node  
   - Build: `npm install`  
   - Start: `npm start`
3. Variables de entorno:

| Variable        | Valor                                      |
|-----------------|--------------------------------------------|
| `DATABASE_URL`  | Internal URL de Postgres                   |
| `ADMIN_SECRET`  | Contraseña larga (guárdala)                |
| `EVENT_DATE`    | ISO del evento, ej. `2026-08-15T18:00:00-04:00` |
| `NODE_ENV`      | `production`                               |

> En el plan free, el servicio se duerme tras inactividad; el primer hit puede tardar ~30–50 s.

## Admin: ver RSVPs

```bash
curl -H "X-Admin-Secret: TU_ADMIN_SECRET" https://TU-APP.onrender.com/api/rsvps
```

Respuesta: resumen (sí/no/total invitados) + lista completa.

## Personalizar

| Qué              | Dónde                                      |
|------------------|--------------------------------------------|
| Fecha / hora     | `EVENT_DATE` en Render o `.env`            |
| Textos / lugares | `public/index.html` (sección detalles)     |
| Colores          | `public/styles.css` (`:root`)              |
| Nombre           | HTML + `server.js` → `/api/event`          |

## API

| Método | Ruta           | Descripción              |
|--------|----------------|--------------------------|
| GET    | `/api/health`  | Health + DB              |
| GET    | `/api/event`   | Metadatos del evento     |
| POST   | `/api/rsvp`    | Confirmar asistencia     |
| GET    | `/api/rsvps`   | Admin (header secreto)   |
| GET    | `/api/wishes`  | Listar deseos            |
| POST   | `/api/wishes`  | Publicar deseo           |

## Estructura

```
alahya-quince/
├── public/          # Frontend estático
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── server.js        # Express API
├── db.js            # PostgreSQL + fallback memoria
├── render.yaml      # Blueprint Render
├── package.json
└── .env.example
```

## Licencia

MIT — celebra con amor 👑
