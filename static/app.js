"use strict";

const form = document.getElementById("tc-form");
const stepsContainer = document.getElementById("steps-container");
const numStepsInput = document.getElementById("num_steps");
const btnGenerate = document.getElementById("btn-generate-steps");
const btnReset = document.getElementById("btn-reset");
const btnSubmit = document.getElementById("btn-submit");
const submitSpinner = document.getElementById("submit-spinner");
const submitLabel = document.getElementById("submit-label");

const successCard = document.getElementById("result-success");
const errorCard = document.getElementById("result-error");

function buildStepRow(index) {
  const wrapper = document.createElement("div");
  wrapper.className = "step-row";
  wrapper.dataset.index = String(index);
  wrapper.innerHTML = `
    <div class="step-index">Step ${index + 1}</div>
    <div class="row g-3">
      <div class="col-md-6">
        <label class="form-label">Action</label>
        <textarea class="form-control step-action" rows="2" required></textarea>
      </div>
      <div class="col-md-6">
        <label class="form-label">Expected Result</label>
        <textarea class="form-control step-expected" rows="2" required></textarea>
      </div>
      <div class="col-12">
        <div class="form-check">
          <input type="checkbox" class="form-check-input step-critical" id="critical-${index}" />
          <label class="form-check-label" for="critical-${index}">Critical</label>
        </div>
      </div>
    </div>
  `;
  return wrapper;
}

function generateSteps() {
  const n = Math.max(1, Math.min(100, parseInt(numStepsInput.value, 10) || 1));
  stepsContainer.innerHTML = "";
  const fragment = document.createDocumentFragment();
  for (let i = 0; i < n; i++) {
    fragment.appendChild(buildStepRow(i));
  }
  stepsContainer.appendChild(fragment);

  // Optional anime.js entrance animation
  if (window.anime) {
    anime({
      targets: "#steps-container .step-row",
      opacity: [0, 1],
      translateY: [10, 0],
      delay: anime.stagger(40),
      duration: 250,
      easing: "easeOutQuad",
    });
  }
}

function collectSteps() {
  const rows = stepsContainer.querySelectorAll(".step-row");
  const steps = [];
  rows.forEach((row) => {
    steps.push({
      action: row.querySelector(".step-action").value.trim(),
      expected_result: row.querySelector(".step-expected").value.trim(),
      critical: row.querySelector(".step-critical").checked,
    });
  });
  return steps;
}

function setLoading(loading) {
  btnSubmit.disabled = loading;
  btnGenerate.disabled = loading;
  btnReset.disabled = loading;
  submitSpinner.classList.toggle("d-none", !loading);
  submitLabel.textContent = loading ? "Creating..." : "Submit / Create Testcase";
}

function hideResults() {
  successCard.classList.add("d-none");
  errorCard.classList.add("d-none");
}

function showSuccess(data) {
  document.getElementById("res-tc-id").textContent = data.testcase_id;
  document.getElementById("res-tc-name").textContent = data.testcase_name;

  const parentLink = document.getElementById("res-parent-url");
  parentLink.href = data.parent_url;
  parentLink.textContent = data.parent_url;

  const tcLink = document.getElementById("res-tc-url");
  tcLink.href = data.testcase_url;
  tcLink.textContent = data.testcase_url;

  successCard.classList.remove("d-none");
  successCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

function showError(message) {
  document.getElementById("res-error-msg").textContent = message;
  errorCard.classList.remove("d-none");
  errorCard.scrollIntoView({ behavior: "smooth", block: "start" });
}

async function handleSubmit(event) {
  event.preventDefault();
  hideResults();

  if (!form.checkValidity()) {
    form.reportValidity();
    return;
  }

  const steps = collectSteps();
  if (steps.length === 0) {
    showError("Please generate at least one test step before submitting.");
    return;
  }

  const payload = {
    username: document.getElementById("username").value.trim(),
    password: document.getElementById("password").value,
    parent_id: parseInt(document.getElementById("parent_id").value, 10),
    testcase_name: document.getElementById("testcase_name").value.trim(),
    description: document.getElementById("description").value.trim(),
    steps: steps,
  };

  setLoading(true);
  try {
    const res = await fetch("/api/testcases/create-with-steps", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let body = null;
    try {
      body = await res.json();
    } catch (_) {
      body = null;
    }

    if (!res.ok) {
      const detail =
        (body && (body.detail || body.message)) ||
        `Request failed with status ${res.status}`;
      showError(typeof detail === "string" ? detail : JSON.stringify(detail, null, 2));
      return;
    }

    showSuccess(body);
  } catch (err) {
    showError(`Network error: ${err && err.message ? err.message : String(err)}`);
  } finally {
    setLoading(false);
  }
}

function handleReset() {
  form.reset();
  stepsContainer.innerHTML = "";
  numStepsInput.value = "1";
  hideResults();
}

btnGenerate.addEventListener("click", () => {
  hideResults();
  generateSteps();
});
btnReset.addEventListener("click", handleReset);
form.addEventListener("submit", handleSubmit);

// Generate one step row on load for convenience.
generateSteps();
