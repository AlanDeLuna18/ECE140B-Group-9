def trigger_pump(device_id: str, duration_seconds: int = 5) -> dict[str, str | int]:
    """Mock pump controller used until real hardware integration exists."""

    return {
        "device_id": device_id,
        "action": "pump_on",
        "duration_seconds": duration_seconds,
        "status": "mock_sent",
    }
