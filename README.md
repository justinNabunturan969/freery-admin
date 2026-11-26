# Freery admin console

This is the head station console of the Freery ferry tracking system.
Only the administrators may open it.

## What is in here

- `app/` the pages and the API routes
- `components/` the parts the pages are built from
- `lib/` the database pool, the login and the mode rules
- `shared/` the types, the checks and the design tokens shared with the
  passenger website

## What is not in here

No password, no key and no connection string. They live in the environment
of the server that runs this app, never in the repository.

## The values the server needs

| Name | What it is |
|---|---|
| `DATABASE_URL` | The PostgreSQL connection string. The database is Neon, so this is a pooled address in the cloud |
| `DATABASE_SSL` | `true` when the database needs TLS |
| `DATABASE_POOL_MAX` | How many connections to keep open |
| `AUTH_SECRET` | The key that signs the login cookie |
| `ADMIN_MODE` | `admin` for the console |
| `ADMIN_ALLOWED_HOSTS` | The addresses allowed to open a page |
| `DEVICE_API_KEY` | The key the receiver sends with every packet |

## How to build it

```
npm install
npx next build
```

The build command on the hosting platform is `next build`, not
`npm run build`. The `npm run build` script wants a local environment
file, and the platform provides the values through the environment
instead.

## The database

It is **Neon**, a PostgreSQL in the cloud. There is no database server on
the computer to install and none to start.

The connection string is the pooled address of the `freery_station` role,
because this app opens connections many times. The schema changes are run
with the direct address, because a pooled address cannot carry them.

## How to run it on a computer

```
npm install
npm run dev
```

That needs an environment file next to this README with the values from
the table above. The file is not in the repository.
