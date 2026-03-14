# awesome-node-auth — Live Demo Examples

Ready-to-run, StackBlitz-compatible boilerplates for `awesome-node-auth`.
Each example uses an **in-memory store** so nothing needs to be configured to get started.

## Demos

| Folder | Stack | StackBlitz |
|--------|-------|-----------|
| [`./`](.) | Express + Vanilla HTML | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo) |
| [`nestjs-fullstack/`](./nestjs-fullstack) | NestJS + TypeScript + Vanilla HTML | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo/nestjs-fullstack) |
| [`nextjs-fullstack/`](./nextjs-fullstack) | Next.js 15 Pages Router + React | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo/nextjs-fullstack) |
| [`angular-ssr/`](./angular-ssr) | Angular 19 SSR + Express + Guards + Interceptors | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo/angular-ssr) |
| [`express-angular-spa/`](./express-angular-spa) | Express API + Angular 19 SPA | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo/express-angular-spa) |
| [`advanced-telemetry-webhooks/`](./advanced-telemetry-webhooks) | Express API + MongoDB + AuthTools | [![Open in StackBlitz](https://developer.stackblitz.com/img/open_in_stackblitz_small.svg)](https://stackblitz.com/github/nik2208/awesome-node-auth/tree/main/demo/advanced-telemetry-webhooks) |

## Running locally

Each demo is a self-contained project. Clone the repo and run:

```bash
cd demo/<demo-name>
npm install
npm start
```

## Environment variables

Each demo includes a `.env.example` (or `.env.local.example` for Next.js) with placeholder values.
Copy it and fill in real secrets to unlock all features:

```bash
cp .env.example .env
# or for Next.js:
cp .env.local.example .env.local
```

The demos work without a real `.env` file using safe fallback values, but you **must** change the JWT secrets in production.

## In-memory store

All demos use `InMemoryUserStore` — data is reset when the server restarts.
Replace it with a real store from the [database docs](https://www.awesomenodeauth.com/docs/database).
