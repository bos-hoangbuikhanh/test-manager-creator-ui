/* =========================================================
   Codebeamer Test Manager - simple tree UI
   ========================================================= */

const API_BASE = "http://192.128.10.230:11000";
const CB_ITEM_URL = (id) => `http://cb.corp.bos-semi.com/cb/issue/${id}`;

const ICONS = {
  project: "📁",
  tracker: "📘",
  item: "📄",
  testcase: "✅",
};

// Currently selected node info (used by toolbar buttons + refresh)
let selected = null;

// -----------------------------
// API helpers
// -----------------------------
async function apiGet(path) {
  const url = `${API_BASE}${path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  const data = await res.json();
  return { url, data };
}

const api = {
  listProjects: () => apiGet(`/cb/projects`),
  listTrackers: (projectId) => apiGet(`/cb/projects/list-trackers?project_id=${projectId}`),
  listTrackerChildren: (trackerId) => apiGet(`/cb/trackers/list-children?tracker_id=${trackerId}`),
  listItemChildren: (itemId) => apiGet(`/cb/items/children-items-in-item?item_id=${itemId}`),
  getItemFields: (itemId) => apiGet(`/cb/items/fields?item_id=${itemId}`),
};

// -----------------------------
// Stub APIs (to be implemented later)
// -----------------------------
async function createTestcase(parentId, testcaseName, description) {
  // TODO: call backend API to create testcase
  console.log("TODO create testcase", { parentId, testcaseName, description });
}

async function linkTestcaseToParent(parentId, testcaseId) {
  // TODO: call backend API to link testcase under parent
  console.log("TODO link testcase", { parentId, testcaseId });
}

async function updateTestSteps(testcaseId, steps) {
  // TODO: call backend API to create/update testcase steps
  console.log("TODO update test steps", { testcaseId, steps });
}

// -----------------------------
// Type detection & loader mapping
// -----------------------------
// Pick best name/id from a record returned by API (field names vary).
function pickName(n) {
  return n.name || n.label || n.title || `#${pickId(n)}`;
}
function pickId(n) {
  return n.id ?? n.itemId ?? n.trackerId ?? n.projectId ?? "";
}

// Decide if an item is a "testcase". Codebeamer typically marks tracker type
// or item type as containing "Test Case". Fallback to false (treated as item).
function isTestcase(node) {
  const t =
    (node.type || node.itemType || node.trackerType || node.kind || "") + "";
  return /test\s*case/i.test(t);
}

// Return a loader function for children of the given node, or null for leaves.
function getChildLoader(node) {
  switch (node._kind) {
    case "project":
      return () => api.listTrackers(node._id);
    case "tracker":
      return () => api.listTrackerChildren(node._id);
    case "item":
      return () => api.listItemChildren(node._id);
    case "testcase":
      return null; // leaf
  }
}

// Build a normalized child node from raw API data + parent kind.
function normalizeChild(raw, parentKind) {
  const id = pickId(raw);
  const name = pickName(raw);
  let kind;
  if (parentKind === "project") kind = "tracker";
  else if (parentKind === "tracker") kind = isTestcase(raw) ? "testcase" : "item";
  else if (parentKind === "item") kind = isTestcase(raw) ? "testcase" : "item";
  else kind = "item";
  return { _id: id, _name: name, _kind: kind, _raw: raw };
}

// -----------------------------
// Tree rendering
// -----------------------------
const treeEl = document.getElementById("tree");
const detailEl = document.getElementById("detail");

