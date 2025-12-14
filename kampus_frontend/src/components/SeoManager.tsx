import { useEffect } from 'react'
import { useLocation } from 'react-router-dom'

type SeoConfig = {
  title: string
  description: string
  robots?: string
}

const getAppName = () => (import.meta.env.VITE_APP_NAME as string | undefined) || 'Kampus'

const upsertMetaByName = (name: string, content: string) => {
  let el = document.querySelector(`meta[name="${name}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('name', name)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

const upsertMetaByProperty = (property: string, content: string) => {
  let el = document.querySelector(`meta[property="${property}"]`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute('property', property)
    document.head.appendChild(el)
  }
  el.setAttribute('content', content)
}

const upsertLink = (rel: string, href: string) => {
  let el = document.querySelector(`link[rel="${rel}"]`) as HTMLLinkElement | null
  if (!el) {
    el = document.createElement('link')
    el.setAttribute('rel', rel)
    document.head.appendChild(el)
  }
  el.setAttribute('href', href)
}

const buildCanonical = (pathname: string) => {
  const origin = window.location.origin
  return `${origin}${pathname}`
}

const getSeoForPath = (pathname: string): SeoConfig => {
  const app = getAppName()

  if (pathname === '/login') {
    return {
      title: `Iniciar sesión | ${app}`,
      description: 'Accede a Kampus para gestionar estudiantes, docentes, matrículas y planeación académica.'
    }
  }

  if (pathname === '/') {
    return {
      title: `Panel principal | ${app}`,
      description: 'Panel de control de Kampus para la gestión escolar y académica.'
    }
  }

  if (pathname.startsWith('/students')) {
    return {
      title: `Estudiantes | ${app}`,
      description: 'Gestión de estudiantes: directorio, registro y actualización de información.'
    }
  }

  if (pathname.startsWith('/teachers')) {
    return {
      title: `Docentes | ${app}`,
      description: 'Gestión de docentes y asignaciones académicas por grupo y año lectivo.'
    }
  }

  if (pathname.startsWith('/users')) {
    return {
      title: `Usuarios | ${app}`,
      description: 'Administración de usuarios, permisos y control de acceso.'
    }
  }

  if (pathname.startsWith('/enrollments')) {
    return {
      title: `Matrículas | ${app}`,
      description: 'Gestión de matrículas, registros y reportes.'
    }
  }

  if (pathname === '/academic-config') {
    return {
      title: `Configuración académica | ${app}`,
      description: 'Configuración de niveles, grados, grupos, áreas, asignaturas y plan de estudios.'
    }
  }

  if (pathname === '/planning') {
    return {
      title: `Planeación académica | ${app}`,
      description: 'Planeación académica por periodos: dimensiones, logros e indicadores.'
    }
  }

  if (pathname === '/institution') {
    return {
      title: `Institución | ${app}`,
      description: 'Configuración y datos generales de la institución educativa.'
    }
  }

  if (pathname.startsWith('/campuses')) {
    return {
      title: `Sedes | ${app}`,
      description: 'Gestión de sedes: información, niveles ofertados y datos administrativos.'
    }
  }

  return {
    title: app,
    description: 'Kampus: plataforma de gestión escolar para estudiantes, docentes, matrículas, planeación académica y reportes.'
  }
}

export default function SeoManager() {
  const location = useLocation()

  useEffect(() => {
    const pathname = location.pathname || '/'
    const seo = getSeoForPath(pathname)
    const canonical = buildCanonical(pathname)

    document.documentElement.lang = 'es'
    document.title = seo.title

    upsertMetaByName('description', seo.description)
    upsertMetaByName('twitter:title', seo.title)
    upsertMetaByName('twitter:description', seo.description)

    upsertMetaByProperty('og:title', seo.title)
    upsertMetaByProperty('og:description', seo.description)
    upsertMetaByProperty('og:url', canonical)

    upsertLink('canonical', canonical)

    if (seo.robots) {
      upsertMetaByName('robots', seo.robots)
    }
  }, [location.pathname])

  return null
}
