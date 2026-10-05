"""Single source of truth for the Atlas goals this pipeline posts to."""

CLOUD_ID = "9dfc393f-ac2d-4cef-8b1c-0657da26067f"
# The empty segment between "townsquare:" and ":site" is REQUIRED.
CONTAINER_ID = "ari:cloud:townsquare::site/9dfc393f-ac2d-4cef-8b1c-0657da26067f"
ARI_PREFIX = f"ari:cloud:townsquare:{CLOUD_ID}:goal/"
MAX_VISIBLE_CHARS = 280

# Ordered: goal key -> {name, uuid}
GOALS = {
    "XSOLLA-8723": {
        "name": "Page Volume Expansion / Game-Payment Page MVP",
        "uuid": "d18d896d-b7a6-466e-ba8d-44fccc58b5ac",
    },
    "XSOLLA-10169": {
        "name": "First Wave Page Auto-Generation and Core Purchase Flow",
        "uuid": "1e7501b0-0eff-4888-92f6-098e587f2788",
    },
    "XSOLLA-10661": {
        "name": "1. Community Socials",
        "uuid": "3971354f-0da1-49f1-8624-2fdd2220a55b",
    },
    "XSOLLA-8889": {
        "name": "2. Creator Retention Program Top 50",
        "uuid": "145cc5b9-3066-4ab7-98df-01810faa871c",
    },
    "XSOLLA-10662": {
        "name": "3. Xsolla Mall Bundle Program",
        "uuid": "01316922-438a-4e78-a61e-271d637cc475",
    },
    "XSOLLA-10663": {
        "name": "4. XPN for Brands",
        "uuid": "7ed43f4e-034e-4b7d-a14a-838ab5eb3fd8",
    },
    "XSOLLA-10664": {
        "name": "5. Partner-Granted Items",
        "uuid": "5c5198c7-a438-4ebf-af6e-ad62251fa392",
    },
    "XSOLLA-7370": {
        "name": "Partner Network / Scaling Creator Commerce",
        "uuid": "b6ac4f12-9a9a-4b79-b495-7592892f71bb",
    },
}


def ari_for(key: str) -> str:
    """Return the goal ARI for a goal key; raises KeyError for unknown keys."""
    return ARI_PREFIX + GOALS[key]["uuid"]
