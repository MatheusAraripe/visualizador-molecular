import * as THREE from "three";

// Estado
let isAngleModeActive = false;
let selectedAtomsForAngle = [];
let isDihedralModeActive = false;
let selectedAtomsForDihedral = [];
let isDistanceModeActive = false;
let selectedAtomsForDistance = [];

// Objetos Three.js
let camera,
  renderer,
  controls,
  moleculeGroup,
  angleHelpersGroup,
  raycaster,
  mouse;

// Elementos do DOM
let logContainerElement, instructionsElement;

const HIGHLIGHT_COLORS = { end_point: 0xace1af, vertex: 0xef9c66 };
const LOCAL_STORAGE_KEY = "moleculeViewerMeasurements";
const MAX_LOG_ENTRIES = 15;

// --- Manipuladores de Eventos ---
const handleKeyDown = (event) => {
  const key = event.key.toLowerCase();
  if (key === "a") toggleAngleMode();
  if (key === "d") toggleDihedralMode();
  if (key === "s") toggleDistanceMode();
};

const onMouseDown = (event) => {
  if (
    (!isAngleModeActive && !isDihedralModeActive && !isDistanceModeActive) ||
    !moleculeGroup
  )
    return;
  const rect = renderer.domElement.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;
  mouse.x = (x / rect.width) * 2 - 1;
  mouse.y = -(y / rect.height) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry?.type === "SphereGeometry")
  );
  if (intersects.length > 0) {
    if (isAngleModeActive) {
      handleAngleAtomSelection(intersects[0].object);
    } else if (isDihedralModeActive) {
      handleDihedralAtomSelection(intersects[0].object);
    } else if (isDistanceModeActive) {
      handleDistanceAtomSelection(intersects[0].object);
    }
  }
};

// --- Ativação/Desativação de Modos ---
const toggleAngleMode = () => {
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
  isAngleModeActive = !isAngleModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (!angleDisplay) return;
  if (isAngleModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    const titleElement = angleDisplay.querySelector("#measurement-title");
    if (titleElement) titleElement.innerText = "Ângulo";
    updateAngleInstructions();
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearAngleSelection();
  }
};

const toggleDihedralMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDistanceModeActive) toggleDistanceMode();
  isDihedralModeActive = !isDihedralModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (!angleDisplay) return;
  if (isDihedralModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    const titleElement = angleDisplay.querySelector("#measurement-title");
    if (titleElement) titleElement.innerText = "Diedro";
    updateDihedralInstructions();
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearDihedralSelection();
  }
};

const toggleDistanceMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  isDistanceModeActive = !isDistanceModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (!angleDisplay) return;
  if (isDistanceModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    const titleElement = angleDisplay.querySelector("#measurement-title");
    if (titleElement) titleElement.innerText = "Distância";
    updateDistanceInstructions();
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearDistanceSelection();
  }
};

const resetMeasurementModes = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
};

// --- Lógica de Ângulo Convencional ---
const handleAngleAtomSelection = (clickedAtom) => {
  const index = selectedAtomsForAngle.findIndex(
    (item) => item.atom === clickedAtom
  );
  if (index !== -1) deselectAtomForAngle(index);
  else if (selectedAtomsForAngle.length < 3) selectAtomForAngle(clickedAtom);
};
const selectAtomForAngle = (atom) => {
  const originalMaterial = atom.material;
  selectedAtomsForAngle.push({ atom, originalMaterial });
  applyAngleHighlights();
  updateAngleInstructions();
  if (selectedAtomsForAngle.length === 3) calculateAndDisplayAngle();
};
const deselectAtomForAngle = (index) => {
  clearAngleHighlights();
  selectedAtomsForAngle.splice(index, 1);
  applyAngleHighlights();
  clearAngleHelpers();
  updateAngleInstructions();
};
const clearAngleSelection = () => {
  clearAngleHighlights();
  selectedAtomsForAngle = [];
  clearAngleHelpers();
};
const clearAngleHighlights = () => {
  selectedAtomsForAngle.forEach(({ atom, originalMaterial }) => {
    if (atom) atom.material = originalMaterial;
  });
};
const applyAngleHighlights = () => {
  selectedAtomsForAngle.forEach(({ atom, originalMaterial }, index) => {
    if (!atom || !originalMaterial) return;
    const highlightMaterial = originalMaterial.clone();
    highlightMaterial.color.setHex(
      index === 1 ? HIGHLIGHT_COLORS.vertex : HIGHLIGHT_COLORS.end_point
    );
    atom.material = highlightMaterial;
  });
};
const updateAngleInstructions = () => {
  const instructions = document.getElementById("angle-instructions");
  if (!instructions) return;
  const count = selectedAtomsForAngle.length;
  instructions.innerText =
    count < 3 ? `Selecione ${3 - count} átomo(s).` : `Ângulo calculado.`;
};
const calculateAndDisplayAngle = () => {
  clearAngleHelpers();
  if (selectedAtomsForAngle.length < 3) return;
  const atoms = selectedAtomsForAngle
    .map((item) => item.atom?.position)
    .filter(Boolean);
  if (atoms.length < 3) return;
  const [atomA, atomB, atomC] = atoms;
  const v1 = new THREE.Vector3().subVectors(atomA, atomB);
  const v2 = new THREE.Vector3().subVectors(atomC, atomB);
  const angleDeg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = `${angleDeg.toFixed(2)}°`;
};

