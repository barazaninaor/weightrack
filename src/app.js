import {
  getFirestore,
  doc,
  getDoc,
  collection,
  addDoc,
  deleteDoc,
  updateDoc,
  query,
  orderBy,
  onSnapshot,
} from "firebase/firestore";
import { updatePassword } from "firebase/auth";

let db;
let currentUser = null;
let weightEntries = [];
let chartInstance = null;
let entryIdToDelete = null;

function formatDateToDisplay(dateString) {
  if (!dateString) return "";
  const parts = dateString.split("-");
  if (parts.length === 3) {
    const [year, month, day] = parts;
    return `${day}/${month}/${year}`;
  }
  return dateString;
}

export function initApp(appInstance, user) {
  db = getFirestore(appInstance);
  currentUser = user;

  const dateInput = document.getElementById("weight-date");
  if (dateInput) {
    dateInput.value = new Date().toISOString().split("T")[0];
  }

  const cachedData = localStorage.getItem(`weights_${currentUser.uid}`);
  if (cachedData) {
    try {
      weightEntries = JSON.parse(cachedData);
      updateDashboard();
      renderTable(weightEntries);
      renderChart(weightEntries);
    } catch (e) {
      console.error("Error parsing cached weights", e);
    }
  }

  loadUserProfile();
  listenToWeightEntries();
  setupEventListeners();
}

async function loadUserProfile() {
  try {
    const userDocRef = doc(db, "users", currentUser.uid);
    const userSnap = await getDoc(userDocRef);

    if (userSnap.exists()) {
      const data = userSnap.data();

      currentUser.firstName = data.firstName || "";
      currentUser.lastName = data.lastName || "";
      currentUser.email = data.email || currentUser.email;
      currentUser.dob = data.dob || "";
      currentUser.targetWeight = data.targetWeight || null;

      const greetingEl = document.getElementById("user-greeting");
      if (greetingEl) {
        greetingEl.textContent = `Welcome back, ${currentUser.firstName || currentUser.email}!`;
      }

      const desiredWeightEl = document.getElementById("dash-desired-weight");
      if (desiredWeightEl) {
        desiredWeightEl.textContent = currentUser.targetWeight
          ? `${currentUser.targetWeight} kg`
          : "-- kg";
      }

      if (weightEntries.length > 0) {
        renderChart(weightEntries);
      }
    }
  } catch (error) {
    console.error("Error loading user profile:", error);
  }
}

function listenToWeightEntries() {
  const weightsRef = collection(db, "users", currentUser.uid, "weights");
  const q = query(weightsRef, orderBy("date", "asc"));

  onSnapshot(q, (snapshot) => {
    const newEntries = snapshot.docs.map((docSnap) => ({
      id: docSnap.id,
      ...docSnap.data(),
    }));

    weightEntries = newEntries;
    localStorage.setItem(
      `weights_${currentUser.uid}`,
      JSON.stringify(weightEntries),
    );

    updateDashboard();
    renderTable(weightEntries);
    renderChart(weightEntries);
  });
}

function updateDashboard() {
  const dashCurrent = document.getElementById("dash-current-weight");
  const dashProgress = document.getElementById("dash-progress");
  const dashAverage = document.getElementById("dash-average-weight");
  const dashMin = document.getElementById("dash-min-weight");
  const dashMax = document.getElementById("dash-max-weight");

  if (weightEntries.length === 0) {
    if (dashCurrent) dashCurrent.textContent = "-- kg";
    if (dashProgress) dashProgress.textContent = "% --";
    if (dashAverage) dashAverage.textContent = "-- kg";
    if (dashMin) dashMin.textContent = "-- kg";
    if (dashMax) dashMax.textContent = "-- kg";
    return;
  }

  const latestEntry = weightEntries[weightEntries.length - 1];
  const currentWeight = latestEntry.weight;
  if (dashCurrent) {
    dashCurrent.textContent = `${currentWeight} kg`;
  }

  if (currentUser?.targetWeight && dashProgress) {
    const target = Number(currentUser.targetWeight);
    const diffPercentage = (((currentWeight - target) / target) * 100).toFixed(
      2,
    );
    const prefix = diffPercentage > 0 ? "+" : "";
    dashProgress.textContent = `${prefix}${diffPercentage}%`;
  }

  const totalWeight = weightEntries.reduce(
    (sum, entry) => sum + entry.weight,
    0,
  );
  const avgWeight = (totalWeight / weightEntries.length).toFixed(1);
  if (dashAverage) {
    dashAverage.textContent = `${avgWeight} kg`;
  }

  // חישוב משקל מינימלי ומקסימלי מתוך כלל הרשומות
  const weightsArray = weightEntries.map((e) => e.weight);
  const minWeight = Math.min(...weightsArray);
  const maxWeight = Math.max(...weightsArray);

  if (dashMin) {
    dashMin.textContent = `${minWeight} kg`;
  }
  if (dashMax) {
    dashMax.textContent = `${maxWeight} kg`;
  }
}

