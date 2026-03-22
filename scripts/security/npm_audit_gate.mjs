import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const frontendDir = path.resolve(__dirname, '../../kampus_frontend')

const exceptions = [
  {
    id: 'EXC-20260321-001',
    tool: 'npm-audit',
    package: 'xlsx',
    advisoryUrl: 'https://github.com/advisories/GHSA-4r6h-8v6p-xvw6',
    severity: 'high',
    expiresOn: '2026-04-20',
    reason: 'No upstream fix available; package is required for election XLSX import/export flow.'
  },
  {
    id: 'EXC-20260321-002',
    tool: 'npm-audit',
    package: 'xlsx',
    advisoryUrl: 'https://github.com/advisories/GHSA-5pgg-2g8v-p4x9',
    severity: 'high',
    expiresOn: '2026-04-20',
    reason: 'No upstream fix available; package is required for election XLSX import/export flow.'
  }
]

function runAuditJson() {
  const audit = spawnSync('npm', ['audit', '--omit=dev', '--json'], {
    cwd: frontendDir,
    encoding: 'utf8',
    shell: false
  })

  const payload = (audit.stdout || '').trim() || (audit.stderr || '').trim()
  if (!payload) {
    throw new Error('npm audit did not return JSON output.')
  }

  try {
    return JSON.parse(payload)
  } catch (error) {
    throw new Error(`Unable to parse npm audit JSON output: ${error.message}`)
  }
}

function isHighOrCritical(entry) {
  return entry?.severity === 'high' || entry?.severity === 'critical'
}

function extractFindings(report) {
  const vulnerabilities = report?.vulnerabilities || {}
  const findings = []

  for (const [pkgName, vuln] of Object.entries(vulnerabilities)) {
    const viaEntries = Array.isArray(vuln?.via) ? vuln.via : []
    for (const via of viaEntries) {
      if (typeof via !== 'object') {
        continue
      }
      if (!isHighOrCritical(via)) {
        continue
      }
      findings.push({
        package: pkgName,
        severity: via.severity,
        advisoryUrl: via.url || '',
        title: via.title || 'Unknown advisory',
        fixAvailable: vuln.fixAvailable
      })
    }
  }

  return findings
}

function findException(finding) {
  const today = new Date().toISOString().slice(0, 10)
  return exceptions.find((entry) => {
    if (entry.package !== finding.package) {
      return false
    }
    if (entry.advisoryUrl !== finding.advisoryUrl) {
      return false
    }
    if (entry.severity !== finding.severity) {
      return false
    }
    return entry.expiresOn >= today
  })
}

try {
  const report = runAuditJson()
  const findings = extractFindings(report)

  if (findings.length === 0) {
    console.log('npm audit gate passed: no high/critical production vulnerabilities.')
    process.exit(0)
  }

  const blocked = []
  const allowed = []

  for (const finding of findings) {
    const exception = findException(finding)
    if (exception) {
      allowed.push({ finding, exception })
    } else {
      blocked.push(finding)
    }
  }

  if (allowed.length > 0) {
    console.log('Allowed vulnerabilities with active exceptions:')
    for (const item of allowed) {
      const { finding, exception } = item
      console.log(`- ${finding.package} | ${finding.severity.toUpperCase()} | ${finding.advisoryUrl} | ${exception.id} (expires ${exception.expiresOn})`)
    }
  }

  if (blocked.length > 0) {
    console.error('Blocked vulnerabilities (no active exception):')
    for (const finding of blocked) {
      console.error(`- ${finding.package} | ${finding.severity.toUpperCase()} | ${finding.advisoryUrl} | ${finding.title}`)
    }
    process.exit(1)
  }

  console.log('npm audit gate passed with active exceptions only.')
} catch (error) {
  console.error(error.message)
  process.exit(1)
}
