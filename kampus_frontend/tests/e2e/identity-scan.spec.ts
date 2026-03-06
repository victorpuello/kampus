import { expect, test } from '@playwright/test'

const tinyJpegBuffer = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wCEAAoHBwgHBgoICAoKCgkLDhgQDg0NDh0VFhEYIB0iIiAdHyggJCYxJx8fLT0tMTU3Ojo6Iys/RD84QzQ5Ojf/2wBDAQoKCg0NDxgQEBg3IRwhNzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3Nzc3N//AABEIABkAGQMBIgACEQEDEQH/xAAYAAADAQEAAAAAAAAAAAAAAAAABQYDB//EAB8QAAICAgMAAwAAAAAAAAAAAAECAAMRBBIhMUFRcf/EABYBAQEBAAAAAAAAAAAAAAAAAAABAv/EABgRAQADAQAAAAAAAAAAAAAAAAABAhEh/9oADAMBAAIRAxEAPwC8WwWg2wVnS8g8V0q9hP2Ck4+VwDqjPjCj6mB6Kj7L2l9FQW1mN7F0QkM7wYt2xw8qg1R8JmG4FJY4h5W7w9WQhYwS5Q8hYHj6m6Wm3gq9p6dV9k0RrVdY0e2m2W8Zb3f0g2C+f/Z',
  'base64',
)

const studentPayload = {
  id: 1,
  user: {
    id: 1,
    username: 'admin.mock',
    first_name: 'Admin',
    last_name: 'Demo',
    email: 'admin.mock@example.com',
    role: 'ADMIN',
  },
  document_type: 'TI',
  document_number: '1000001',
  place_of_issue: 'Bogotá',
  nationality: 'Colombiana',
  birth_date: null,
  sex: '',
  blood_type: '',
  address: '',
  neighborhood: '',
  phone: '',
  living_with: '',
  stratum: '',
  ethnicity: '',
  sisben_score: '',
  eps: '',
  is_victim_of_conflict: false,
  has_disability: false,
  disability_description: '',
  disability_type: '',
  support_needs: '',
  allergies: '',
  emergency_contact_name: '',
  emergency_contact_phone: '',
  emergency_contact_relationship: '',
  financial_status: 'SOLVENT',
  family_members: [],
  novelties: [],
  documents: [],
}

test('double-side scan flow shows preview and uploads composed PDF', async ({ page }) => {
  let composeCalled = 0
  let uploadCalled = 0

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

  await page.route('**/api/auth/csrf/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': 'csrftoken=e2e-token; Path=/',
      },
      body: JSON.stringify({ detail: 'ok' }),
    })
  })

  await page.route('**/api/students/1/', async (route) => {
    const method = route.request().method()
    if (method === 'GET') {
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentPayload) })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentPayload) })
  })

  await page.route('**/api/identity-scans/preview/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'image/jpeg',
      body: tinyJpegBuffer,
    })
  })

  await page.route('**/api/identity-scans/compose/', async (route) => {
    composeCalled += 1
    const payload = route.request().postData() || ''
    expect(payload).toContain('auto_perspective')
    expect(payload).toContain('false')
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
    })
  })

  await page.route('**/api/documents/', async (route) => {
    if (route.request().method() === 'POST') {
      uploadCalled += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({
          id: 99,
          student: 1,
          document_type: 'IDENTITY',
          file: null,
          file_download_url: '/api/documents/99/download/',
          description: 'Prueba doble cara',
          uploaded_at: new Date().toISOString(),
        }),
      })
      return
    }

    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/students/1')

  await page.getByRole('button', { name: /documentos/i }).click()
  await expect(page.getByRole('heading', { name: /cargar nuevo documento/i })).toBeVisible()

  await page.getByRole('button', { name: /doble cara/i }).click()

  const uploadForm = page
    .locator('form')
    .filter({ has: page.getByText(/modo de captura/i) })
    .first()

  const anversoInput = uploadForm.locator('input[type="file"]').nth(0)
  const reversoInput = uploadForm.locator('input[type="file"]').nth(1)

  await anversoInput.setInputFiles({
    name: 'anverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })
  await reversoInput.setInputFiles({
    name: 'reverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })

  await expect(page.getByAltText(/vista previa anverso/i)).toBeVisible({ timeout: 10000 })
  await expect(page.getByAltText(/vista previa reverso/i)).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: /subir documento/i }).click()

  await expect.poll(() => composeCalled).toBe(1)
  await expect.poll(() => uploadCalled).toBe(1)
})

