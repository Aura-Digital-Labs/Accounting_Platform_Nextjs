# Accounting Platform Next.js

Accounting platform built with Next.js.

## Getting Started

Run the development server:

```bash
npm run dev
```

Open http://localhost:3000 (or the next available port shown in the terminal).

## Deploy To Vercel

1. Push this repository to GitHub.
2. In Vercel, click `Add New` -> `Project`.
3. Import this repository.
4. Keep framework preset as `Next.js`.
5. Add these environment variables in Vercel (Project Settings -> Environment Variables):

```env
DATABASE_URL=
NEXTAUTH_URL=
NEXTAUTH_SECRET=
ACCESS_TOKEN_EXPIRE_MINUTES=120
INITIAL_ADMIN_NAME=
INITIAL_ADMIN_EMAIL=
INITIAL_ADMIN_PASSWORD=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REFRESH_TOKEN=
GOOGLE_DRIVE_EXPENSES_FOLDER_ID=
GOOGLE_DRIVE_CLIENT_PAYMENTS_FOLDER_ID=
GOOGLE_DRIVE_BANK_STATEMENTS_FOLDER_ID=
```

6. Set `NEXTAUTH_URL` to your Vercel production domain, for example:

```env
NEXTAUTH_URL=https://your-project-name.vercel.app
```

7. Deploy.

Notes:
- `postinstall` runs `prisma generate` automatically during install/build.
- If you use an external Postgres provider (for example Render), ensure it allows Vercel connections and SSL.
