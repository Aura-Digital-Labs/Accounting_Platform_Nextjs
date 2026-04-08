$ErrorActionPreference = 'Stop'

if (-not $env:LOCAL_DATABASE_URL) {
  Write-Error 'LOCAL_DATABASE_URL is not set. Example: postgresql://user:pass@localhost:5432/accounting_new'
  exit 1
}

npx prisma db execute --url "$env:LOCAL_DATABASE_URL" --file "scripts/create-local-new-structure.sql"

Write-Output 'Local full-schema migration applied successfully.'
