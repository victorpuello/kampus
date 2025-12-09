from django.core.management.base import BaseCommand
from django.core.mail import send_mail
from django.conf import settings
from students.models import Student, Enrollment, StudentDocument
from academic.models import AcademicYear
from datetime import datetime

class Command(BaseCommand):
    help = 'Sends weekly reminders for missing student documents'

    def handle(self, *args, **options):
        self.stdout.write('Checking for missing documents...')
        
        # Get active academic year
        active_year = AcademicYear.objects.filter(status='ACTIVE').first()
        if not active_year:
            self.stdout.write(self.style.WARNING('No active academic year found.'))
            return

        # Get active enrollments
        enrollments = Enrollment.objects.filter(
            academic_year=active_year,
            status='ACTIVE'
        ).select_related('student', 'student__user')

        required_docs = ['IDENTITY', 'VACCINES', 'EPS', 'ACADEMIC']
        doc_names = {
            'IDENTITY': 'Documento de Identidad',
            'VACCINES': 'Carnet de Vacunas',
            'EPS': 'Certificado EPS',
            'ACADEMIC': 'Certificado Académico'
        }

        emails_sent = 0

        for enrollment in enrollments:
            student = enrollment.student
            uploaded_types = set(
                StudentDocument.objects.filter(student=student).values_list('document_type', flat=True)
            )
            
            missing_docs = [doc for doc in required_docs if doc not in uploaded_types]
            
            if missing_docs:
                # Determine recipient email (Family member or Student User)
                recipient_email = student.user.email
                # Ideally check family members for main guardian email
                # main_guardian = student.familymember_set.filter(is_main_guardian=True).first()
                # if main_guardian and main_guardian.email:
                #     recipient_email = main_guardian.email
                
                if recipient_email:
                    missing_list = "\n".join([f"- {doc_names.get(d, d)}" for d in missing_docs])
                    
                    subject = f"Recordatorio: Documentos Pendientes - {student.user.first_name} {student.user.last_name}"
                    message = (
                        f"Estimado acudiente/estudiante,\n\n"
                        f"Le recordamos que el estudiante {student.user.first_name} {student.user.last_name} "
                        f"tiene los siguientes documentos pendientes de entrega para el año lectivo {active_year.year}:\n\n"
                        f"{missing_list}\n\n"
                        f"Por favor, acérquese a la secretaría o cárguelos a través de la plataforma lo antes posible.\n\n"
                        f"Atentamente,\n"
                        f"Secretaría Académica"
                    )
                    
                    try:
                        send_mail(
                            subject,
                            message,
                            settings.DEFAULT_FROM_EMAIL,
                            [recipient_email],
                            fail_silently=False,
                        )
                        emails_sent += 1
                        self.stdout.write(f"Email sent to {recipient_email} for student {student.id}")
                    except Exception as e:
                        self.stdout.write(self.style.ERROR(f"Failed to send email to {recipient_email}: {str(e)}"))
        
        self.stdout.write(self.style.SUCCESS(f'Successfully sent {emails_sent} reminder emails.'))
