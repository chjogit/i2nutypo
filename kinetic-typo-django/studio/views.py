from django.shortcuts import render


def index(request):
    """The editor page. Everything after this runs in the browser."""
    return render(request, "studio/index.html")