function renderNode(node) {
  const li = document.createElement("li");

  const row = document.createElement("div");
  row.className = "tree-node";
  row.dataset.kind = node._kind;

  const arrow = document.createElement("span");
  arrow.className = "arrow";
  arrow.textContent = "▶";
  if (node._kind === "testcase") arrow.classList.add("leaf");
  row.appendChild(arrow);

  const icon = document.createElement("span");
  icon.className = "icon";
  icon.textContent = ICONS[node._kind] || "•";
  row.appendChild(icon);

  const label = document.createElement("span");
  label.className = "label";
  label.textContent = node._name;
  row.appendChild(label);

  const idSpan = document.createElement("span");
  idSpan.className = "id";
  idSpan.textContent = `#${node._id}`;
  row.appendChild(idSpan);

  const childUl = document.createElement("ul");
  childUl.style.display = "none";
  childUl.style.height = "0px";

  let loaded = false;
  let expanded = false;
  let lastApiUrl = null;

  row.addEventListener("click", async (e) => {
    e.stopPropagation();
    selectNode(row, node, lastApiUrl);

    const loader = getChildLoader(node);
    if (!loader) return; // leaf (testcase) -- handled in selectNode

    if (!loaded) {
      const loading = document.createElement("li");
      loading.className = "loading";
      loading.textContent = "Loading...";
      childUl.appendChild(loading);
      childUl.style.display = "block";
      try {
        const { url, data } = await loader();
        lastApiUrl = url;
        childUl.innerHTML = "";
        const list = Array.isArray(data) ? data : data.items || data.children || [];
        if (list.length === 0) {
          const empty = document.createElement("li");
          empty.className = "loading";
          empty.textContent = "(no children)";
          childUl.appendChild(empty);
        } else {
          for (const raw of list) {
            const child = normalizeChild(raw, node._kind);
            childUl.appendChild(renderNode(child));
          }
        }
        loaded = true;
        // refresh detail panel if this node is still selected
        if (selected && selected.node === node) {
          selected.apiUrl = url;
          showDetail(node, url);
        }
      } catch (err) {
        childUl.innerHTML = "";
        const errEl = document.createElement("li");
        errEl.className = "error";
        errEl.textContent = `Error: ${err.message}`;
        childUl.appendChild(errEl);
      }
    }

    // Toggle with anime.js animation
    expanded = !expanded;
    row.classList.toggle("expanded", expanded);
    animateToggle(childUl, expanded);
  });

  // Expose a refresh method so the toolbar can reload this node's children.
  node._refresh = async () => {
    loaded = false;
    childUl.innerHTML = "";
    if (!expanded) row.click();
    else {
      // collapse then re-open to trigger reload
      row.click();
      setTimeout(() => row.click(), 250);
    }
  };

  li.appendChild(row);
  li.appendChild(childUl);
  return li;
}

function animateToggle(ul, expanded) {
  if (expanded) {
    ul.style.display = "block";
    // measure target height
    ul.style.height = "auto";
    const targetHeight = ul.scrollHeight;
    ul.style.height = "0px";
    anime({
      targets: ul,
      height: [0, targetHeight],
      opacity: [0, 1],
      duration: 220,
      easing: "easeOutQuad",
      complete: () => { ul.style.height = "auto"; },
    });
  } else {
    const startHeight = ul.scrollHeight;
    ul.style.height = startHeight + "px";
    anime({
      targets: ul,
      height: [startHeight, 0],
      opacity: [1, 0],
      duration: 180,
      easing: "easeInQuad",
      complete: () => { ul.style.display = "none"; },
    });
  }
}

// -----------------------------
// Selection & detail panel
// -----------------------------
function selectNode(rowEl, node, apiUrl) {
  document.querySelectorAll(".tree-node.selected").forEach((el) =>
    el.classList.remove("selected")
  );
  rowEl.classList.add("selected");
  selected = { node, apiUrl, rowEl };
  showDetail(node, apiUrl);
}

async function showDetail(node, apiUrl) {
  const cbLink = node._id
    ? `<a href="${CB_ITEM_URL(node._id)}" target="_blank">${CB_ITEM_URL(node._id)}</a>`
    : "<span class='muted'>(no item id)</span>";

  detailEl.innerHTML = `
    <h2>${escapeHtml(node._name)}</h2>
    <dl>
      <dt>ID</dt><dd>${escapeHtml(String(node._id))}</dd>
      <dt>Type</dt><dd>${escapeHtml(node._kind)}</dd>
      <dt>API URL</dt><dd>${apiUrl ? escapeHtml(apiUrl) : "<span class='muted'>(not loaded yet)</span>"}</dd>
      <dt>Codebeamer</dt><dd>${cbLink}</dd>
    </dl>
    <div id="fieldsBox"></div>
  `;

  // For items/testcases, also load the fields and show JSON
  if (node._kind === "item" || node._kind === "testcase") {
    const box = document.getElementById("fieldsBox");
    box.innerHTML = `<p class="muted">Loading fields...</p>`;
    try {
      const { url, data } = await api.getItemFields(node._id);
      box.innerHTML = `
        <h3>Fields</h3>
        <p class="muted">${escapeHtml(url)}</p>
        <pre>${escapeHtml(JSON.stringify(data, null, 2))}</pre>
      `;
    } catch (err) {
      box.innerHTML = `<p class="error">Error loading fields: ${escapeHtml(err.message)}</p>`;
    }
  }
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  }[c]));
}

