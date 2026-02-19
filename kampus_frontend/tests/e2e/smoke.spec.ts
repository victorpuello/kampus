import { expect, test } from '@playwright/test'

test('login page renders', async ({ page }) => {
  await page.goto('/login')
  await expect(page).toHaveURL(/\/login$/)
  await expect(page.getByRole('button', { name: /iniciar sesión|ingresar/i })).toBeVisible()
})

test('public voting page renders', async ({ page }) => {
  await page.goto('/votaciones')
  await expect(page).toHaveURL(/\/votaciones$/)
  await expect(page.getByRole('button', { name: /iniciar votación/i })).toBeVisible()
  await page.getByRole('button', { name: /iniciar votación/i }).click()
  await expect(page.getByLabel(/código de acceso \(manual\)/i)).toBeVisible()
  await expect(page.getByRole('button', { name: /validar/i })).toBeVisible()
})

test('protected route redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/gobierno-escolar/monitoreo')
  await expect(page).toHaveURL(/\/login$/)
})
