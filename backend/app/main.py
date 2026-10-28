from fastapi import FastAPI

from app.api.routes.activity import router as activity_router
from app.api.routes.auth import router as auth_router
from app.api.routes.categories import router as categories_router
from app.api.routes.health import router as health_router
from app.api.routes.settings import router as settings_router
from app.api.routes.tasks import router as tasks_router
from app.core.config import get_settings
from app.core.errors import register_exception_handlers


def create_application() -> FastAPI:
    settings = get_settings()
    application = FastAPI(
        title=settings.app_name,
        debug=settings.app_debug,
        version="0.1.0",
    )

    register_exception_handlers(application)
    application.include_router(health_router)
    application.include_router(auth_router)
    application.include_router(activity_router)
    application.include_router(categories_router)
    application.include_router(settings_router)
    application.include_router(tasks_router)

    return application


app = create_application()