// -----------------------------
// Initial load: list projects
// -----------------------------
async function loadProjects() {
  treeEl.innerHTML = `<li class="loading">Loading projects...</li>`;
  try {
    const { data } = await api.listProjects();
    treeEl.innerHTML = "";
    const list = Array.isArray(data) ? data : data.projects || [];
    if (list.length === 0) {
      treeEl.innerHTML = `<li class="loading">(no projects)</li>`;
      return;
    }
    for (const raw of list) {
      const node = {
        _id: pickId(raw),
        _name: pickName(raw),
        _kind: "project",
        _raw: raw,
      };
      treeEl.appendChild(renderNode(node));
    }
  } catch (err) {
    treeEl.innerHTML = `<li class="error">Error loading projects: ${escapeHtml(err.message)}</li>`;
  }
}

// -----------------------------
// Modal helpers
// -----------------------------
const modal = document.getElementById("modal");
const modalTitle = document.getElementById("modalTitle");
const modalBody = document.getElementById("modalBody");
const modalSubmit = document.getElementById("modalSubmit");

function openModal(title, bodyHtml, onSubmit) {
  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  modal.classList.remove("hidden");
  modalSubmit.onclick = async () => {
    try { await onSubmit(); } finally { closeModal(); }
  };
}
function closeModal() { modal.classList.add("hidden"); }
document.getElementById("modalClose").onclick = closeModal;
document.getElementById("modalCancel").onclick = closeModal;

// -----------------------------
// Toolbar buttons
// -----------------------------
document.getElementById("btnCreateTestcase").onclick = () => {
  if (!selected) { alert("Please select a parent node in the tree first."); return; }
  const parentId = selected.node._id;
  openModal(
    "Create Testcase",
    `
      <label>Parent ID
        <input id="f_parent" value="${escapeHtml(String(parentId))}" readonly />
      </label>
      <label>Testcase name
        <input id="f_name" placeholder="My new testcase" />
      </label>
      <label>Description
        <textarea id="f_desc" placeholder="Description"></textarea>
      </label>
    `,
    async () => {
      const name = document.getElementById("f_name").value.trim();
      const desc = document.getElementById("f_desc").value.trim();
      if (!name) { alert("Name required"); return; }
      await createTestcase(parentId, name, desc);
      // also demonstrate the link placeholder
      await linkTestcaseToParent(parentId, "<new-testcase-id>");
      alert("createTestcase() is a TODO placeholder. See console.");
    }
  );
};

document.getElementById("btnEditSteps").onclick = () => {
  if (!selected || selected.node._kind !== "testcase") {
    alert("Please select a testcase node first.");
    return;
  }
  const tcId = selected.node._id;
  openModal(
    "Edit Test Steps",
    `
      <p class="muted">Testcase ID: ${escapeHtml(String(tcId))}</p>
      <label>Steps (one per line)
        <textarea id="f_steps" placeholder="Step 1&#10;Step 2"></textarea>
      </label>
    `,
    async () => {
      const raw = document.getElementById("f_steps").value;
      const steps = raw.split("\n").map((s) => s.trim()).filter(Boolean);
      await updateTestSteps(tcId, steps);
      alert("updateTestSteps() is a TODO placeholder. See console.");
    }
  );
};

document.getElementById("btnRefresh").onclick = async () => {
  if (!selected) { alert("Please select a node first."); return; }
  if (typeof selected.node._refresh === "function") {
    await selected.node._refresh();
  }
};

// Go!
loadProjects();
