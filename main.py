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

# Use mock data if Codebeamer is unreachable (for UI testing)
USE_MOCK_DATA = os.environ.get("USE_MOCK_DATA", "true").lower() == "true"

# Mock data for UI testing when Codebeamer is unavailable
MOCK_PROJECTS = {
    "projects": [
        {
            "id": 1,
            "name": "Project Alpha",
            "description": "Test project 1",
            "version": 1
        },
        {
            "id": 2,
            "name": "Project Beta",
            "description": "Test project 2",
            "version": 1
        }
    ]
}

MOCK_TRACKERS = {
    "trackers": [
        {
            "id": 101,
            "name": "QA Testing",
            "trackerType": "Test Case Tracker",
            "projectId": 1
        },
        {
            "id": 102,
            "name": "Bug Tracking",
            "trackerType": "Bug Tracker",
            "projectId": 1
        }
    ]
}

MOCK_ITEMS = {
    "items": [
        {
            "id": 1001,
            "name": "Test Suite 1",
            "itemType": "Test Set",
            "trackerId": 101
        },
        {
            "id": 1002,
            "name": "Test Case A",
            "itemType": "Test Case",
            "trackerId": 101
        }
    ]
}

MOCK_CHILDREN = {
    "children": [
        {
            "id": 10001,
            "name": "Step 1: Setup",
            "itemType": "Test Case",
            "parentId": 1001
        },
        {
            "id": 10002,
            "name": "Step 2: Execute",
            "itemType": "Test Case",
            "parentId": 1001
        }
    ]
}

MOCK_FIELDS = {
    "fields": {
        "id": "1001",
        "name": "Test Suite 1",
        "description": "Example test suite",
        "priority": "High",
        "status": "In Progress",
        "assignee": "Engineer",
        "created": "2025-01-15"
    }
}

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
            if USE_MOCK_DATA:
                print(f"⚠️  Using mock data (Codebeamer unavailable): {str(e)}")
                return MOCK_PROJECTS
            raise HTTPException(
                status_code=502,
                detail=f"Codebeamer unavailable: {str(e)}. Set USE_MOCK_DATA=true to use test data."
            )


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
            if USE_MOCK_DATA:
                print(f"⚠️  Using mock trackers data")
                return MOCK_TRACKERS
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
            if USE_MOCK_DATA:
                print(f"⚠️  Using mock tracker items data")
                return MOCK_ITEMS
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
            if USE_MOCK_DATA:
                print(f"⚠️  Using mock item children data")
                return MOCK_CHILDREN
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
            if USE_MOCK_DATA:
                print(f"⚠️  Using mock item fields data")
                return MOCK_FIELDS
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

