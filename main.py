import os
import uuid
from typing import List, Optional

import requests
from fastapi import FastAPI, HTTPException
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from pydantic import BaseModel, Field
from requests.auth import HTTPBasicAuth


# --------------------------------------------------------------------------- #
# Codebeamer configuration
# --------------------------------------------------------------------------- #
BASE_URL = "http://cb.corp.bos-semi.com/cb/api/v3"
UI_BASE_URL = "http://cb.corp.bos-semi.com/cb"

TESTCASE_TRACKER_ID = 238730

TEST_STEPS_FIELD_ID = 1000000
ACTION_FIELD_ID = 1000001
EXPECTED_RESULT_FIELD_ID = 1000002
CRITICAL_FIELD_ID = 1000003
STEP_ID_FIELD_ID = 1000004


def issue_url(item_id: int) -> str:
    return f"{UI_BASE_URL}/issue/{item_id}"


def create_testcase_under_parent(
    auth: HTTPBasicAuth,
    parent_id: int,
    testcase_name: str,
    description: str = "",
) -> dict:
    create_payload = {
        "name": testcase_name,
        "description": description or f"Auto-created testcase: {testcase_name}",
    }

    r = requests.post(
        f"{BASE_URL}/trackers/{TESTCASE_TRACKER_ID}/items",
        auth=auth,
        json=create_payload,
    )

    if not r.ok:
        raise RuntimeError(f"Failed to create testcase: {r.text}")

    created = r.json()
    testcase_id = created["id"]

    link_payload = {
        "id": testcase_id,
        "commonItemId": testcase_id,
        "version": 0,
    }

    r = requests.post(
        f"{BASE_URL}/items/{parent_id}/children",
        auth=auth,
        json=link_payload,
    )

    if not r.ok:
        raise RuntimeError(f"Failed to link testcase under parent: {r.text}")

    return {
        "parent_id": parent_id,
        "parent_url": issue_url(parent_id),
        "testcase_id": testcase_id,
        "testcase_url": issue_url(testcase_id),
        "testcase_name": testcase_name,
    }


def update_testcase_steps(
    auth: HTTPBasicAuth,
    testcase_id: int,
    steps: list,
) -> dict:
    rows = []

    for step in steps:
        rows.append([
            {
                "fieldId": ACTION_FIELD_ID,
                "value": step["action"],
                "type": "WikiTextFieldValue",
            },
            {
                "fieldId": EXPECTED_RESULT_FIELD_ID,
                "value": step["expected_result"],
                "type": "WikiTextFieldValue",
            },
            {
                "fieldId": CRITICAL_FIELD_ID,
                "value": step.get("critical", False),
                "type": "BoolFieldValue",
            },
            {
                "fieldId": STEP_ID_FIELD_ID,
                "value": step.get("id", uuid.uuid4().hex),
                "type": "WikiTextFieldValue",
            },
        ])

    payload = {
        "fieldValues": [],
        "tableValues": [
            {
                "fieldId": TEST_STEPS_FIELD_ID,
                "values": rows,
                "type": "TableFieldValue",
            }
        ],
    }

    r = requests.put(
        f"{BASE_URL}/items/{testcase_id}/fields",
        auth=auth,
        params={"quietMode": "false"},
        json=payload,
    )

    if not r.ok:
        raise RuntimeError(f"Failed to update testcase steps: {r.text}")

    if r.text:
        return r.json()

    return {"status": "success", "testcase_id": testcase_id}


# --------------------------------------------------------------------------- #
# FastAPI app
# --------------------------------------------------------------------------- #
app = FastAPI(title="Codebeamer Testcase Creator")


class TestStep(BaseModel):
    action: str
    expected_result: str
    critical: bool = False


class CreateWithStepsRequest(BaseModel):
    username: str
    password: str
    parent_id: int
    testcase_name: str
    description: Optional[str] = ""
    steps: List[TestStep] = Field(default_factory=list)


@app.post("/api/testcases/create-with-steps")
def create_with_steps(req: CreateWithStepsRequest):
    # Validate required fields
    if not req.username or not req.password:
        raise HTTPException(status_code=400, detail="Username and password are required")
    if not req.testcase_name:
        raise HTTPException(status_code=400, detail="Testcase name is required")
    if not req.parent_id:
        raise HTTPException(status_code=400, detail="Parent ID is required")
    if not req.steps:
        raise HTTPException(status_code=400, detail="At least one test step is required")

    for i, s in enumerate(req.steps, start=1):
        if not s.action or not s.expected_result:
            raise HTTPException(
                status_code=400,
                detail=f"Step {i}: action and expected_result are required",
            )

    auth = HTTPBasicAuth(req.username, req.password)

    try:
        created = create_testcase_under_parent(
            auth=auth,
            parent_id=req.parent_id,
            testcase_name=req.testcase_name,
            description=req.description or "",
        )

        steps_payload = [s.model_dump() for s in req.steps]
        update_testcase_steps(
            auth=auth,
            testcase_id=created["testcase_id"],
            steps=steps_payload,
        )
    except RuntimeError as e:
        raise HTTPException(status_code=502, detail=str(e))
    except Exception as e:  # noqa: BLE001
        raise HTTPException(status_code=500, detail=f"Unexpected error: {e}")

    return {
        "status": "success",
        "parent_id": created["parent_id"],
        "parent_url": created["parent_url"],
        "testcase_id": created["testcase_id"],
        "testcase_url": created["testcase_url"],
        "testcase_name": created["testcase_name"],
    }


# --------------------------------------------------------------------------- #
# Static frontend
# --------------------------------------------------------------------------- #
STATIC_DIR = os.path.join(os.path.dirname(__file__), "static")

if os.path.isdir(STATIC_DIR):
    app.mount("/static", StaticFiles(directory=STATIC_DIR), name="static")

    @app.get("/")
    def index():
        return FileResponse(os.path.join(STATIC_DIR, "index.html"))
