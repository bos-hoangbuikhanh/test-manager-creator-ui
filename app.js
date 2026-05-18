/**
 * Codebeamer Test Manager — app.js
 * Modular vanilla-JS frontend for managing Codebeamer testcases.
 *
 * Architecture:
 *   Config     — API connection settings (stored in localStorage)
 *   Api        — HTTP helpers that proxy to the Codebeamer REST API
 *   Log        — Right-panel API log renderer
 *   Toast      — Toast notification helper
 *   Tree       — Left sidebar tree (Projects → Trackers → Items → Testcases)
 *   Editor     — Testcase create/edit modal logic
 *   Content    — Main content panel switcher
 *   App        — Bootstrap / init
 */

'use strict';

/* ================================================================
   CONFIG
   Password is held only in memory (never written to localStorage)
   to avoid clear-text credential storage in the browser.
   ================================================================ */
const Config = (() => {
  const KEY = 'cb_config';

  // In-memory password — cleared when the page is unloaded.
  let _sessionPassword = '';

  function load() {
    try {
      const stored = JSON.parse(localStorage.getItem(KEY)) || {};
      // Re-attach in-memory password so callers see a complete object.
      return { ...stored, password: _sessionPassword };
    } catch {
      return { password: _sessionPassword };
    }
  }

  /**
   * Persist only non-sensitive fields. The password is stored in memory
   * only for the lifetime of the page session.
   */
  function save(cfg) {
    _sessionPassword = cfg.password || '';
    const { password, ...safe } = cfg;
    localStorage.setItem(KEY, JSON.stringify(safe));
  }

  function get() {
    return load();
  }

  function baseUrl() {
    return (load().baseUrl || '').replace(/\/$/, '');
  }

  function headers() {
    const cfg = load();
    const creds = btoa(`${cfg.username || ''}:${_sessionPassword}`);
    return {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${creds}`,
    };
  }

  return { load, save, get, baseUrl, headers };
})();

/* ================================================================
   LOG PANEL
   ================================================================ */
const Log = (() => {
  const body = () => document.getElementById('logBody');

  function ts() {
    return new Date().toISOString().substring(11, 23);
  }

  function append(type, label, message, detail) {
    const el = document.createElement('div');
    el.className = `cb-log-entry cb-log-${type}`;

    let inner = `<span class="cb-log-ts">${ts()}</span>
      <span class="cb-log-label label-${label}">${label.toUpperCase()}</span>
      <span class="flex-grow-1">`;

    if (typeof message === 'object') {
      inner += `<pre>${JSON.stringify(message, null, 2)}</pre>`;
    } else {
      inner += escapeHtml(String(message));
    }

    if (detail !== undefined) {
      inner += `<pre class="mt-1 opacity-75">${typeof detail === 'object'
        ? JSON.stringify(detail, null, 2)
        : escapeHtml(String(detail))}</pre>`;
    }

    inner += '</span>';
    el.innerHTML = inner;

    const b = body();
    b.appendChild(el);
    b.scrollTop = b.scrollHeight;
  }

  function info(msg, detail)    { append('info',    'info',    msg, detail); }
  function success(msg, detail) { append('success', 'success', msg, detail); }
  function error(msg, detail)   { append('error',   'error',   msg, detail); }
  function warn(msg, detail)    { append('warn',    'warn',    msg, detail); }
  function request(method, url, payload) {
    append('req', 'req', `${method} ${url}`, payload);
  }
  function response(status, data) {
    const label = status >= 400 ? 'error' : 'res';
    append(label === 'error' ? 'error' : 'req', label, `HTTP ${status}`, data);
  }

  function clear() {
    body().innerHTML = '';
    info('Log cleared.');
  }

  function copyAll() {
    const text = Array.from(body().querySelectorAll('.cb-log-entry'))
      .map(e => e.innerText)
      .join('\n---\n');
    navigator.clipboard.writeText(text).then(() => {
      Toast.show('success', 'Log copied to clipboard');
    });
  }

  return { info, success, error, warn, request, response, clear, copyAll };
})();

/* ================================================================
   TOAST
   ================================================================ */
const Toast = (() => {
  const container = () => document.getElementById('toastContainer');

  function show(type, message, duration = 3500) {
    const colours = {
      success: '#4ade80',
      error:   '#f87171',
      warn:    '#fbbf24',
      info:    '#4f8ef7',
    };
    const icons = {
      success: 'bi-check-circle-fill',
      error:   'bi-x-circle-fill',
      warn:    'bi-exclamation-triangle-fill',
      info:    'bi-info-circle-fill',
    };
    const colour = colours[type] || colours.info;
    const icon   = icons[type]   || icons.info;

    const wrapper = document.createElement('div');
    wrapper.innerHTML = `
      <div class="toast cb-toast show align-items-center" role="alert">
        <div class="toast-body d-flex align-items-center gap-2">
          <i class="bi ${icon}" style="color:${colour};font-size:1rem;flex-shrink:0;"></i>
          <span>${escapeHtml(message)}</span>
          <button type="button" class="btn-close ms-auto" style="font-size:0.6rem;"></button>
        </div>
      </div>`;

    const toastEl = wrapper.firstElementChild;
    container().appendChild(toastEl);

    // anime.js entrance
    anime({
      targets: toastEl,
      translateX: [60, 0],
      opacity: [0, 1],
      duration: 300,
      easing: 'easeOutCubic',
    });

    toastEl.querySelector('.btn-close').addEventListener('click', () => dismiss(toastEl));
    setTimeout(() => dismiss(toastEl), duration);
  }

  function dismiss(el) {
    anime({
      targets: el,
      translateX: [0, 60],
      opacity: [1, 0],
      duration: 250,
      easing: 'easeInCubic',
      complete: () => el.remove(),
    });
  }

  return { show };
})();

/* ================================================================
   API HELPERS
   ================================================================ */
const Api = (() => {
  const MAX_RETRIES = 3;
  const RETRY_DELAY = 1000; // ms base delay for 429

  async function request(method, path, body, retryCount = 0) {
    const url = `${Config.baseUrl()}${path}`;
    Log.request(method, url, body);

    let res;
    try {
      res = await fetch(url, {
        method,
        headers: Config.headers(),
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (err) {
      Log.error(`Network error: ${err.message}`);
      throw err;
    }

    // 429 — rate-limited, respect Retry-After header or use exponential back-off
    if (res.status === 429 && retryCount < MAX_RETRIES) {
      const retryAfter = res.headers.get('Retry-After');
      const wait = retryAfter ? parseInt(retryAfter, 10) * 1000 : RETRY_DELAY * Math.pow(2, retryCount);
      Log.warn(`429 Too Many Requests — retrying in ${wait}ms (attempt ${retryCount + 1})`);
      await sleep(wait);
      return request(method, path, body, retryCount + 1);
    }

    let data;
    try {
      data = await res.json();
    } catch (parseErr) {
      Log.warn(`Response body could not be parsed as JSON: ${parseErr.message}`);
      data = null;
    }

    Log.response(res.status, data);

    if (!res.ok) {
      const msg = data?.message || data?.errors?.[0] || `HTTP ${res.status}`;
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  }

  const get  = (path)        => request('GET',  path);
  const post = (path, body)  => request('POST', path, body);
  const put  = (path, body)  => request('PUT',  path, body);
  const patch = (path, body) => request('PATCH', path, body);

  // ── Domain helpers ──────────────────────────────────────────

  /** GET /projects */
  async function getProjects() {
    return get('/api/v3/projects');
  }

  /** GET /projects/{id}/trackers */
  async function getTrackers(projectId) {
    return get(`/api/v3/projects/${projectId}/trackers`);
  }

  /** GET /items/{id}/children?page=1&pageSize=100 — mirrors get_children() */
  async function getChildren(itemId) {
    return get(`/api/v3/items/${itemId}/children?page=1&pageSize=100`);
  }

  /** GET /items/{id}/fields — mirrors get_item_fields() */
  async function getItemFields(itemId) {
    return get(`/api/v3/items/${itemId}/fields`);
  }

  /** GET /items/{id} */
  async function getItem(itemId) {
    return get(`/api/v3/items/${itemId}`);
  }

  /**
   * create_testcase_under_parent()
   * Creates a new testcase item under a parent item.
   *
   * Returns: { parent_id, parent_url, testcase_id, testcase_url, testcase_name }
   */
  async function createTestcaseUnderParent(parentId, testcaseName, description = '') {
    // Step 1: create the item inside the same tracker as the parent
    // We need the parent's tracker first
    const parent = await getItem(parentId);
    const trackerId = parent?.tracker?.id;
    if (!trackerId) throw new Error('Could not determine tracker from parent item.');

    const payload = {
      name: testcaseName,
      description,
      parent: { id: parentId },
      tracker: { id: trackerId },
    };

    const created = await post(`/api/v3/items`, payload);

    return {
      parent_id:      parentId,
      parent_url:     parent?.htmlLink || '',
      testcase_id:    created.id,
      testcase_url:   created.htmlLink || '',
      testcase_name:  created.name,
    };
  }

  /**
   * update_testcase_steps()
   * Updates the Test Steps table (fieldId 1000000) on a testcase.
   *
   * steps: [{ action, expected_result, critical }]
   *
   * Field mapping:
   *   fieldId 1000000 — Test Steps table
   *   fieldId 1000001 — Action
   *   fieldId 1000002 — Expected result
   *   fieldId 1000003 — Critical
   *   fieldId 1000004 — Step UUID
   */
  async function updateTestcaseSteps(testcaseId, steps) {
    const stepsPayload = steps.map((s, i) => ({
      fieldId: 1000000,
      value: {
        rows: [{
          cells: [
            { fieldId: 1000001, value: s.action          || '' },
            { fieldId: 1000002, value: s.expected_result || '' },
            { fieldId: 1000003, value: s.critical        || false },
            { fieldId: 1000004, value: s.uuid            || generateUUID() },
          ],
        }],
      },
      // Row index used by some Codebeamer versions
      rowIndex: i,
    }));

    return put(`/api/v3/items/${testcaseId}/fields`, stepsPayload);
  }

  return {
    getProjects,
    getTrackers,
    getChildren,
    getItemFields,
    getItem,
    createTestcaseUnderParent,
    updateTestcaseSteps,
  };
})();

/* ================================================================
   MOCK DATA (used when no real API is configured)
   ================================================================ */
const MockData = {
  projects: [
    { id: 1001, name: 'PROJ_EMBEDDED_SYSTEM', description: 'Embedded firmware project' },
    { id: 1002, name: 'PROJ_CLOUD_PLATFORM',  description: 'Cloud services project' },
  ],
  trackers: {
    1001: [
      { id: 2001, name: 'TestTracker — Boot Tests',   keyName: 'TT-BOOT' },
      { id: 2002, name: 'TestTracker — Network Tests', keyName: 'TT-NET'  },
    ],
    1002: [
      { id: 2003, name: 'TestTracker — API Tests',    keyName: 'TT-API'  },
    ],
  },
  items: {
    2001: [
      { id: 77074, name: 'REQ_SECURE_BOOT',    summary: 'Secure boot requirements group',   type: 'Requirement' },
      { id: 77075, name: 'REQ_POWER_ON',       summary: 'Power-on sequence requirements',   type: 'Requirement' },
    ],
    2002: [
      { id: 77080, name: 'REQ_TCP_STACK',      summary: 'TCP/IP stack requirements',         type: 'Requirement' },
    ],
    2003: [
      { id: 77090, name: 'REQ_REST_ENDPOINTS', summary: 'REST endpoint test scenarios',      type: 'Requirement' },
    ],
  },
  testcases: {
    77074: [
      {
        id: 1446001,
        name: 'TC_SECURE_BOOT_01',
        description: 'Verify secure boot chain.',
        steps: [
          { action: 'Power on the device.',              expected_result: 'Device powers on.',           critical: true  },
          { action: 'Check bootloader signature.',       expected_result: 'Signature is valid.',         critical: true  },
          { action: 'Verify OS image checksum.',         expected_result: 'Checksum matches expected.',  critical: false },
        ],
      },
      {
        id: 1446002,
        name: 'TC_SECURE_BOOT_02',
        description: 'Test tampered image detection.',
        steps: [
          { action: 'Tamper with OS image.',             expected_result: 'Boot fails with error code.', critical: true  },
        ],
      },
    ],
    77075: [],
    77080: [
      {
        id: 1446010,
        name: 'TC_TCP_CONNECT_01',
        description: 'Verify TCP connection establishment.',
        steps: [
          { action: 'Open socket.', expected_result: 'Socket opened successfully.', critical: false },
          { action: 'Connect to server.', expected_result: 'Connection established.',  critical: true  },
        ],
      },
    ],
    77090: [],
  },
  _nextId: 1446100,
};

/* ================================================================
   TREE STATE
   ================================================================ */
const TreeState = {
  expandedNodes: new Set(),
  selectedNode: null,
  useMock: true, // set to false when real API configured
};

/* ================================================================
   TREE RENDERER
   ================================================================ */
const Tree = (() => {

  /* ── renderProjectTree ───────────────────────────────────── */
  async function renderProjectTree() {
    const container = document.getElementById('projectTree');
    const skeleton  = document.getElementById('treeSkeleton');

    skeleton.style.display = 'block';
    container.style.display = 'none';
    container.innerHTML = '';

    let projects;
    if (TreeState.useMock) {
      await sleep(400); // simulate network
      projects = MockData.projects;
    } else {
      try {
        const res = await Api.getProjects();
        projects = Array.isArray(res) ? res : (res.projects || []);
      } catch (err) {
        Log.error('Failed to load projects', err.message);
        Toast.show('error', `Failed to load projects: ${err.message}`);
        skeleton.style.display = 'none';
        return;
      }
    }

    skeleton.style.display = 'none';
    container.style.display = 'block';

    projects.forEach(p => {
      const li = buildProjectNode(p);
      container.appendChild(li);
    });

    Log.success(`Loaded ${projects.length} projects.`);

    // anime.js stagger entrance
    anime({
      targets: '#projectTree > li',
      opacity: [0, 1],
      translateX: [-12, 0],
      delay: anime.stagger(50),
      duration: 300,
      easing: 'easeOutCubic',
    });
  }

  /* ── buildProjectNode ────────────────────────────────────── */
  function buildProjectNode(project) {
    const li = document.createElement('li');
    li.dataset.type = 'project';
    li.dataset.id   = project.id;

    const item = document.createElement('div');
    item.className = 'cb-tree-item';
    item.innerHTML = `
      <span class="cb-tree-toggle"><i class="bi bi-chevron-right" style="font-size:0.65rem;"></i></span>
      <i class="bi bi-folder2 cb-tree-icon icon-project"></i>
      <span class="cb-tree-label" title="${escapeHtml(project.name)}">${escapeHtml(project.name)}</span>`;

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'cb-tree-children list-unstyled ps-3 mb-0';
    childrenUl.style.height = '0';
    childrenUl.style.overflow = 'hidden';

    item.addEventListener('click', () => toggleNode(li, item, childrenUl, () => loadTrackers(project.id, childrenUl)));
    li.appendChild(item);
    li.appendChild(childrenUl);
    return li;
  }

  /* ── renderTrackers ──────────────────────────────────────── */
  async function loadTrackers(projectId, parentUl) {
    if (parentUl.dataset.loaded) return;
    showLoadingIn(parentUl);

    let trackers;
    if (TreeState.useMock) {
      await sleep(300);
      trackers = MockData.trackers[projectId] || [];
    } else {
      try {
        const res = await Api.getTrackers(projectId);
        trackers = Array.isArray(res) ? res : (res.trackers || []);
      } catch (err) {
        Log.error('Failed to load trackers', err.message);
        Toast.show('error', `Failed to load trackers: ${err.message}`);
        return;
      }
    }

    clearLoadingIn(parentUl);
    parentUl.dataset.loaded = '1';

    trackers.forEach(t => {
      const li = buildTrackerNode(t);
      parentUl.appendChild(li);
    });

    Log.success(`Loaded ${trackers.length} trackers for project #${projectId}.`);
    animateChildren(parentUl);
  }

  /* ── buildTrackerNode ────────────────────────────────────── */
  function buildTrackerNode(tracker) {
    const li = document.createElement('li');
    li.dataset.type = 'tracker';
    li.dataset.id   = tracker.id;

    const item = document.createElement('div');
    item.className = 'cb-tree-item';
    item.innerHTML = `
      <span class="cb-tree-toggle"><i class="bi bi-chevron-right" style="font-size:0.65rem;"></i></span>
      <i class="bi bi-layers cb-tree-icon icon-tracker"></i>
      <span class="cb-tree-label" title="${escapeHtml(tracker.name)}">${escapeHtml(tracker.name)}</span>`;

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'cb-tree-children list-unstyled ps-3 mb-0';
    childrenUl.style.height = '0';
    childrenUl.style.overflow = 'hidden';

    item.addEventListener('click', () => toggleNode(li, item, childrenUl, () => loadTrackerChildren(tracker.id, childrenUl)));
    li.appendChild(item);
    li.appendChild(childrenUl);
    return li;
  }

  /* ── renderChildren (requirement items) ─────────────────── */
  async function loadTrackerChildren(trackerId, parentUl) {
    if (parentUl.dataset.loaded) return;
    showLoadingIn(parentUl);

    let items;
    if (TreeState.useMock) {
      await sleep(300);
      items = MockData.items[trackerId] || [];
    } else {
      try {
        const res = await Api.getChildren(trackerId);
        items = res.itemRefs || [];
      } catch (err) {
        Log.error('Failed to load tracker children', err.message);
        Toast.show('error', `Failed to load items: ${err.message}`);
        return;
      }
    }

    clearLoadingIn(parentUl);
    parentUl.dataset.loaded = '1';

    items.forEach(it => {
      const li = buildRequirementNode(it);
      parentUl.appendChild(li);
    });

    Log.success(`Loaded ${items.length} items for tracker #${trackerId}.`);
    animateChildren(parentUl);
  }

  /* ── buildRequirementNode ────────────────────────────────── */
  function buildRequirementNode(item) {
    const li = document.createElement('li');
    li.dataset.type = 'requirement';
    li.dataset.id   = item.id;

    const displayName = item.name || item.summary || `Item #${item.id}`;

    const el = document.createElement('div');
    el.className = 'cb-tree-item';
    el.innerHTML = `
      <span class="cb-tree-toggle"><i class="bi bi-chevron-right" style="font-size:0.65rem;"></i></span>
      <i class="bi bi-box-arrow-in-right cb-tree-icon icon-item"></i>
      <span class="cb-tree-label" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</span>`;

    const childrenUl = document.createElement('ul');
    childrenUl.className = 'cb-tree-children list-unstyled ps-3 mb-0';
    childrenUl.style.height = '0';
    childrenUl.style.overflow = 'hidden';

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(el);
      Content.showParentItem(item);
      toggleNode(li, el, childrenUl, () => loadTestcases(item.id, childrenUl));
    });

    li.appendChild(el);
    li.appendChild(childrenUl);
    return li;
  }

  /* ── loadTestcases ───────────────────────────────────────── */
  async function loadTestcases(parentId, parentUl, forceReload = false) {
    if (parentUl.dataset.loaded && !forceReload) return;
    if (forceReload) parentUl.innerHTML = '';
    showLoadingIn(parentUl);

    let testcases;
    if (TreeState.useMock) {
      await sleep(300);
      testcases = MockData.testcases[parentId] || [];
    } else {
      try {
        const res = await Api.getChildren(parentId);
        testcases = res.itemRefs || [];
      } catch (err) {
        Log.error('Failed to load testcases', err.message);
        Toast.show('error', `Failed to load testcases: ${err.message}`);
        return;
      }
    }

    clearLoadingIn(parentUl);
    parentUl.dataset.loaded = '1';

    testcases.forEach(tc => {
      const li = buildTestcaseNode(tc);
      parentUl.appendChild(li);
    });

    Log.success(`Loaded ${testcases.length} testcases under item #${parentId}.`);
    animateChildren(parentUl);
    return testcases;
  }

  /* ── buildTestcaseNode ───────────────────────────────────── */
  function buildTestcaseNode(tc) {
    const li = document.createElement('li');
    li.dataset.type = 'testcase';
    li.dataset.id   = tc.id;
    li.dataset.tcId = tc.id; // for find-by-id

    const name = tc.name || `TC #${tc.id}`;

    const el = document.createElement('div');
    el.className = 'cb-tree-item';
    el.dataset.tcId = tc.id;
    el.innerHTML = `
      <span style="width:16px;flex-shrink:0;"></span>
      <i class="bi bi-clipboard2-check cb-tree-icon icon-testcase"></i>
      <span class="cb-tree-label" title="${escapeHtml(name)}">${escapeHtml(name)}</span>`;

    el.addEventListener('click', (e) => {
      e.stopPropagation();
      selectNode(el);
      Content.showTestcase(tc);
    });

    li.appendChild(el);
    return li;
  }

  /* ── addTestcaseToTree ───────────────────────────────────── */
  function addTestcaseToTree(parentId, tcData) {
    // Find the parent requirement's child <ul>
    const parentLi = document.querySelector(`li[data-type="requirement"][data-id="${parentId}"]`);
    if (!parentLi) return;
    const ul = parentLi.querySelector('.cb-tree-children');
    if (!ul) return;

    const li = buildTestcaseNode(tcData);
    ul.appendChild(li);

    // Animate new node
    animateNewNode(li);

    // Highlight
    highlightNewTestcase(li.querySelector('.cb-tree-item'));
  }

  /* ── toggleNode ──────────────────────────────────────────── */
  function toggleNode(li, itemEl, childrenUl, loadFn) {
    const isOpen = li.dataset.open === '1';

    if (isOpen) {
      animateTreeCollapse(childrenUl, itemEl);
      li.dataset.open = '0';
    } else {
      loadFn();
      animateTreeExpand(childrenUl, itemEl);
      li.dataset.open = '1';
    }
  }

  /* ── selectNode ──────────────────────────────────────────── */
  function selectNode(itemEl) {
    document.querySelectorAll('.cb-tree-item.active').forEach(el => el.classList.remove('active'));
    itemEl.classList.add('active');
    TreeState.selectedNode = itemEl;
  }

  /* ── Loading spinners ────────────────────────────────────── */
  function showLoadingIn(ul) {
    const div = document.createElement('div');
    div.className = 'cb-tree-loading';
    div.innerHTML = `<div class="spinner-border spinner-border-sm" style="width:12px;height:12px;border-width:2px;"></div><span>Loading…</span>`;
    ul.appendChild(div);
  }

  function clearLoadingIn(ul) {
    ul.querySelectorAll('.cb-tree-loading').forEach(el => el.remove());
  }

  /* ── Filter tree ─────────────────────────────────────────── */
  function filter(query) {
    const q = query.toLowerCase().trim();
    document.querySelectorAll('.cb-tree-item').forEach(el => {
      const label = el.querySelector('.cb-tree-label')?.textContent?.toLowerCase() || '';
      const li = el.closest('li');
      if (!li) return;
      li.style.display = (!q || label.includes(q)) ? '' : 'none';
    });
  }

  return { renderProjectTree, loadTestcases, addTestcaseToTree, filter, selectNode, buildTestcaseNode };
})();

