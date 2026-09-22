from . import fetch_page, web_search

TOOLS = [
    {"schema": web_search.SCHEMA, "run": web_search.run},
    {"schema": fetch_page.SCHEMA, "run": fetch_page.run},
]

SCHEMAS = [tool["schema"] for tool in TOOLS]
RUNNERS = {tool["schema"]["name"]: tool["run"] for tool in TOOLS}
