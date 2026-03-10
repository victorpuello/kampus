import { useAuthStore } from '../../store/auth'
import AttendanceManualSheets from './AttendanceManualSheets'
import AttendanceStats from './AttendanceStats'
import TeacherAttendance from './TeacherAttendance'

export default function AttendanceHome() {
  const user = useAuthStore((s) => s.user)

  if (user?.role === 'TEACHER') {
    return <TeacherAttendance />
  }

  if (user?.role === 'ADMIN' || user?.role === 'SUPERADMIN') {
    return <AttendanceStats />
  }

  return <AttendanceManualSheets />
}