/* ================================================================
   ANIMATIONS (anime.js)
   ================================================================ */

/** animateTreeExpand — slide down children list */
function animateTreeExpand(ul, toggleEl) {
  const toggle = toggleEl.querySelector('.cb-tree-toggle');
  if (toggle) {
    anime({ targets: toggle, rotate: 90, duration: 200, easing: 'easeOutCubic' });
  }
  ul.style.overflow = 'hidden';
  // measure natural height
  ul.style.height = 'auto';
  const h = ul.scrollHeight;
  ul.style.height = '0';
  anime({
    targets: ul,
    height: [0, h],
    duration: 250,
    easing: 'easeOutCubic',
    complete: () => { ul.style.height = 'auto'; ul.style.overflow = 'visible'; },
  });
}

/** animateTreeCollapse */
function animateTreeCollapse(ul, toggleEl) {
  const toggle = toggleEl.querySelector('.cb-tree-toggle');
  if (toggle) {
    anime({ targets: toggle, rotate: 0, duration: 200, easing: 'easeOutCubic' });
  }
  anime({
    targets: ul,
    height: [ul.scrollHeight, 0],
    duration: 220,
    easing: 'easeInCubic',
    complete: () => { ul.style.overflow = 'hidden'; },
  });
}

/** animateChildren — stagger newly appended items */
function animateChildren(ul) {
  anime({
    targets: ul.querySelectorAll(':scope > li'),
    opacity: [0, 1],
    translateX: [-8, 0],
    delay: anime.stagger(40),
    duration: 200,
    easing: 'easeOutCubic',
  });
}

