import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

const siteUrlRaw = process.env.SITE_URL || 'http://localhost:5173'
const siteUrl = siteUrlRaw.replace(/\/$/, '')

if (!process.env.SITE_URL) {
  console.warn('[SEO] SITE_URL no está definido; usando', siteUrl)
}

const now = new Date().toISOString().slice(0, 10)

const paths = [
  '/',
  '/login',
  '/students',
  '/teachers',
  '/users',
  '/academic-config',
  '/institution',
  '/campuses',
  '/planning',
  '/enrollments',
  '/enrollments/new',
  '/enrollments/existing',
  '/enrollments/reports'
]

const urlEntries = paths
  .map(
    (p) => `  <url>\n    <loc>${siteUrl}${p}</loc>\n    <lastmod>${now}</lastmod>\n  </url>`
  )
  .join('\n')

const sitemap = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urlEntries}
</urlset>
`

const robots = `User-agent: *
Allow: /

Sitemap: ${siteUrl}/sitemap.xml
`

const publicDir = resolve(process.cwd(), 'public')
writeFileSync(resolve(publicDir, 'sitemap.xml'), sitemap, 'utf8')
writeFileSync(resolve(publicDir, 'robots.txt'), robots, 'utf8')
