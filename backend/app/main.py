from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api.routes.activity import router as activity_router
from app.api.routes.auth import router as auth_router
from app.api.routes.categories import router as categories_router
from app.api.routes.health import router as health_router
from app.api.routes.imports import router as imports_router
from app.api.routes.settings import router as settings_router
from app.api.routes.tasks import router as tasks_router
from app.core.config import Settings, get_settings
from app.core.errors import register_exception_handlers


def create_application(settings: Settings | None = None) -> FastAPI:
    application_settings = settings or get_settings()
    application = FastAPI(
        title=application_settings.app_name,
        debug=application_settings.app_debug,
        version="0.1.0",
    )

    application.add_middleware(
        CORSMiddleware,
        allow_origins=application_settings.allowed_cors_origins,
        allow_credentials=False,
        allow_methods=["GET", "POST", "PUT", "PATCH", "DELETE"],
        allow_headers=["Authorization", "Content-Type"],
    )

    register_exception_handlers(application)
    application.include_router(health_router)
    application.include_router(imports_router)
    application.include_router(auth_router)
    application.include_router(activity_router)
    application.include_router(categories_router)
    application.include_router(settings_router)
    application.include_router(tasks_router)

    return application


app = create_application()
