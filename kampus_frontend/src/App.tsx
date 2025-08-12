import './App.css'
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import { useAuthStore } from './store/auth'
import StudentList from './pages/StudentList'
import StudentProfile from './pages/StudentProfile'
import AcademicConfigPanel from './pages/AcademicConfigPanel'

function Dashboard() {
  const user = useAuthStore((s) => s.user)
  const logout = useAuthStore((s) => s.logout)
  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Kampus</h1>
        <button className="text-sm underline" onClick={logout}>Cerrar sesión</button>
      </div>
      <p>Bienvenido{user ? `, ${user.first_name || user.username}` : ''}.</p>
      <nav className="space-x-4">
        <Link to="/">Inicio</Link>
        <Link to="/students">Estudiantes</Link>
        <Link to="/academic-config">Académico</Link>
      </nav>
    </div>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        <Route element={<ProtectedRoute />}>
          <Route path="/" element={<Dashboard />} />
          <Route path="/students" element={<StudentList />} />
          <Route path="/students/:id" element={<StudentProfile />} />
          <Route path="/academic-config" element={<AcademicConfigPanel />} />
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