/** animateNewNode — pop-in for freshly created tree node */
function animateNewNode(li) {
  anime({
    targets: li,
    opacity: [0, 1],
    scale: [0.85, 1],
    duration: 400,
    easing: 'easeOutBack',
  });
}

/** animateSaveSuccess — success pulse on the main panel */
function animateSaveSuccess(el) {
  anime({
    targets: el,
    backgroundColor: ['rgba(74,222,128,0.15)', 'rgba(74,222,128,0)'],
    duration: 1200,
    easing: 'easeOutQuad',
  });
}

/** animateError — shake + red flash on the target element */
function animateError(el) {
  el.classList.add('cb-shake');
  setTimeout(() => el.classList.remove('cb-shake'), 450);
  anime({
    targets: el,
    backgroundColor: ['rgba(248,113,113,0.18)', 'rgba(248,113,113,0)'],
    duration: 800,
    easing: 'easeOutQuad',
  });
}

/** highlightNewTestcase — glow animation on newly created card/node */
function highlightNewTestcase(el) {
  anime({
    targets: el,
    backgroundColor: [
      { value: 'rgba(79,142,247,0.25)', duration: 300 },
      { value: 'rgba(79,142,247,0)',    duration: 1200 },
    ],
    easing: 'easeOutCubic',
  });
}