test('double-side scan fallback preview works and compose error prevents upload', async ({ page }) => {
  let composeCalled = 0
  let uploadCalled = 0

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

  await page.route('**/api/auth/csrf/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': 'csrftoken=e2e-token; Path=/',
      },
      body: JSON.stringify({ detail: 'ok' }),
    })
  })

  await page.route('**/api/students/1/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentPayload) })
  })

  await page.route('**/api/identity-scans/preview/', async (route) => {
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'preview failed' }),
    })
  })

  await page.route('**/api/identity-scans/compose/', async (route) => {
    composeCalled += 1
    await route.fulfill({
      status: 500,
      contentType: 'application/json',
      body: JSON.stringify({ detail: 'compose failed' }),
    })
  })

  await page.route('**/api/documents/', async (route) => {
    if (route.request().method() === 'POST') {
      uploadCalled += 1
      await route.fulfill({
        status: 201,
        contentType: 'application/json',
        body: JSON.stringify({ id: 100 }),
      })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/students/1')
  await page.getByRole('button', { name: /documentos/i }).click()
  await page.getByRole('button', { name: /doble cara/i }).click()

  const uploadForm = page
    .locator('form')
    .filter({ has: page.getByText(/modo de captura/i) })
    .first()

  const anversoInput = uploadForm.locator('input[type="file"]').nth(0)
  const reversoInput = uploadForm.locator('input[type="file"]').nth(1)

  await anversoInput.setInputFiles({
    name: 'anverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })
  await reversoInput.setInputFiles({
    name: 'reverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })

  await expect(page.getByAltText(/vista previa anverso/i)).toBeVisible({ timeout: 10000 })
  await expect(page.getByAltText(/vista previa reverso/i)).toBeVisible({ timeout: 10000 })

  await page.getByRole('button', { name: /subir documento/i }).click()

  await expect.poll(() => composeCalled).toBe(1)
  await expect.poll(() => uploadCalled).toBe(0)
})

test('identity editor supports presets, resolution indicator and keyboard shortcuts', async ({ page }) => {
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

  await page.route('**/api/auth/csrf/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': 'csrftoken=e2e-token; Path=/',
      },
      body: JSON.stringify({ detail: 'ok' }),
    })
  })

  await page.route('**/api/students/1/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentPayload) })
  })

  await page.route('**/api/identity-scans/compose/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/pdf',
      body: '%PDF-1.4\n1 0 obj\n<<>>\nendobj\ntrailer\n<<>>\n%%EOF',
    })
  })

  await page.route('**/api/documents/', async (route) => {
    if (route.request().method() === 'POST') {
      await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ id: 101 }) })
      return
    }
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/students/1')
  await page.getByRole('button', { name: /documentos/i }).click()
  await page.getByRole('button', { name: /doble cara/i }).click()

  const uploadForm = page
    .locator('form')
    .filter({ has: page.getByText(/modo de captura/i) })
    .first()

  const anversoInput = uploadForm.locator('input[type="file"]').nth(0)
  const reversoInput = uploadForm.locator('input[type="file"]').nth(1)

  await anversoInput.setInputFiles({
    name: 'anverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })
  await reversoInput.setInputFiles({
    name: 'reverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })

  await expect(page.getByTestId('aspect-preset-id_h-anverso')).toBeVisible()
  await expect(page.getByTestId('resolution-status-anverso')).toBeVisible()

  await page.getByTestId('aspect-preset-square-anverso').click()

  page.once('dialog', async (dialog) => {
    await dialog.accept()
  })
  await page.keyboard.press('r')
  await page.keyboard.press('Enter')

  await expect(page.getByAltText(/vista previa anverso/i)).toBeVisible({ timeout: 10000 })
  await expect(page.getByTestId('after-toggle-anverso')).toBeVisible()
  await page.getByTestId('after-toggle-anverso').click()
})

test('identity editor shows sticky mobile apply action in fullscreen mode', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 })

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

  await page.route('**/api/auth/csrf/', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      headers: {
        'set-cookie': 'csrftoken=e2e-token; Path=/',
      },
      body: JSON.stringify({ detail: 'ok' }),
    })
  })

  await page.route('**/api/students/1/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(studentPayload) })
  })

  await page.route('**/api/documents/', async (route) => {
    await route.fulfill({ status: 200, contentType: 'application/json', body: '[]' })
  })

  await page.goto('/students/1')
  await page.getByRole('button', { name: /documentos/i }).click()
  await page.getByRole('button', { name: /doble cara/i }).click()

  const uploadForm = page
    .locator('form')
    .filter({ has: page.getByText(/modo de captura/i) })
    .first()

  const anversoInput = uploadForm.locator('input[type="file"]').nth(0)
  await anversoInput.setInputFiles({
    name: 'anverso.jpg',
    mimeType: 'image/jpeg',
    buffer: tinyJpegBuffer,
  })

  await expect(page.getByTestId('mobile-apply-crop-anverso')).toBeVisible({ timeout: 10000 })
})