function renderTable(entries) {
  const tbody = document.getElementById("weight-table-body");
  if (!tbody) return;

  tbody.innerHTML = "";
  const reversed = [...entries].reverse();

  reversed.forEach((entry) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td>${formatDateToDisplay(entry.date)}</td>
      <td>${entry.weight}</td>
      <td class="action-cells">
        <button class="btn-edit" data-id="${entry.id}" data-date="${entry.date}" data-weight="${entry.weight}">Edit</button>
        <button class="btn-delete" data-id="${entry.id}">Delete</button>
      </td>
    `;
    tbody.appendChild(tr);
  });

  tbody.querySelectorAll(".btn-delete").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      entryIdToDelete = e.currentTarget.getAttribute("data-id");
      const modal = document.getElementById("modal-confirm-delete");
      if (modal) {
        modal.classList.remove("hidden");
      }
    });
  });

  tbody.querySelectorAll(".btn-edit").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      const button = e.currentTarget;
      const entryId = button.getAttribute("data-id");
      const currentDate = button.getAttribute("data-date");
      const currentWeight = button.getAttribute("data-weight");

      const modal = document.getElementById("modal-edit-weight");
      const idInput = document.getElementById("edit-weight-id");
      const dateInput = document.getElementById("edit-weight-date");
      const weightInput = document.getElementById("edit-weight-input");

      if (idInput) idInput.value = entryId;
      if (dateInput) dateInput.value = currentDate;
      if (weightInput) weightInput.value = currentWeight;

      if (modal) {
        modal.classList.remove("hidden");
      }
    });
  });
}

function renderChart(entries) {
  const chartCanvas = document.getElementById("weightChart");
  if (!chartCanvas || typeof Chart === "undefined") return;

  const ctx = chartCanvas.getContext("2d");
  const labels = entries.map((e) => formatDateToDisplay(e.date));
  const dataPoints = entries.map((e) => e.weight);

  if (chartInstance) {
    chartInstance.destroy();
  }

  const isLargeDataset = entries.length > 50;
  const datasets = [];

  datasets.push({
    label: "Weight (kg)",
    data: dataPoints,
    borderColor: "#38a6f0",
    borderWidth: 2,
    backgroundColor: "rgba(56, 166, 240, 0.08)",
    fill: true,
    tension: 0.1,
    pointRadius: isLargeDataset ? 0 : 3,
    pointHoverRadius: 6,
    pointBackgroundColor: "#38a6f0",
    pointHoverBackgroundColor: "#38a6f0",
    shadowColor: "rgba(56, 166, 240, 0.8)",
    shadowBlur: 10,
  });

  if (currentUser?.targetWeight && entries.length > 0) {
    const targetValue = Number(currentUser.targetWeight);
    const targetData = new Array(entries.length).fill(targetValue);

    datasets.push({
      label: "Goal",
      data: targetData,
      borderColor: "#38a6f0",
      borderWidth: 2,
      fill: false,
      pointRadius: 0,
      pointHoverRadius: 0,
      shadowColor: "rgba(56, 166, 240, 0.9)",
      shadowBlur: 8,
    });
  }

  const glowPlugin = {
    id: "glowPlugin",
    beforeDatasetDraw(chart, args) {
      const { ctx } = chart;
      const dataset = chart.data.datasets[args.index];
      if (dataset.shadowColor) {
        ctx.save();
        ctx.shadowColor = dataset.shadowColor;
        ctx.shadowBlur = dataset.shadowBlur || 10;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;
      }
    },
    afterDatasetDraw(chart) {
      chart.ctx.restore();
    },
  };

  chartInstance = new Chart(ctx, {
    type: "line",
    data: {
      labels: labels,
      datasets: datasets,
    },
    plugins: [glowPlugin],
    options: {
      responsive: true,
      maintainAspectRatio: false,
      interaction: {
        mode: "index",
        intersect: false,
      },
      scales: {
        x: {
          grid: { color: "#1e293b" },
          ticks: {
            color: "#9ca3af",
            maxRotation: 45,
            minRotation: 0,
            maxTicksLimit: 12,
          },
        },
        y: {
          grid: { color: "#1e293b" },
          ticks: { color: "#9ca3af" },
        },
      },
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: "#1e293b",
          titleColor: "#f3f4f6",
          bodyColor: "#38a6f0",
          borderColor: "#374151",
          borderWidth: 1,
        },
      },
    },
  });
}

function filterChartRange(range) {
  if (weightEntries.length === 0) return;

  const now = new Date();
  let startDate;

  if (range === "1m") {
    startDate = new Date();
    startDate.setMonth(now.getMonth() - 1);
  } else if (range === "ytd") {
    startDate = new Date(now.getFullYear(), 0, 1);
  } else if (range === "1y") {
    startDate = new Date();
    startDate.setFullYear(now.getFullYear() - 1);
  } else {
    renderChart(weightEntries);
    return;
  }

  const filtered = weightEntries.filter(
    (entry) => new Date(entry.date) >= startDate,
  );
  renderChart(filtered);
}

function setupEventListeners() {
  const formAdd = document.getElementById("form-add-weight");
  if (formAdd) {
    formAdd.addEventListener("submit", async (e) => {
      e.preventDefault();
      const date = document.getElementById("weight-date").value;
      const weight = parseFloat(document.getElementById("weight-input").value);

      if (!date || isNaN(weight)) return;

      try {
        await addDoc(collection(db, "users", currentUser.uid, "weights"), {
          date,
          weight,
          createdAt: new Date(),
        });
        document.getElementById("weight-input").value = "";
      } catch (error) {
        console.error("Error adding weight:", error);
      }
    });
  }

  // מודל אישור מחיקה
  const modalConfirmDelete = document.getElementById("modal-confirm-delete");
  const btnCancelDelete = document.getElementById("btn-cancel-delete");
  const btnConfirmDelete = document.getElementById("btn-confirm-delete");

  if (btnCancelDelete) {
    btnCancelDelete.addEventListener("click", () => {
      if (modalConfirmDelete) modalConfirmDelete.classList.add("hidden");
      entryIdToDelete = null;
    });
  }

  if (modalConfirmDelete) {
    modalConfirmDelete.addEventListener("click", (e) => {
      if (e.target === modalConfirmDelete) {
        modalConfirmDelete.classList.add("hidden");
        entryIdToDelete = null;
      }
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener("click", async () => {
      if (!entryIdToDelete) return;

      try {
        await deleteDoc(
          doc(db, "users", currentUser.uid, "weights", entryIdToDelete),
        );
        if (modalConfirmDelete) modalConfirmDelete.classList.add("hidden");
      } catch (err) {
        console.error("Error deleting document:", err);
      } finally {
        entryIdToDelete = null;
      }
    });
  }

  const modalEditWeight = document.getElementById("modal-edit-weight");
  const btnCancelEditWeight = document.getElementById("btn-cancel-edit-weight");
  const formEditWeight = document.getElementById("form-edit-weight");

  if (btnCancelEditWeight) {
    btnCancelEditWeight.addEventListener("click", () => {
      if (modalEditWeight) modalEditWeight.classList.add("hidden");
    });
  }

  if (modalEditWeight) {
    modalEditWeight.addEventListener("click", (e) => {
      if (e.target === modalEditWeight) {
        modalEditWeight.classList.add("hidden");
      }
    });
  }

  if (formEditWeight) {
    formEditWeight.addEventListener("submit", async (e) => {
      e.preventDefault();
      const entryId = document.getElementById("edit-weight-id")?.value;
      const newDate = document.getElementById("edit-weight-date")?.value;
      const newWeight = parseFloat(
        document.getElementById("edit-weight-input")?.value,
      );

      if (!entryId || !newDate || isNaN(newWeight)) return;

      try {
        const weightDocRef = doc(
          db,
          "users",
          currentUser.uid,
          "weights",
          entryId,
        );

        await updateDoc(weightDocRef, {
          date: newDate,
          weight: newWeight,
        });

        if (modalEditWeight) modalEditWeight.classList.add("hidden");
      } catch (error) {
        console.error("Error updating weight entry:", error);
      }
    });
  }

  const btnApplyFilter = document.getElementById("btn-apply-filter");
  if (btnApplyFilter) {
    btnApplyFilter.addEventListener("click", () => {
      const start = document.getElementById("filter-start-date").value;
      const end = document.getElementById("filter-end-date").value;

      let filtered = weightEntries;
      if (start) filtered = filtered.filter((e) => e.date >= start);
      if (end) filtered = filtered.filter((e) => e.date <= end);

      renderTable(filtered);
    });
  }

  const btnResetFilter = document.getElementById("btn-reset-filter");
  if (btnResetFilter) {
    btnResetFilter.addEventListener("click", () => {
      document.getElementById("filter-start-date").value = "";
      document.getElementById("filter-end-date").value = "";
      renderTable(weightEntries);
    });
  }

  document.querySelectorAll(".btn-filter-chart").forEach((btn) => {
    btn.addEventListener("click", (e) => {
      document
        .querySelectorAll(".btn-filter-chart")
        .forEach((b) => b.classList.remove("active"));
      e.target.classList.add("active");

      const range = e.target.getAttribute("data-range");
      filterChartRange(range);
    });
  });

  const modalEdit = document.getElementById("modal-edit-profile");
  const btnEditProfile = document.getElementById("btn-edit-profile");
  const btnCancelEdit = document.getElementById("btn-cancel-edit");
  const formEditProfile = document.getElementById("form-edit-profile");

  if (btnEditProfile) {
    btnEditProfile.addEventListener("click", () => {
      document.getElementById("edit-first-name").value =
        currentUser.firstName || "";
      document.getElementById("edit-last-name").value =
        currentUser.lastName || "";
      document.getElementById("edit-email").value = currentUser.email || "";
      document.getElementById("edit-dob").value = currentUser.dob || "";
      document.getElementById("edit-target-weight").value =
        currentUser.targetWeight || "";

      const passInput = document.getElementById("edit-password");
      if (passInput) passInput.value = "";

      if (modalEdit) {
        modalEdit.classList.remove("hidden");
      }
    });
  }

  if (btnCancelEdit) {
    btnCancelEdit.addEventListener("click", () => {
      if (modalEdit) {
        modalEdit.classList.add("hidden");
      }
    });
  }

  if (modalEdit) {
    modalEdit.addEventListener("click", (e) => {
      if (e.target === modalEdit) {
        modalEdit.classList.add("hidden");
      }
    });
  }

  if (formEditProfile) {
    formEditProfile.addEventListener("submit", async (e) => {
      e.preventDefault();

      const updatedData = {
        firstName: document.getElementById("edit-first-name").value.trim(),
        lastName: document.getElementById("edit-last-name").value.trim(),
        email: document.getElementById("edit-email").value.trim(),
        dob: document.getElementById("edit-dob").value,
        targetWeight: parseFloat(
          document.getElementById("edit-target-weight").value,
        ),
      };

      const newPassword = document
        .getElementById("edit-password")
        ?.value.trim();

      try {
        const userDocRef = doc(db, "users", currentUser.uid);
        await updateDoc(userDocRef, updatedData);

        if (newPassword) {
          await updatePassword(currentUser, newPassword);
        }

        await loadUserProfile();
        updateDashboard();

        if (modalEdit) {
          modalEdit.classList.add("hidden");
        }
      } catch (error) {
        console.error("Error updating profile:", error);
      }
    });
  }
}
