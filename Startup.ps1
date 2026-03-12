$ErrorActionPreference = "Stop"

Write-Host "Running: npm run build"
npm run build

Write-Host "Running: npm run weather:update"
npm run weather:update

Write-Host "Running: npx tsx Utils\\ClothesListGen"
npx tsx Utils\ClothesListGen
