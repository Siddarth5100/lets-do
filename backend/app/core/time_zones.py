from datetime import date, datetime
from zoneinfo import ZoneInfo

V1_TIME_ZONE_NAME = "Asia/Kolkata"
V1_TIME_ZONE = ZoneInfo(V1_TIME_ZONE_NAME)


def validate_v1_time_zone(time_zone: str, field_name: str) -> str:
    if time_zone != V1_TIME_ZONE_NAME:
        raise ValueError(f"{field_name} must be {V1_TIME_ZONE_NAME} for Let's Do V1")
    return time_zone


def get_v1_date(timestamp: datetime) -> date:
    return timestamp.astimezone(V1_TIME_ZONE).date()