/* ================================================================
   EDITOR (Create / Edit Modal)
   ================================================================ */
const Editor = (() => {
  let modalInstance = null;
  let stepCounter = 0;

  function getModal() {
    if (!modalInstance) {
      modalInstance = new bootstrap.Modal(document.getElementById('testcaseModal'), {
        backdrop: 'static',
        keyboard: false,
      });
    }
    return modalInstance;
  }

  /* ── openCreate ──────────────────────────────────────────── */
  function openCreate(parentId, parentName) {
    document.getElementById('tcMode').value       = 'create';
    document.getElementById('tcParentId').value   = parentId;
    document.getElementById('tcId').value         = '';
    document.getElementById('tcName').value       = '';
    document.getElementById('tcDescription').value = '';
    document.getElementById('tcParentIdDisplay').value = `#${parentId} — ${parentName}`;
    document.getElementById('modalTitle').textContent  = 'Create Testcase';
    document.getElementById('modalIcon').className     = 'bi bi-file-earmark-plus me-2 text-cb-accent';

    clearSteps();
    addStep(); // start with one empty step

    getModal().show();

    // Animate modal body
    anime({
      targets: '#testcaseModal .modal-content',
      opacity: [0, 1],
      translateY: [-20, 0],
      duration: 350,
      easing: 'easeOutCubic',
    });
  }

  /* ── openEdit ────────────────────────────────────────────── */
  function openEdit(tc) {
    document.getElementById('tcMode').value        = 'edit';
    document.getElementById('tcParentId').value    = '';
    document.getElementById('tcId').value          = tc.id;
    document.getElementById('tcName').value        = tc.name || '';
    document.getElementById('tcDescription').value = tc.description || '';
    document.getElementById('tcParentIdDisplay').value = `#${tc.id}`;
    document.getElementById('modalTitle').textContent  = 'Edit Testcase';
    document.getElementById('modalIcon').className     = 'bi bi-pencil-square me-2 text-cb-accent';

    clearSteps();
    const steps = tc.steps || [];
    if (steps.length === 0) addStep();
    else steps.forEach(s => addStep(s));

    getModal().show();

    anime({
      targets: '#testcaseModal .modal-content',
      opacity: [0, 1],
      translateY: [-20, 0],
      duration: 350,
      easing: 'easeOutCubic',
    });
  }

  /* ── addStep ─────────────────────────────────────────────── */
  function addStep(data = {}) {
    stepCounter++;
    const tbody = document.getElementById('stepsTableBody');
    const empty = document.getElementById('stepsEmptyHint');
    empty.style.display = 'none';

    const tr = document.createElement('tr');
    tr.className = 'cb-step-row';
    tr.dataset.stepIdx = stepCounter;
    tr.innerHTML = `
      <td class="text-muted text-center small fw-semibold">${tbody.querySelectorAll('tr').length + 1}</td>
      <td>
        <textarea class="form-control cb-input step-action" rows="2"
          placeholder="Describe the action…">${escapeHtml(data.action || '')}</textarea>
      </td>
      <td>
        <textarea class="form-control cb-input step-expected" rows="2"
          placeholder="Describe expected result…">${escapeHtml(data.expected_result || '')}</textarea>
      </td>
      <td class="text-center">
        <div class="form-check d-flex justify-content-center">
          <input class="form-check-input step-critical" type="checkbox"
            ${data.critical ? 'checked' : ''} title="Mark as critical" />
        </div>
      </td>
      <td class="text-center">
        <button class="btn btn-sm cb-btn-ghost btn-delete-step" title="Delete step">
          <i class="bi bi-trash3 text-danger small"></i>
        </button>
      </td>`;

    tr.querySelector('.btn-delete-step').addEventListener('click', () => {
      anime({
        targets: tr,
        opacity: [1, 0],
        height: [tr.offsetHeight, 0],
        duration: 220,
        easing: 'easeInCubic',
        complete: () => {
          tr.remove();
          renumberSteps();
          if (tbody.querySelectorAll('tr').length === 0) {
            document.getElementById('stepsEmptyHint').style.display = '';
          }
        },
      });
    });

    tbody.appendChild(tr);

    // entrance animation
    anime({
      targets: tr,
      opacity: [0, 1],
      translateY: [-6, 0],
      duration: 200,
      easing: 'easeOutCubic',
    });
  }

  function renumberSteps() {
    document.querySelectorAll('#stepsTableBody tr').forEach((tr, i) => {
      const first = tr.querySelector('td:first-child');
      if (first) first.textContent = i + 1;
    });
  }

  function clearSteps() {
    document.getElementById('stepsTableBody').innerHTML = '';
    document.getElementById('stepsEmptyHint').style.display = 'none';
    stepCounter = 0;
  }

  function collectSteps() {
    return Array.from(document.querySelectorAll('#stepsTableBody tr')).map(tr => ({
      action:          tr.querySelector('.step-action')?.value.trim()   || '',
      expected_result: tr.querySelector('.step-expected')?.value.trim() || '',
      critical:        tr.querySelector('.step-critical')?.checked      || false,
    }));
  }

  /* ── save ────────────────────────────────────────────────── */
  async function save() {
    const mode     = document.getElementById('tcMode').value;
    const name     = document.getElementById('tcName').value.trim();
    const desc     = document.getElementById('tcDescription').value.trim();
    const parentId = parseInt(document.getElementById('tcParentId').value, 10);
    const tcId     = parseInt(document.getElementById('tcId').value, 10);
    const steps    = collectSteps();
    const btn      = document.getElementById('btnSaveTestcase');
    const progress = document.getElementById('modalProgress');

    // Validate
    if (!name) {
      animateError(document.getElementById('tcName'));
      Toast.show('warn', 'Testcase name is required.');
      return;
    }

    btn.disabled = true;
    btn.innerHTML = `<span class="spinner-border spinner-border-sm me-1"></span>Saving…`;
    progress.style.display = '';

    try {
      if (mode === 'create') {
        await createTestcaseFlow(parentId, name, desc, steps);
      } else {
        await updateTestcaseFlow(tcId, name, steps);
      }

      getModal().hide();
      animateSaveSuccess(document.getElementById('mainContent'));
      Toast.show('success', mode === 'create' ? 'Testcase created!' : 'Testcase updated!');
    } catch (err) {
      Log.error('Save failed', err.message);
      Toast.show('error', `Save failed: ${err.message}`);
      animateError(document.querySelector('.cb-modal'));
    } finally {
      btn.disabled = false;
      btn.innerHTML = `<i class="bi bi-floppy me-1"></i>Save Testcase`;
      progress.style.display = 'none';
    }
  }

  return { openCreate, openEdit, addStep, save };
})();

