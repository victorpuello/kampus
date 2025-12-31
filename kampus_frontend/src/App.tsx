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
import PlanningModule from './pages/planning/PlanningModule'
import RbacSettings from './pages/RbacSettings'
import SeoManager from './components/SeoManager'
import Grades from './pages/Grades'
import TeacherAssignments from './pages/TeacherAssignments'
import NotificationsPage from './pages/Notifications'
import GradeEditRequests from './pages/GradeEditRequests'
import PlanningEditRequests from './pages/PlanningEditRequests'
import AccountSettings from './pages/AccountSettings'
import DisciplineCases from './pages/DisciplineCases'
import DisciplineCaseDetail from './pages/DisciplineCaseDetail'
import PapPlans from './pages/PapPlans'
import PromotionWorkflow from './pages/PromotionWorkflow'

export default function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <Routes>
        <Route path="/login" element={<Login />} />
        
        <Route element={<ProtectedRoute />}>
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/my-assignment" element={<TeacherAssignments />} />
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
            <Route path="/planning" element={<PlanningModule />} />
            <Route path="/grades" element={<Grades />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/discipline/cases" element={<DisciplineCases />} />
            <Route path="/discipline/cases/:id" element={<DisciplineCaseDetail />} />
            <Route path="/edit-requests/grades" element={<GradeEditRequests />} />
            <Route path="/edit-requests/planning" element={<PlanningEditRequests />} />
            <Route path="/rbac" element={<RbacSettings />} />
            <Route path="/pap" element={<PapPlans />} />
            <Route path="/promotion" element={<PromotionWorkflow />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
