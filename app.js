"use strict";

// ============================================================
// CONFIG
// ============================================================

// Base URL for tree-browsing endpoints (/cb/projects, /cb/trackers/…, etc.)
const BROWSE_BASE = "http://192.128.10.230:11000";

// Base URL for the create-testcase API.
// Use relative path when served through the FastAPI backend; fall back to
// localhost:5000 when the file is opened directly from disk.
const CREATE_PORT = 5000;
const CREATE_BASE =
  location.protocol === "file:" ? `http://localhost:${CREATE_PORT}` : "";

const MAX_STEPS = 100;

const CB_ISSUE_URL = (id) => `http://cb.corp.bos-semi.com/cb/issue/${id}`;

const KIND_ICON  = { project: "📁", tracker: "📘", item: "📄", testcase: "✅" };
const KIND_LABEL = { project: "Project", tracker: "Tracker", item: "Item", testcase: "Testcase" };

// ============================================================
// CREDENTIALS (stored in memory for the session)
// ============================================================
const inputUser = document.getElementById("inputUser");
const inputPass = document.getElementById("inputPass");

function getCreds() {
  return { username: inputUser.value.trim(), password: inputPass.value };
}

// ============================================================
// UTILITIES
// ============================================================
function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// ============================================================
// BROWSE API
// ============================================================
async function browseGet(path) {
  const res = await fetch(`${BROWSE_BASE}${path}`);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

const browseApi = {
  projects:       ()    => browseGet("/cb/projects"),
  trackers:       (pid) => browseGet(`/cb/projects/list-trackers?project_id=${pid}`),
  trackerChildren:(tid) => browseGet(`/cb/trackers/list-children?tracker_id=${tid}`),
  itemChildren:   (iid) => browseGet(`/cb/items/children-items-in-item?item_id=${iid}`),
  itemFields:     (iid) => browseGet(`/cb/items/fields?item_id=${iid}`),
};

// ============================================================
// NODE NORMALIZATION
// ============================================================
function pickId(raw) {
  return raw.id ?? raw.itemId ?? raw.trackerId ?? raw.projectId ?? "";
}
function pickName(raw) {
  return raw.name || raw.label || raw.title || `#${pickId(raw)}`;
}
function isTestcase(raw) {
  const t = (raw.type || raw.itemType || raw.trackerType || raw.kind || "") + "";
  return /test\s*case/i.test(t);
}
function normalizeNode(raw, parentKind) {
  let kind;
  if (parentKind === "project") kind = "tracker";
  else if (parentKind === "tracker" || parentKind === "item")
    kind = isTestcase(raw) ? "testcase" : "item";
  else kind = "item";
  return { id: pickId(raw), name: pickName(raw), kind, raw };
}

// ============================================================
// TREE RENDERING
// ============================================================
const treeEl = document.getElementById("tree");

function getLoader(node) {
  switch (node.kind) {
    case "project":  return () => browseApi.trackers(node.id);
    case "tracker":  return () => browseApi.trackerChildren(node.id);
    case "item":     return () => browseApi.itemChildren(node.id);
    default:         return null; // testcase is a leaf
  }
}

function renderTreeNode(node) {
  const li = document.createElement("li");

  const row = document.createElement("div");
  row.className = "tree-row";
  row.dataset.kind = node.kind;

  const arrow = document.createElement("span");
  arrow.className = "tree-arrow" + (node.kind === "testcase" ? " leaf" : "");
  arrow.textContent = "▶";
  row.appendChild(arrow);

  const icon = document.createElement("span");
  icon.className = "tree-icon";
  icon.textContent = KIND_ICON[node.kind] || "•";
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "tree-label";
  label.textContent = node.name;
  row.appendChild(label);

  const idBadge = document.createElement("span");
  idBadge.className = "tree-id";
  idBadge.textContent = `#${node.id}`;
  row.appendChild(idBadge);

  const childUl = document.createElement("ul");
  childUl.className = "tree-children";
  childUl.style.display = "none";

  let loaded = false;
  let expanded = false;

  row.addEventListener("click", async (e) => {
    e.stopPropagation();
    selectNode(row, node);

    const loader = getLoader(node);
    if (!loader) return;

    if (!loaded) {
      childUl.innerHTML = `<li class="tree-msg">Loading…</li>`;
      childUl.style.display = "block";
      try {
        const data = await loader();
        const list = Array.isArray(data) ? data : (data.items || data.children || []);
        childUl.innerHTML = "";
        if (list.length === 0) {
          childUl.innerHTML = `<li class="tree-msg muted">(no children)</li>`;
        } else {
          const frag = document.createDocumentFragment();
          for (const raw of list) {
            frag.appendChild(renderTreeNode(normalizeNode(raw, node.kind)));
          }
          childUl.appendChild(frag);
        }
        loaded = true;
      } catch (err) {
        childUl.innerHTML = `<li class="tree-msg error">⚠ ${esc(err.message)}</li>`;
      }
    }

    expanded = !expanded;
    row.classList.toggle("expanded", expanded);
    animateChildren(childUl, expanded);
  });

  // Allow external code to reset and reload this node's children.
  node._refresh = () => {
    loaded = false;
    childUl.innerHTML = "";
    if (expanded) {
      expanded = false;
      row.classList.remove("expanded");
      animateChildren(childUl, false);
    }
  };

  li.appendChild(row);
  li.appendChild(childUl);
  return li;
}

function animateChildren(ul, open) {
  if (open) {
    ul.style.display = "block";
    const target = ul.scrollHeight;
    ul.style.height = "0px";
    anime({
      targets: ul, height: [0, target], opacity: [0, 1],
      duration: 200, easing: "easeOutQuad",
      complete: () => { ul.style.height = "auto"; },
    });
  } else {
    ul.style.height = ul.scrollHeight + "px";
    anime({
      targets: ul, height: 0, opacity: 0,
      duration: 160, easing: "easeInQuad",
      complete: () => {
        ul.style.display = "none";
        ul.style.height = "";
        ul.style.opacity = "";
      },
    });
  }
}

// ============================================================
// TREE INIT
// ============================================================
async function loadProjects() {
  treeEl.innerHTML = `<li class="tree-msg">Loading projects…</li>`;
  try {
    const data = await browseApi.projects();
    treeEl.innerHTML = "";
    const list = Array.isArray(data) ? data : (data.projects || []);
    if (list.length === 0) {
      treeEl.innerHTML = `<li class="tree-msg muted">(no projects)</li>`;
      return;
    }
    const frag = document.createDocumentFragment();
    for (const raw of list) {
      const node = { id: pickId(raw), name: pickName(raw), kind: "project", raw };
      frag.appendChild(renderTreeNode(node));
    }
    treeEl.appendChild(frag);
  } catch (err) {
    treeEl.innerHTML = `<li class="tree-msg error">⚠ ${esc(err.message)}</li>`;
  }
}

document.getElementById("btnRefreshTree").addEventListener("click", loadProjects);

// ============================================================
// SELECTION & WORKSPACE
// ============================================================
const workspaceEl = document.getElementById("workspace");
let selectedNode = null;

function selectNode(rowEl, node) {
  document.querySelectorAll(".tree-row.active").forEach((r) => r.classList.remove("active"));
  rowEl.classList.add("active");
  selectedNode = { row: rowEl, node };
  renderWorkspace(node);
}

function renderWorkspace(node) {
  const canCreate = node.kind !== "testcase";
  const cbUrl = node.id ? CB_ISSUE_URL(node.id) : null;

  workspaceEl.innerHTML = `
    <div class="ws-detail">
      <div class="ws-detail-header">
        <span class="ws-kind-badge ws-kind-${esc(node.kind)}">${esc(KIND_LABEL[node.kind] || node.kind)}</span>
        <h2 class="ws-title">${esc(node.name)}</h2>
        <span class="ws-id">#${esc(String(node.id))}</span>
      </div>
      ${cbUrl ? `<p class="ws-cb-link"><a href="${esc(cbUrl)}" target="_blank" rel="noopener">Open in Codebeamer ↗</a></p>` : ""}
      ${canCreate ? `<button class="btn-primary" id="btnCreateHere">+ Create Testcase here</button>` : ""}
      <div id="fieldsArea" class="ws-fields"></div>
    </div>
    <div id="createArea"></div>
  `;

  if (canCreate) {
    document.getElementById("btnCreateHere").addEventListener("click", () => {
      showCreateForm(node);
    });
  }

  if (node.kind === "item" || node.kind === "testcase") {
    loadItemFields(node.id);
  }
}

async function loadItemFields(itemId) {
  const fieldsArea = document.getElementById("fieldsArea");
  if (!fieldsArea) return;
  fieldsArea.innerHTML = `<p class="muted">Loading fields…</p>`;
  try {
    const data = await browseApi.itemFields(itemId);
    fieldsArea.innerHTML = `
      <h3 class="ws-section-title">Fields</h3>
      <pre class="code-block">${esc(JSON.stringify(data, null, 2))}</pre>
    `;
  } catch (err) {
    fieldsArea.innerHTML = `<p class="error">Error loading fields: ${esc(err.message)}</p>`;
  }
}

// ============================================================
// CREATE TESTCASE FORM
// ============================================================
function showCreateForm(parentNode) {
  const createArea = document.getElementById("createArea");
  if (!createArea) return;

  createArea.innerHTML = `
    <form class="create-form" id="createForm">
      <h3 class="ws-section-title">
        Create Testcase under &ldquo;${esc(parentNode.name)}&rdquo; (#${esc(String(parentNode.id))})
      </h3>

      <div class="form-group">
        <label>Testcase Name <span class="required">*</span></label>
        <input type="text" id="cf_name" class="form-input" required placeholder="My new testcase" />
      </div>

      <div class="form-group">
        <label>Description</label>
        <textarea id="cf_desc" class="form-input" rows="2" placeholder="Optional description"></textarea>
      </div>

      <div class="form-group steps-header-row">
        <label>Test Steps <span class="required">*</span></label>
        <div class="steps-count-row">
          <input type="number" id="cf_num_steps" class="form-input num-input" min="1" max="${MAX_STEPS}" value="1" />
          <button type="button" class="btn-outline" id="cf_gen_steps">Generate Rows</button>
        </div>
      </div>
      <div id="cf_steps" class="steps-container"></div>

      <div class="form-actions">
        <button type="submit" class="btn-primary" id="cf_submit">
          <span class="spinner d-none" id="cf_spinner"></span>
          <span id="cf_submit_label">Create Testcase</span>
        </button>
        <button type="button" class="btn-secondary" id="cf_cancel">Cancel</button>
      </div>
      <div id="cf_result"></div>
    </form>
  `;

  const stepsDiv = document.getElementById("cf_steps");

  function generateStepRows() {
    const n = Math.max(1, Math.min(MAX_STEPS, parseInt(document.getElementById("cf_num_steps").value, 10) || 1));
    stepsDiv.innerHTML = "";
    const frag = document.createDocumentFragment();
    for (let i = 0; i < n; i++) frag.appendChild(buildStepRow(i));
    stepsDiv.appendChild(frag);
    if (window.anime) {
      anime({
        targets: "#cf_steps .step-row",
        opacity: [0, 1], translateY: [8, 0],
        delay: anime.stagger(40), duration: 200, easing: "easeOutQuad",
      });
    }
  }

  document.getElementById("cf_gen_steps").addEventListener("click", generateStepRows);
  document.getElementById("cf_cancel").addEventListener("click", () => {
    createArea.innerHTML = "";
  });
  document.getElementById("createForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    await submitCreate(parentNode);
  });

  generateStepRows();
}

