import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import StudentList from './pages/StudentList'
import StudentForm from './pages/StudentForm'
import TeacherList from './pages/TeacherList'
import TeacherForm from './pages/TeacherForm'
import UserList from './pages/UserList'
import UserForm from './pages/UserForm'
import AcademicConfigPanel from './pages/AcademicConfigPanel'
import InstitutionSettings from './pages/InstitutionSettings'
import CampusList from './pages/CampusList'
import CampusForm from './pages/CampusForm'
import DashboardLayout from './layouts/DashboardLayout'
import DashboardHome from './pages/DashboardHome'
import EnrollmentList from './pages/enrollments/EnrollmentList'
import EnrollmentWizard from './pages/enrollments/EnrollmentWizard'
import EnrollmentExisting from './pages/enrollments/EnrollmentExisting'
import EnrollmentReports from './pages/enrollments/EnrollmentReports'

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/students/new" element={<StudentForm />} />
            <Route path="/students/:id" element={<StudentForm />} />
            <Route path="/enrollments" element={<EnrollmentList />} />
            <Route path="/enrollments/new" element={<EnrollmentWizard />} />
            <Route path="/enrollments/existing" element={<EnrollmentExisting />} />
            <Route path="/enrollments/reports" element={<EnrollmentReports />} />
            <Route path="/teachers" element={<TeacherList />} />
            <Route path="/teachers/new" element={<TeacherForm />} />
            <Route path="/teachers/:id" element={<TeacherForm />} />
            <Route path="/users" element={<UserList />} />
            <Route path="/users/new" element={<UserForm />} />
            <Route path="/users/:id" element={<UserForm />} />
            <Route path="/academic-config" element={<AcademicConfigPanel />} />
            <Route path="/institution" element={<InstitutionSettings />} />
            <Route path="/campuses" element={<CampusList />} />
            <Route path="/campuses/new" element={<CampusForm />} />
            <Route path="/campuses/:id/edit" element={<CampusForm />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
