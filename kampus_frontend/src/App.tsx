import './App.css'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import Login from './pages/Login'
import StudentList from './pages/StudentList'
import StudentForm from './pages/StudentForm'
import StudentObserverPrint from './pages/StudentObserverPrint'
import StudentStudyCertificationPrint from './pages/StudentStudyCertificationPrint'
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
import EnrollmentBulkUpload from './pages/enrollments/EnrollmentBulkUpload'
import PlanningModule from './pages/planning/PlanningModule'
import RbacSettings from './pages/RbacSettings'
import SeoManager from './components/SeoManager'
import Grades from './pages/Grades'
import PreschoolGrades from './pages/PreschoolGrades'
import PreschoolGradebook from './pages/PreschoolGradebook'
import TeacherAssignments from './pages/TeacherAssignments'
import NotificationsPage from './pages/Notifications'
import GradeEditRequests from './pages/GradeEditRequests'
import PlanningEditRequests from './pages/PlanningEditRequests'
import AccountSettings from './pages/AccountSettings'
import DisciplineCases from './pages/DisciplineCases'
import DisciplineCaseDetail from './pages/DisciplineCaseDetail'
import PapPlans from './pages/PapPlans'
import PromotionWorkflow from './pages/PromotionWorkflow'
import CommissionsWorkflow from './pages/CommissionsWorkflow'
import TeacherStatistics from './pages/TeacherStatistics'
import DirectorCompliance from './pages/DirectorCompliance'
import SystemSettings from './pages/SystemSettings'
import AdministrativeCertificates from './pages/AdministrativeCertificates'
import AdministrativeCertificatesPreview from './pages/AdministrativeCertificatesPreview'
import AdministrativeCertificatesRevenue from './pages/AdministrativeCertificatesRevenue'
import AttendanceHome from './pages/attendance/AttendanceHome'
import AttendanceDeletionRequests from './pages/attendance/AttendanceDeletionRequests'
import AttendanceSession from './pages/attendance/AttendanceSession'
import AttendanceStats from './pages/attendance/AttendanceStats'
import GroupsManagement from './pages/GroupsManagement'
import GroupStudents from './pages/groups/GroupStudents'
import PublicCertificateVerify from './pages/PublicCertificateVerify'
import NoveltiesInbox from './pages/NoveltiesInbox'
import NoveltyCaseDetail from './pages/NoveltyCaseDetail'
import NoveltyCaseNew from './pages/NoveltyCaseNew'

export default function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <Routes>
        <Route path="/login" element={<Login />} />

        {/* Public QR verification (deploy-safe if /public is served by the SPA) */}
        <Route path="/public/certificates/:uuid" element={<PublicCertificateVerify />} />
        <Route path="/public/certificates/:uuid/verify" element={<PublicCertificateVerify />} />
        
        <Route element={<ProtectedRoute />}>
          <Route path="/students/:id/observer/print" element={<StudentObserverPrint />} />
          <Route path="/students/:id/certifications/study/print" element={<StudentStudyCertificationPrint />} />
          <Route element={<DashboardLayout />}>
            <Route path="/" element={<DashboardHome />} />
            <Route path="/my-assignment" element={<TeacherAssignments />} />
            <Route path="/students" element={<StudentList />} />
            <Route path="/students/new" element={<StudentForm />} />
            <Route path="/students/:id" element={<StudentForm />} />
            <Route path="/enrollments" element={<EnrollmentList />} />
            <Route path="/enrollments/new" element={<EnrollmentWizard />} />
            <Route path="/enrollments/existing" element={<EnrollmentExisting />} />
            <Route path="/enrollments/bulk-upload" element={<EnrollmentBulkUpload />} />
            <Route path="/enrollments/reports" element={<EnrollmentReports />} />
            <Route path="/teachers" element={<TeacherList />} />
            <Route path="/teachers/new" element={<TeacherForm />} />
            <Route path="/teachers/:id" element={<TeacherForm />} />
            <Route path="/users" element={<UserList />} />
            <Route path="/users/new" element={<UserForm />} />
            <Route path="/users/:id" element={<UserForm />} />
            <Route path="/groups" element={<GroupsManagement />} />
            <Route path="/groups/:groupId/students" element={<GroupStudents />} />
            <Route path="/academic-config" element={<AcademicConfigPanel />} />
            <Route path="/institution" element={<InstitutionSettings />} />
            <Route path="/campuses" element={<CampusList />} />
            <Route path="/campuses/new" element={<CampusForm />} />
            <Route path="/campuses/:id/edit" element={<CampusForm />} />
            <Route path="/planning" element={<PlanningModule />} />
            <Route path="/grades" element={<Grades />} />
            <Route path="/grades/preschool" element={<PreschoolGrades />} />
            <Route path="/grades/preschool/:teacherAssignmentId/:periodId" element={<PreschoolGradebook />} />
            <Route path="/notifications" element={<NotificationsPage />} />
            <Route path="/account" element={<AccountSettings />} />
            <Route path="/discipline/cases" element={<DisciplineCases />} />
            <Route path="/discipline/cases/:id" element={<DisciplineCaseDetail />} />
            <Route path="/novelties" element={<NoveltiesInbox />} />
            <Route path="/novelties/new" element={<NoveltyCaseNew />} />
            <Route path="/novelties/:id" element={<NoveltyCaseDetail />} />
            <Route path="/edit-requests/grades" element={<GradeEditRequests />} />
            <Route path="/edit-requests/planning" element={<PlanningEditRequests />} />
            <Route path="/rbac" element={<RbacSettings />} />
            <Route path="/pap" element={<PapPlans />} />
            <Route path="/promotion" element={<PromotionWorkflow />} />
            <Route path="/commissions" element={<CommissionsWorkflow />} />
            <Route path="/teacher-stats" element={<TeacherStatistics />} />
            <Route path="/teachers/director-compliance" element={<DirectorCompliance />} />
            <Route path="/attendance" element={<AttendanceHome />} />
            <Route path="/attendance/deletion-requests" element={<AttendanceDeletionRequests />} />
            <Route path="/attendance/sessions/:id" element={<AttendanceSession />} />
            <Route path="/attendance/stats" element={<AttendanceStats />} />
            <Route path="/administrativos/certificados" element={<AdministrativeCertificates />} />
            <Route path="/administrativos/certificados/preview" element={<AdministrativeCertificatesPreview />} />
            <Route path="/administrativos/certificados/ingresos" element={<AdministrativeCertificatesRevenue />} />
            <Route path="/system" element={<SystemSettings />} />
          </Route>
        </Route>
      </Routes>
    </BrowserRouter>
  )
}