function buildStepRow(index) {
  const div = document.createElement("div");
  div.className = "step-row";
  div.dataset.index = String(index);
  div.innerHTML = `
    <div class="step-number">Step ${index + 1}</div>
    <div class="step-fields">
      <div class="step-field">
        <label>Action <span class="required">*</span></label>
        <textarea class="form-input step-action" rows="2" required></textarea>
      </div>
      <div class="step-field">
        <label>Expected Result <span class="required">*</span></label>
        <textarea class="form-input step-expected" rows="2" required></textarea>
      </div>
      <div class="step-check">
        <label><input type="checkbox" class="step-critical" /> Critical</label>
      </div>
    </div>
  `;
  return div;
}

function collectSteps() {
  return [...document.querySelectorAll("#cf_steps .step-row")].map((row) => ({
    action: row.querySelector(".step-action").value.trim(),
    expected_result: row.querySelector(".step-expected").value.trim(),
    critical: row.querySelector(".step-critical").checked,
  }));
}

async function submitCreate(parentNode) {
  const resultEl    = document.getElementById("cf_result");
  const spinner     = document.getElementById("cf_spinner");
  const label       = document.getElementById("cf_submit_label");
  const submitBtn   = document.getElementById("cf_submit");

  const { username, password } = getCreds();
  if (!username || !password) {
    resultEl.innerHTML = `<p class="error">Please enter your Codebeamer username and password in the header.</p>`;
    return;
  }

  const name  = document.getElementById("cf_name").value.trim();
  const desc  = document.getElementById("cf_desc").value.trim();
  const steps = collectSteps();

  if (!name) {
    resultEl.innerHTML = `<p class="error">Testcase name is required.</p>`;
    return;
  }
  if (steps.length === 0) {
    resultEl.innerHTML = `<p class="error">At least one test step is required.</p>`;
    return;
  }

  const payload = {
    username,
    password,
    parent_id: Number(parentNode.id),
    testcase_name: name,
    description: desc,
    steps,
  };

  submitBtn.disabled = true;
  spinner.classList.remove("d-none");
  label.textContent = "Creating…";
  resultEl.innerHTML = "";

  try {
    const res = await fetch(`${CREATE_BASE}/api/testcases/create-with-steps`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let body = null;
    try { body = await res.json(); } catch (_) {}

    if (!res.ok) {
      const detail =
        (body && (body.detail || body.message)) || `Request failed (${res.status})`;
      resultEl.innerHTML = `
        <div class="result-error">
          <strong>Error:</strong> ${esc(typeof detail === "string" ? detail : JSON.stringify(detail))}
        </div>`;
      return;
    }

    resultEl.innerHTML = `
      <div class="result-success">
        <strong>✅ Testcase created!</strong>
        <dl>
          <dt>ID</dt>     <dd>${esc(String(body.testcase_id))}</dd>
          <dt>Name</dt>   <dd>${esc(body.testcase_name)}</dd>
          <dt>Parent</dt> <dd><a href="${esc(body.parent_url)}" target="_blank" rel="noopener">${esc(body.parent_url)}</a></dd>
          <dt>URL</dt>    <dd><a href="${esc(body.testcase_url)}" target="_blank" rel="noopener">${esc(body.testcase_url)}</a></dd>
        </dl>
      </div>`;
    resultEl.scrollIntoView({ behavior: "smooth", block: "nearest" });

    // Refresh the parent node so the new testcase appears in the tree.
    if (selectedNode && selectedNode.node === parentNode && typeof parentNode._refresh === "function") {
      parentNode._refresh();
    }
  } catch (err) {
    resultEl.innerHTML = `
      <div class="result-error"><strong>Network error:</strong> ${esc(err.message)}</div>`;
  } finally {
    submitBtn.disabled = false;
    spinner.classList.add("d-none");
    label.textContent = "Create Testcase";
  }
}

// ============================================================
// INIT
// ============================================================
loadProjects();