/* ================================================================
   CREATE / UPDATE FLOWS
   ================================================================ */

/** createTestcaseFlow — calls create then update steps */
async function createTestcaseFlow(parentId, name, description, steps) {
  Log.info(`createTestcaseFlow: parent=${parentId}, name="${name}"`);

  let result;
  if (TreeState.useMock) {
    await sleep(600);
    const newId = MockData._nextId++;
    result = {
      parent_id:     parentId,
      parent_url:    `https://codebeamer.example.com/cb/item/${parentId}`,
      testcase_id:   newId,
      testcase_url:  `https://codebeamer.example.com/cb/item/${newId}`,
      testcase_name: name,
    };
    // persist into mock
    if (!MockData.testcases[parentId]) MockData.testcases[parentId] = [];
    MockData.testcases[parentId].push({ id: newId, name, description, steps });
    Log.success('Mock testcase created', result);
  } else {
    result = await Api.createTestcaseUnderParent(parentId, name, description);
    Log.success('Testcase created', result);

    if (steps.length > 0) {
      await updateTestcaseFlow(result.testcase_id, name, steps);
    }
  }

  // Add to tree
  Tree.addTestcaseToTree(parentId, {
    id:   result.testcase_id,
    name: result.testcase_name,
    url:  result.testcase_url,
  });

  // Refresh child panel
  await Content.refreshChildren(parentId);

  return result;
}

