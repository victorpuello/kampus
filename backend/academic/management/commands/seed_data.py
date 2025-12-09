from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from core.models import Institution, Campus
from academic.models import AcademicYear, Period, AcademicLevel, Grade, Area, Subject, Group
from datetime import date

User = get_user_model()

class Command(BaseCommand):
    help = 'Seeds the database with initial test data'

    def handle(self, *args, **options):
        self.stdout.write('Seeding data...')

        # 1. Users
        self.stdout.write('Creating users...')
        admin, _ = User.objects.get_or_create(
            email='admin@kampus.com',
            defaults={
                'username': 'admin',
                'first_name': 'Admin',
                'last_name': 'User',
                'role': 'ADMIN',
                'is_staff': True,
                'is_superuser': True
            }
        )
        admin.set_password('admin123')
        admin.save()

        teacher1, _ = User.objects.get_or_create(
            email='teacher1@kampus.com',
            defaults={
                'username': 'teacher1',
                'first_name': 'Juan',
                'last_name': 'Pérez',
                'role': 'TEACHER'
            }
        )
        teacher1.set_password('teacher123')
        teacher1.save()

        teacher2, _ = User.objects.get_or_create(
            email='teacher2@kampus.com',
            defaults={
                'username': 'teacher2',
                'first_name': 'Maria',
                'last_name': 'Gomez',
                'role': 'TEACHER'
            }
        )
        teacher2.set_password('teacher123')
        teacher2.save()

        secretary, _ = User.objects.get_or_create(
            email='secretary@kampus.com',
            defaults={
                'username': 'secretary',
                'first_name': 'Ana',
                'last_name': 'Lopez',
                'role': 'SECRETARY'
            }
        )
        secretary.set_password('secretary123')
        secretary.save()

        # 2. Institution & Campus
        self.stdout.write('Creating institution and campuses...')
        inst, _ = Institution.objects.get_or_create(
            name='Institución Educativa Kampus',
            defaults={
                'nit': '900123456-1',
                'dane_code': '123456789012',
                'address': 'Calle 123 # 45-67',
                'phone': '3001234567',
                'email': 'contacto@kampus.edu.co',
                'rector': admin,
                'secretary': secretary
            }
        )

        campus_main, _ = Campus.objects.get_or_create(
            name='Sede Principal',
            institution=inst,
            defaults={'is_main': True}
        )
        
        campus_sec, _ = Campus.objects.get_or_create(
            name='Sede Primaria',
            institution=inst,
            defaults={'is_main': False}
        )

        # 3. Academic Year & Periods
        self.stdout.write('Creating academic year and periods...')
        current_year = date.today().year
        year, _ = AcademicYear.objects.get_or_create(year=current_year)

        periods_data = [
            ('Primer Periodo', date(current_year, 2, 1), date(current_year, 4, 15)),
            ('Segundo Periodo', date(current_year, 4, 16), date(current_year, 6, 30)),
            ('Tercer Periodo', date(current_year, 7, 15), date(current_year, 9, 15)),
            ('Cuarto Periodo', date(current_year, 9, 16), date(current_year, 11, 30)),
        ]

        for p_name, start, end in periods_data:
            Period.objects.get_or_create(
                academic_year=year,
                name=p_name,
                defaults={'start_date': start, 'end_date': end}
            )

        # 4. Levels & Grades
        self.stdout.write('Creating levels and grades...')
        levels_config = [
            ('Preescolar', 'PRESCHOOL', 3, 5, ['Jardín', 'Transición']),
            ('Básica Primaria', 'PRIMARY', 6, 10, ['Primero', 'Segundo', 'Tercero', 'Cuarto', 'Quinto']),
            ('Básica Secundaria', 'SECONDARY', 11, 14, ['Sexto', 'Séptimo', 'Octavo', 'Noveno']),
            ('Media Académica', 'MEDIA', 15, 17, ['Décimo', 'Once']),
        ]

        created_grades = {}

        for l_name, l_type, min_a, max_a, grade_names in levels_config:
            level, _ = AcademicLevel.objects.get_or_create(
                name=l_name,
                defaults={'level_type': l_type, 'min_age': min_a, 'max_age': max_a}
            )
            
            for g_name in grade_names:
                grade, _ = Grade.objects.get_or_create(
                    name=g_name,
                    defaults={'level': level}
                )
                created_grades[g_name] = grade

        # 5. Areas & Subjects (Example for Primary)
        self.stdout.write('Creating areas and subjects...')
        areas_config = [
            ('Matemáticas', ['Matemáticas', 'Geometría', 'Estadística']),
            ('Humanidades', ['Lengua Castellana', 'Inglés']),
            ('Ciencias Naturales', ['Biología', 'Física', 'Química']),
            ('Ciencias Sociales', ['Historia', 'Geografía', 'Democracia']),
            ('Educación Física', ['Educación Física']),
            ('Ética y Valores', ['Ética']),
        ]

        # Assign to "Primero" as an example
        grade_primero = created_grades.get('Primero')
        if grade_primero:
            for area_name, subjects in areas_config:
                area, _ = Area.objects.get_or_create(name=area_name)
                
                # Calculate weight per subject in area (simplified)
                weight = 100 // len(subjects)
                remainder = 100 % len(subjects)
                
                for i, subj_name in enumerate(subjects):
                    w = weight + (1 if i < remainder else 0)
                    Subject.objects.get_or_create(
                        name=subj_name,
                        area=area,
                        grade=grade_primero,
                        defaults={
                            'weight_percentage': w,
                            'hours_per_week': 4 if area_name == 'Matemáticas' else 2
                        }
                    )

        # 6. Groups
        self.stdout.write('Creating groups...')
        if grade_primero:
            Group.objects.get_or_create(
                name='A',
                grade=grade_primero,
                academic_year=year,
                defaults={
                    'campus': campus_sec,
                    'director': teacher1,
                    'shift': 'MORNING',
                    'classroom': '101'
                }
            )
            
            Group.objects.get_or_create(
                name='B',
                grade=grade_primero,
                academic_year=year,
                defaults={
                    'campus': campus_sec,
                    'director': teacher2,
                    'shift': 'AFTERNOON',
                    'classroom': '102'
                }
            )

        self.stdout.write(self.style.SUCCESS('Database seeded successfully!'))
