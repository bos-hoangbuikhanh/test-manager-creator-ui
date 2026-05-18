"""
Unified Codebeamer Test Manager Creator UI

Single web application:
- Serves the tree view UI on port 5000
- Provides backend API endpoints
- Proxies to test-manager backend (port 8082) for Codebeamer API calls

To run:
  python main.py
  
To access:
  http://localhost:5000
"""

import os
import httpx
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

app = FastAPI(title="Codebeamer Test Manager Creator UI")

# Test-Manager Backend URL (where Codebeamer API endpoints are)
TEST_MANAGER_BASE = "http://localhost:8082"

# ========== Frontend ========== 
@app.get("/")
def index():
    """Serve the main HTML page"""
    return FileResponse(os.path.join(os.path.dirname(__file__), "index.html"))


# ========== Backend API Endpoints (Proxy to test-manager) ==========

@app.get("/api/projects")
async def list_projects():
    """List all projects from Codebeamer"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(f"{TEST_MANAGER_BASE}/cb/projects", timeout=10)
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch projects: {str(e)}")


@app.get("/api/trackers")
async def list_trackers(project_id: int):
    """List trackers for a project"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{TEST_MANAGER_BASE}/cb/projects/list-trackers",
                params={"project_id": project_id},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch trackers: {str(e)}")


@app.get("/api/tracker-items")
async def list_tracker_items(tracker_id: int):
    """List items in a tracker"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{TEST_MANAGER_BASE}/cb/trackers/list-children",
                params={"tracker_id": tracker_id},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch tracker items: {str(e)}")


@app.get("/api/item-children")
async def list_item_children(item_id: int):
    """List children items within an item"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{TEST_MANAGER_BASE}/cb/items/children-items-in-item",
                params={"item_id": item_id},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch item children: {str(e)}")


@app.get("/api/item-fields")
async def get_item_fields(item_id: int):
    """Get field values for an item"""
    async with httpx.AsyncClient() as client:
        try:
            response = await client.get(
                f"{TEST_MANAGER_BASE}/cb/items/fields",
                params={"item_id": item_id},
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to fetch item fields: {str(e)}")


@app.post("/api/create-item")
async def create_item(
    tracker_id: int,
    name: str,
    description: str = "",
    parent_item_id: int = None
):
    """Create a new item in a tracker"""
    async with httpx.AsyncClient() as client:
        try:
            params = {
                "tracker_id": tracker_id,
                "test_set_name": name,
                "test_set_description": description,
            }
            if parent_item_id:
                params["parent_item_id"] = parent_item_id

            response = await client.post(
                f"{TEST_MANAGER_BASE}/cc/trackers/create/items-in-tracker",
                params=params,
                timeout=10
            )
            response.raise_for_status()
            return response.json()
        except httpx.HTTPError as e:
            raise HTTPException(status_code=502, detail=f"Failed to create item: {str(e)}")