/** updateTestcaseFlow — updates testcase steps */
async function updateTestcaseFlow(testcaseId, name, steps) {
  Log.info(`updateTestcaseFlow: testcaseId=${testcaseId}, steps=${steps.length}`);

  if (TreeState.useMock) {
    await sleep(500);
    // Update in mock
    for (const bucket of Object.values(MockData.testcases)) {
      const tc = bucket.find(t => t.id === testcaseId);
      if (tc) {
        tc.steps = steps;
        if (name) tc.name = name;
        break;
      }
    }
    Log.success('Mock testcase steps updated.', { testcaseId, stepsCount: steps.length });
  } else {
    await Api.updateTestcaseSteps(testcaseId, steps);
    Log.success('Testcase steps updated.', { testcaseId, stepsCount: steps.length });
  }
}

/* ================================================================
   CONTENT PANEL
   ================================================================ */
const Content = (() => {
  let _currentParentId = null;
  let _currentTc       = null;

  /* ── showParentItem ──────────────────────────────────────── */
  function showParentItem(item) {
    _currentParentId = item.id;
    hide('emptyState');
    hide('testcasePanel');
    show('parentItemPanel', 'cb-fade-in-up');

    document.getElementById('parentItemName').textContent = item.name || item.summary || `Item #${item.id}`;
    document.getElementById('parentItemId').textContent   = item.id;

    const url = item.htmlLink || item.url || '#';
    const urlEl = document.getElementById('parentItemUrl');
    urlEl.href = url;
    urlEl.style.display = url === '#' ? 'none' : '';

    refreshChildren(item.id);
  }

  /* ── refreshChildren ─────────────────────────────────────── */
  async function refreshChildren(parentId) {
    _currentParentId = parentId;
    const listEl = document.getElementById('childTestcasesList');
    const emptyEl = document.getElementById('childrenEmpty');
    const countEl = document.getElementById('childCount');

    listEl.innerHTML = `<div class="text-center py-3">
      <div class="spinner-border spinner-border-sm text-cb-accent"></div>
    </div>`;

    let testcases;
    if (TreeState.useMock) {
      await sleep(200);
      testcases = MockData.testcases[parentId] || [];
    } else {
      try {
        const res = await Api.getChildren(parentId);
        testcases = res.itemRefs || [];
      } catch (err) {
        Log.error('Failed to load children', err.message);
        listEl.innerHTML = `<div class="text-danger small py-2">Failed to load: ${escapeHtml(err.message)}</div>`;
        return;
      }
    }

    countEl.textContent = testcases.length;

    if (testcases.length === 0) {
      listEl.innerHTML = '';
      emptyEl.style.display = '';
    } else {
      emptyEl.style.display = 'none';
      listEl.innerHTML = '';
      testcases.forEach((tc, i) => {
        const card = buildChildCard(tc, i);
        listEl.appendChild(card);
      });

      anime({
        targets: '#childTestcasesList .cb-child-card',
        opacity: [0, 1],
        translateY: [8, 0],
        delay: anime.stagger(50),
        duration: 250,
        easing: 'easeOutCubic',
      });
    }
  }

  function buildChildCard(tc, idx) {
    const card = document.createElement('div');
    card.className = 'cb-child-card';
    card.dataset.tcId = tc.id;
    const name = tc.name || `TC #${tc.id}`;
    card.innerHTML = `
      <i class="bi bi-clipboard2-check icon-testcase fs-5"></i>
      <div class="flex-grow-1 overflow-hidden">
        <div class="fw-semibold text-truncate small">${escapeHtml(name)}</div>
        <div class="text-muted" style="font-size:0.72rem;">#${tc.id}</div>
      </div>
      <i class="bi bi-chevron-right text-muted small"></i>`;

    card.addEventListener('click', () => {
      Tree.selectNode(document.querySelector(`.cb-tree-item[data-tc-id="${tc.id}"]`) || card);
      showTestcase(tc);
    });
    return card;
  }

  /* ── showTestcase ────────────────────────────────────────── */
  async function showTestcase(tc) {
    _currentTc = tc;
    hide('emptyState');
    hide('parentItemPanel');
    show('testcasePanel', 'cb-fade-in-up');

    const name = tc.name || `TC #${tc.id}`;
    document.getElementById('tcViewName').textContent = name;
    document.getElementById('tcViewId').textContent   = tc.id;

    const url = tc.htmlLink || tc.url || '#';
    const urlEl = document.getElementById('tcViewUrl');
    urlEl.href = url;
    urlEl.style.display = url === '#' ? 'none' : '';

    await renderTestcaseEditor(tc);
  }

  /* ── renderTestcaseEditor (steps view) ───────────────────── */
  async function renderTestcaseEditor(tc) {
    const viewContent = document.getElementById('stepsViewContent');
    const stepsLoading = document.getElementById('stepsLoading');
    const stepsEmpty   = document.getElementById('stepsViewEmpty');
    const stepsCount   = document.getElementById('tcStepCount');

    viewContent.innerHTML = '';
    stepsEmpty.style.display = 'none';
    stepsLoading.style.display = '';
    stepsCount.textContent = '…';

    let steps;

    if (TreeState.useMock) {
      await sleep(250);
      // find in mock data
      for (const bucket of Object.values(MockData.testcases)) {
        const found = bucket.find(t => t.id === tc.id);
        if (found) { steps = found.steps || []; break; }
      }
      steps = steps || [];
    } else {
      try {
        const fields = await Api.getItemFields(tc.id);
        const stepsField = (fields || []).find(f => f.fieldId === 1000000);
        steps = parseStepsFromField(stepsField);
      } catch (err) {
        Log.error('Failed to load testcase fields', err.message);
        steps = [];
      }
    }

    stepsLoading.style.display = 'none';
    stepsCount.textContent = steps.length;

    if (steps.length === 0) {
      stepsEmpty.style.display = '';
      return;
    }

    steps.forEach((step, i) => {
      const card = document.createElement('div');
      card.className = 'cb-step-card';
      const critical = step.critical
        ? `<span class="badge" style="background:rgba(248,113,113,0.2);color:#f87171;font-size:0.65rem;">CRITICAL</span>`
        : '';
      card.innerHTML = `
        <div class="d-flex align-items-start gap-3">
          <span class="cb-step-num">${i + 1}</span>
          <div class="flex-grow-1">
            <div class="d-flex align-items-center gap-2 mb-1">
              <span class="text-muted small fw-semibold text-uppercase ls-wide" style="font-size:0.65rem;">Action</span>
              ${critical}
            </div>
            <p class="mb-2 small">${escapeHtml(step.action || '—')}</p>
            <div class="text-muted small fw-semibold text-uppercase ls-wide mb-1" style="font-size:0.65rem;">Expected Result</div>
            <p class="mb-0 small">${escapeHtml(step.expected_result || '—')}</p>
          </div>
        </div>`;

      viewContent.appendChild(card);
    });

    anime({
      targets: '#stepsViewContent .cb-step-card',
      opacity: [0, 1],
      translateY: [8, 0],
      delay: anime.stagger(50),
      duration: 250,
      easing: 'easeOutCubic',
    });
  }

  /** Parse steps from Codebeamer field response */
  function parseStepsFromField(field) {
    if (!field || !field.value) return [];
    const rows = field.value.rows || [];
    return rows.map(row => {
      const cells = row.cells || [];
      const getCell = (id) => cells.find(c => c.fieldId === id)?.value;
      return {
        action:          getCell(1000001) || '',
        expected_result: getCell(1000002) || '',
        critical:        !!getCell(1000003),
        uuid:            getCell(1000004) || '',
      };
    });
  }

  /* ── helpers ─────────────────────────────────────────────── */
  function show(id, animClass) {
    const el = document.getElementById(id);
    el.style.display = '';
    if (animClass) {
      el.classList.remove(animClass);
      void el.offsetWidth; // reflow
      el.classList.add(animClass);
    }
  }

  function hide(id) {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  }

  function getCurrentParentId() { return _currentParentId; }
  function getCurrentTc()       { return _currentTc; }

  return { showParentItem, showTestcase, refreshChildren, getCurrentParentId, getCurrentTc, renderTestcaseEditor };
})();

