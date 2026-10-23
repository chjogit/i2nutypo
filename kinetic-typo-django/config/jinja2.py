from django.templatetags.static import static
from django.urls import reverse
from jinja2 import Environment


def environment(**options):
    """Jinja2 for the pages Django renders: the landing page and the studio page."""
    env = Environment(**options)
    env.globals.update(static=static, url=reverse)
    return env
