from django.db import models


class AcademicYear(models.Model):
    year = models.PositiveIntegerField(unique=True)

    class Meta:
        ordering = ["-year"]

    def __str__(self) -> str:
        return str(self.year)


class Grade(models.Model):
    name = models.CharField(max_length=50)

    class Meta:
        ordering = ["name"]
        unique_together = ("name",)

    def __str__(self) -> str:
        return self.name
