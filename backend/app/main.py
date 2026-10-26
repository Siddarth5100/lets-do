from fastapi import FastAPI

from app.api.routes.auth import router as auth_router
from app.api.routes.health import router as health_router
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

    return application


app = create_application()