// --- Lógica de Ângulo de Diedro ---
const handleDihedralAtomSelection = (clickedAtom) => {
  const index = selectedAtomsForDihedral.findIndex(
    (item) => item.atom === clickedAtom
  );
  if (index !== -1) deselectAtomForDihedral(index);
  else if (selectedAtomsForDihedral.length < 4)
    selectAtomForDihedral(clickedAtom);
};
const selectAtomForDihedral = (atom) => {
  const originalMaterial = atom.material;
  selectedAtomsForDihedral.push({ atom, originalMaterial });
  applyDihedralHighlights();
  updateDihedralInstructions();
  if (selectedAtomsForDihedral.length === 4) calculateAndDisplayDihedral();
};
const deselectAtomForDihedral = (index) => {
  clearDihedralHighlights();
  selectedAtomsForDihedral.splice(index, 1);
  applyDihedralHighlights();
  clearAngleHelpers();
  updateDihedralInstructions();
};
const clearDihedralSelection = () => {
  clearDihedralHighlights();
  selectedAtomsForDihedral = [];
  clearAngleHelpers();
};
const clearDihedralHighlights = () => {
  selectedAtomsForDihedral.forEach(({ atom, originalMaterial }) => {
    if (atom) atom.material = originalMaterial;
  });
};
const applyDihedralHighlights = () => {
  selectedAtomsForDihedral.forEach(({ atom, originalMaterial }, index) => {
    if (!atom || !originalMaterial) return;
    const highlightMaterial = originalMaterial.clone();
    highlightMaterial.color.setHex(
      index === 1 || index === 2
        ? HIGHLIGHT_COLORS.vertex
        : HIGHLIGHT_COLORS.end_point
    );
    atom.material = highlightMaterial;
  });
};
const updateDihedralInstructions = () => {
  const instructions = document.getElementById("angle-instructions");
  if (!instructions) return;
  const count = selectedAtomsForDihedral.length;
  instructions.innerText =
    count < 4 ? `Selecione ${4 - count} átomo(s).` : `Diedro calculado.`;
};
const calculateAndDisplayDihedral = () => {
  clearAngleHelpers();
  if (selectedAtomsForDihedral.length < 4) return;
  const atoms = selectedAtomsForDihedral
    .map((item) => item.atom?.position)
    .filter(Boolean);
  if (atoms.length < 4) return;
  const [p1, p2, p3, p4] = atoms;
  const v1 = new THREE.Vector3().subVectors(p2, p1);
  const v2 = new THREE.Vector3().subVectors(p3, p2);
  const v3 = new THREE.Vector3().subVectors(p4, p3);
  const n1 = new THREE.Vector3().crossVectors(v1, v2);
  const n2 = new THREE.Vector3().crossVectors(v2, v3);
  let angleRad = n1.angleTo(n2);
  if (n1.dot(v3) < 0) {
    angleRad = -angleRad;
  }
  const angleDeg = THREE.MathUtils.radToDeg(angleRad);
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = `${angleDeg.toFixed(2)}°`;
};

// --- Lógica de Distância ---
const handleDistanceAtomSelection = (clickedAtom) => {
  const index = selectedAtomsForDistance.findIndex(
    (item) => item.atom === clickedAtom
  );
  if (index !== -1) deselectAtomForDistance(index);
  else if (selectedAtomsForDistance.length < 2)
    selectAtomForDistance(clickedAtom);
};
const selectAtomForDistance = (atom) => {
  const originalMaterial = atom.material;
  selectedAtomsForDistance.push({ atom, originalMaterial });
  applyDistanceHighlights();
  updateDistanceInstructions();
  if (selectedAtomsForDistance.length === 2) calculateAndDisplayDistance();
};
const deselectAtomForDistance = (index) => {
  clearDistanceHighlights();
  selectedAtomsForDistance.splice(index, 1);
  applyDistanceHighlights();
  clearAngleHelpers();
  updateDistanceInstructions();
};
const clearDistanceSelection = () => {
  clearDistanceHighlights();
  selectedAtomsForDistance = [];
  clearAngleHelpers();
};
const clearDistanceHighlights = () => {
  selectedAtomsForDistance.forEach(({ atom, originalMaterial }) => {
    if (atom) atom.material = originalMaterial;
  });
};
const applyDistanceHighlights = () => {
  selectedAtomsForDistance.forEach(({ atom, originalMaterial }) => {
    if (!atom || !originalMaterial) return;
    const highlightMaterial = originalMaterial.clone();
    highlightMaterial.color.setHex(HIGHLIGHT_COLORS.end_point);
    atom.material = highlightMaterial;
  });
};
const updateDistanceInstructions = () => {
  const instructions = document.getElementById("angle-instructions");
  if (!instructions) return;
  const count = selectedAtomsForDistance.length;
  instructions.innerText =
    count < 2 ? `Selecione ${2 - count} átomo(s).` : `Distância calculada.`;
};
const calculateAndDisplayDistance = () => {
  clearAngleHelpers();
  if (selectedAtomsForDistance.length < 2) return;
  const atomsPos = selectedAtomsForDistance
    .map((item) => item.atom?.position)
    .filter(Boolean);
  if (atomsPos.length < 2) return;
  const [posA, posB] = atomsPos;
  const distance = posA.distanceTo(posB);
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = `${distance.toFixed(3)} Å`;
};

// --- Função Comum ---
const clearAngleHelpers = () => {
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = "";
  // Não mexe mais no angleHelpersGroup por enquanto
};

// --- Função Principal de Exportação ---
export const initializeMeasurementTools = (three_objects) => {
  camera = three_objects.camera;
  renderer = three_objects.renderer;
  controls = three_objects.controls;
  moleculeGroup = three_objects.moleculeGroup;
  angleHelpersGroup = three_objects.angleHelpersGroup;
  raycaster = three_objects.raycaster;
  mouse = three_objects.mouse;

  // Configura os eventos
  window.addEventListener("keydown", handleKeyDown);
  renderer.domElement.addEventListener("mousedown", onMouseDown);

  return { resetMeasurementModes };
};