/* ================================================================
   RENDER API LOGS
   ================================================================ */
/** renderApiLogs — public alias to Log module */
function renderApiLogs(type, message, detail) {
  switch (type) {
    case 'info':    Log.info(message, detail);    break;
    case 'success': Log.success(message, detail); break;
    case 'error':   Log.error(message, detail);   break;
    case 'warn':    Log.warn(message, detail);     break;
    default:        Log.info(message, detail);
  }
}

/* ================================================================
   UTILITIES
   ================================================================ */
function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function generateUUID() {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = (crypto.getRandomValues(new Uint8Array(1))[0] & 0xff) % 16;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

/* ================================================================
   APP INIT
   ================================================================ */
const App = (() => {

  function init() {
    bindNavbar();
    bindSidebar();
    bindConfig();
    bindLogPanel();
    bindEditor();
    bindTheme();

    // Initial tree load
    Tree.renderProjectTree();

    // Check if config exists
    const cfg = Config.get();
    if (cfg.baseUrl) {
      TreeState.useMock = false;
      Log.info(`Connected to: ${cfg.baseUrl}`);
    } else {
      Log.warn('No API configuration. Using demo data. Click ⚙ to configure.');
      Toast.show('info', 'Running in demo mode. Configure API for live data.', 5000);
    }
  }

  /* ── Navbar ──────────────────────────────────────────────── */
  function bindNavbar() {
    document.getElementById('btnConfig').addEventListener('click', openConfigModal);
    document.getElementById('btnConfigFromEmpty').addEventListener('click', openConfigModal);
    document.getElementById('btnRefreshTree').addEventListener('click', () => {
      Tree.renderProjectTree();
      Toast.show('info', 'Tree refreshed.');
    });

    // Global search filter
    document.getElementById('globalSearch').addEventListener('input', e => {
      Tree.filter(e.target.value);
    });
    document.getElementById('sidebarSearch').addEventListener('input', e => {
      Tree.filter(e.target.value);
    });
  }

  /* ── Sidebar ─────────────────────────────────────────────── */
  function bindSidebar() {
    // mobile: sidebar toggle via navbar (future: add hamburger)
  }

  /* ── Config modal ────────────────────────────────────────── */
  function openConfigModal() {
    const cfg = Config.get();
    document.getElementById('cfgBaseUrl').value   = cfg.baseUrl   || '';
    document.getElementById('cfgUsername').value  = cfg.username  || '';
    document.getElementById('cfgPassword').value  = cfg.password  || '';
    new bootstrap.Modal(document.getElementById('configModal')).show();
  }

  function bindConfig() {
    document.getElementById('btnSaveConfig').addEventListener('click', () => {
      const baseUrl  = document.getElementById('cfgBaseUrl').value.trim();
      const username = document.getElementById('cfgUsername').value.trim();
      const password = document.getElementById('cfgPassword').value;

      if (!baseUrl) {
        animateError(document.getElementById('cfgBaseUrl'));
        Toast.show('warn', 'Base URL is required.');
        return;
      }

      Config.save({ baseUrl, username, password });
      TreeState.useMock = false;

      bootstrap.Modal.getInstance(document.getElementById('configModal'))?.hide();
      Log.info(`API configured: ${baseUrl}`);
      Toast.show('success', 'Configuration saved. Refreshing tree…');
      Tree.renderProjectTree();
    });
  }

  /* ── Log panel ───────────────────────────────────────────── */
  function bindLogPanel() {
    document.getElementById('btnLogToggle').addEventListener('click', () => {
      const panel = document.getElementById('logPanel');
      panel.classList.toggle('collapsed');
    });
    document.getElementById('btnClearLog').addEventListener('click', Log.clear);
    document.getElementById('btnCopyLog').addEventListener('click', Log.copyAll);
  }

  /* ── Editor bindings ─────────────────────────────────────── */
  function bindEditor() {
    document.getElementById('btnAddStep').addEventListener('click', () => Editor.addStep());
    document.getElementById('btnSaveTestcase').addEventListener('click', () => Editor.save());

    // Create testcase from parent item panel
    document.getElementById('btnCreateTestcase').addEventListener('click', () => {
      const parentId   = Content.getCurrentParentId();
      const parentName = document.getElementById('parentItemName').textContent;
      if (!parentId) return;
      Editor.openCreate(parentId, parentName);
    });

    // Edit testcase
    document.getElementById('btnEditTestcase').addEventListener('click', () => {
      const tc = Content.getCurrentTc();
      if (!tc) return;
      // Load full data from mock/API to populate steps
      loadTcForEdit(tc);
    });
  }

  async function loadTcForEdit(tc) {
    let full = tc;
    if (TreeState.useMock) {
      for (const bucket of Object.values(MockData.testcases)) {
        const found = bucket.find(t => t.id === tc.id);
        if (found) { full = found; break; }
      }
    } else {
      try {
        const fields = await Api.getItemFields(tc.id);
        const stepsField = (fields || []).find(f => f.fieldId === 1000000);
        const steps = stepsField ? parseStepsFromField(stepsField) : [];
        full = { ...tc, steps };
      } catch (err) {
        Log.error('Failed to load testcase for editing', err.message);
        Toast.show('error', 'Failed to load testcase data.');
        return;
      }
    }
    Editor.openEdit(full);
  }

  /* ── This is a local helper since parseStepsFromField is scoped in Content ── */
  function parseStepsFromField(field) {
    if (!field || !field.value) return [];
    const rows = field.value.rows || [];
    return rows.map(row => {
      const cells = row.cells || [];
      const getCell = (id) => cells.find(c => c.fieldId === id)?.value;
      return {
        action:          getCell(1000001) || '',
        expected_result: getCell(1000002) || '',
        critical:        !!getCell(1000003),
        uuid:            getCell(1000004) || '',
      };
    });
  }

  /* ── Theme toggle ────────────────────────────────────────── */
  function bindTheme() {
    const saved = localStorage.getItem('cb_theme') || 'dark';
    applyTheme(saved);

    document.getElementById('btnThemeToggle').addEventListener('click', () => {
      const current = document.documentElement.getAttribute('data-bs-theme');
      const next = current === 'dark' ? 'light' : 'dark';
      applyTheme(next);
      localStorage.setItem('cb_theme', next);

      anime({
        targets: 'body',
        opacity: [0.7, 1],
        duration: 300,
        easing: 'easeOutCubic',
      });
    });
  }

  function applyTheme(theme) {
    document.documentElement.setAttribute('data-bs-theme', theme);
    const icon = document.getElementById('themeIcon');
    icon.className = theme === 'dark' ? 'bi bi-moon-stars-fill' : 'bi bi-sun-fill';
  }

  return { init };
})();

/* ── Bootstrap ── */
document.addEventListener('DOMContentLoaded', () => App.init());
