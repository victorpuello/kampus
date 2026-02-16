import './App.css'
import { lazy, Suspense } from 'react'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import ProtectedRoute from './components/ProtectedRoute'
import DashboardLayout from './layouts/DashboardLayout'
import SeoManager from './components/SeoManager'

const Login = lazy(() => import('./pages/Login'))
const StudentList = lazy(() => import('./pages/StudentList'))
const StudentForm = lazy(() => import('./pages/StudentForm'))
const StudentObserverPrint = lazy(() => import('./pages/StudentObserverPrint'))
const StudentStudyCertificationPrint = lazy(() => import('./pages/StudentStudyCertificationPrint'))
const TeacherList = lazy(() => import('./pages/TeacherList'))
const TeacherForm = lazy(() => import('./pages/TeacherForm'))
const UserList = lazy(() => import('./pages/UserList'))
const UserForm = lazy(() => import('./pages/UserForm'))
const AcademicConfigPanel = lazy(() => import('./pages/AcademicConfigPanel'))
const InstitutionSettings = lazy(() => import('./pages/InstitutionSettings'))
const CampusList = lazy(() => import('./pages/CampusList'))
const CampusForm = lazy(() => import('./pages/CampusForm'))
const DashboardHome = lazy(() => import('./pages/DashboardHome'))
const EnrollmentList = lazy(() => import('./pages/enrollments/EnrollmentList'))
const EnrollmentWizard = lazy(() => import('./pages/enrollments/EnrollmentWizard'))
const EnrollmentExisting = lazy(() => import('./pages/enrollments/EnrollmentExisting'))
const EnrollmentReports = lazy(() => import('./pages/enrollments/EnrollmentReports'))
const EnrollmentBulkUpload = lazy(() => import('./pages/enrollments/EnrollmentBulkUpload'))
const PlanningModule = lazy(() => import('./pages/planning/PlanningModule'))
const RbacSettings = lazy(() => import('./pages/RbacSettings'))
const Grades = lazy(() => import('./pages/Grades'))
const PreschoolGrades = lazy(() => import('./pages/PreschoolGrades'))
const PreschoolGradebook = lazy(() => import('./pages/PreschoolGradebook'))
const TeacherAssignments = lazy(() => import('./pages/TeacherAssignments'))
const NotificationsPage = lazy(() => import('./pages/Notifications'))
const GradeEditRequests = lazy(() => import('./pages/GradeEditRequests'))
const PlanningEditRequests = lazy(() => import('./pages/PlanningEditRequests'))
const AccountSettings = lazy(() => import('./pages/AccountSettings'))
const DisciplineCases = lazy(() => import('./pages/DisciplineCases'))
const DisciplineCaseDetail = lazy(() => import('./pages/DisciplineCaseDetail'))
const PapPlans = lazy(() => import('./pages/PapPlans'))
const PromotionWorkflow = lazy(() => import('./pages/PromotionWorkflow'))
const CommissionsWorkflow = lazy(() => import('./pages/CommissionsWorkflow'))
const TeacherStatistics = lazy(() => import('./pages/TeacherStatistics'))
const DirectorCompliance = lazy(() => import('./pages/DirectorCompliance'))
const SystemSettings = lazy(() => import('./pages/SystemSettings'))
const AdministrativeCertificates = lazy(() => import('./pages/AdministrativeCertificates'))
const AdministrativeCertificatesPreview = lazy(() => import('./pages/AdministrativeCertificatesPreview'))
const AdministrativeCertificatesRevenue = lazy(() => import('./pages/AdministrativeCertificatesRevenue'))
const AttendanceHome = lazy(() => import('./pages/attendance/AttendanceHome'))
const AttendanceDeletionRequests = lazy(() => import('./pages/attendance/AttendanceDeletionRequests'))
const AttendanceSession = lazy(() => import('./pages/attendance/AttendanceSession'))
const AttendanceStats = lazy(() => import('./pages/attendance/AttendanceStats'))
const GroupsManagement = lazy(() => import('./pages/GroupsManagement'))
const GroupStudents = lazy(() => import('./pages/groups/GroupStudents'))
const PublicCertificateVerify = lazy(() => import('./pages/PublicCertificateVerify'))
const NoveltiesInbox = lazy(() => import('./pages/NoveltiesInbox'))
const NoveltyCaseDetail = lazy(() => import('./pages/NoveltyCaseDetail'))
const NoveltyCaseNew = lazy(() => import('./pages/NoveltyCaseNew'))

export default function App() {
  return (
    <BrowserRouter>
      <SeoManager />
      <Suspense fallback={<div className="p-4 text-sm text-slate-600 dark:text-slate-300">Cargando...</div>}>
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
      </Suspense>
    </BrowserRouter>
  )
}
