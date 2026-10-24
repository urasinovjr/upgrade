FULL_PAGE = {"x": 0.0, "y": 0.0, "width": 1.0, "height": 1.0}


def inside_page(region: dict) -> bool:
    return (
        region["width"] > 0
        and region["height"] > 0
        and region["x"] >= 0
        and region["y"] >= 0
        and region["x"] + region["width"] <= 1.000001
        and region["y"] + region["height"] <= 1.000001
    )


def to_original(region: dict, crop: dict | None) -> dict:
    frame = crop or FULL_PAGE
    return {
        "x": frame["x"] + region["x"] * frame["width"],
        "y": frame["y"] + region["y"] * frame["height"],
        "width": region["width"] * frame["width"],
        "height": region["height"] * frame["height"],
    }


def to_sanitized(region: dict, crop: dict | None) -> dict | None:
    frame = crop or FULL_PAGE
    left = max(region["x"], frame["x"])
    top = max(region["y"], frame["y"])
    right = min(region["x"] + region["width"], frame["x"] + frame["width"])
    bottom = min(region["y"] + region["height"], frame["y"] + frame["height"])
    if right <= left or bottom <= top:
        return None
    return {
        "x": (left - frame["x"]) / frame["width"],
        "y": (top - frame["y"]) / frame["height"],
        "width": (right - left) / frame["width"],
        "height": (bottom - top) / frame["height"],
    }
