import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import StudentList from './pages/StudentList'
import StudentProfile from './pages/StudentProfile'
import AcademicConfigPanel from './pages/AcademicConfigPanel'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardHome from './pages/DashboardHome'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/students/:id" element={<StudentProfile />} />
            <Route path="/academic-config" element={<AcademicConfigPanel />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
