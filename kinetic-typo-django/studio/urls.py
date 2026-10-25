from django.urls import path

from . import views

urlpatterns = [
    path("", views.landing, name="landing"),
    path("beginner/", views.studio, {"mode": "beginner"}, name="beginner"),
    path("basic/", views.studio, {"mode": "basic"}, name="basic"),
    path("pro/", views.studio, {"mode": "pro"}, name="pro"),
    path("licenses/", views.licenses, name="licenses"),
    path("docs/", views.docs, name="docs"),
]
