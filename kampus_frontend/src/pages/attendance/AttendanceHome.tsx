import { useAuthStore } from '../../store/auth'
import AttendanceManualSheets from './AttendanceManualSheets'
import TeacherAttendance from './TeacherAttendance'

export default function AttendanceHome() {
  const user = useAuthStore((s) => s.user)

  if (user?.role === 'TEACHER') {
    return <TeacherAttendance />
  }

  return <AttendanceManualSheets />
}
