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

test('root route redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/')
  await expect(page).toHaveURL(/\/login$/)
})

test('root route redirects authenticated users to dashboard', async ({ page }) => {
  await page.route('**/api/users/me/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 1,
        username: 'admin.mock',
        first_name: 'Admin',
        last_name: 'Demo',
        email: 'admin.mock@example.com',
        role: 'ADMIN',
      }),
    })
  })

  await page.goto('/')
  await expect(page).toHaveURL(/\/dashboard$/)
})

test('protected route redirects unauthenticated users to login', async ({ page }) => {
  await page.goto('/gobierno-escolar/monitoreo')
  await expect(page).toHaveURL(/\/login$/)
})

test('teacher sidebar shows assignment and attendance options', async ({ page }) => {
  await page.route('**/api/users/me/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify({
        id: 10,
        username: 'teacher.mock',
        first_name: 'Docente',
        last_name: 'Demo',
        email: 'teacher.mock@example.com',
        role: 'TEACHER',
      }),
    })
  })

  await page.goto('/my-assignment')

  const academicMenu = page.getByRole('button', { name: /académico/i })
  const isExpanded = await academicMenu.getAttribute('aria-expanded')
  if (isExpanded !== 'true') {
    await academicMenu.click()
    await expect(academicMenu).toHaveAttribute('aria-expanded', 'true')
  }

  const sidebarNav = page.locator('nav')
  await expect(sidebarNav.getByText(/asignación académica|asignacion académica/i)).toBeVisible()
  await expect(sidebarNav.getByText(/tomar asistencias/i)).toBeVisible()
})
