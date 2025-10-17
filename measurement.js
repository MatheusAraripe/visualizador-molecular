import * as THREE from "three";

// Variáveis de estado escopadas para este módulo
let isAngleModeActive = false;
let selectedAtomsForAngle = [];
let isDihedralModeActive = false;
let selectedAtomsForDihedral = [];

// Objetos Three.js compartilhados (serão preenchidos pelo inicializador)
let camera,
  renderer,
  controls,
  moleculeGroup,
  angleHelpersGroup,
  raycaster,
  mouse;

const HIGHLIGHT_COLORS = {
  end_point: 0xace1af, // Verde pastel
  vertex: 0xef9c66, // Laranja pastel
};

// --- Manipuladores de Eventos ---
const handleKeyDown = (event) => {
  const key = event.key.toLowerCase();
  if (key === "a") toggleAngleMode();
  if (key === "d") toggleDihedralMode();
};

// Substitua a função onMouseDown existente por esta:
const onMouseDown = (event) => {
  // Sai se nenhum modo de medição estiver ativo
  if (!isAngleModeActive && !isDihedralModeActive) return;

  // --- CORREÇÃO INICIA AQUI ---
  // Pega as dimensões e posição do canvas na tela
  const rect = renderer.domElement.getBoundingClientRect();

  // Calcula as coordenadas do mouse RELATIVAS ao canvas
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  // Normaliza as coordenadas para o espaço do Three.js [-1, 1]
  mouse.x = (x / rect.width) * 2 - 1;
  mouse.y = -(y / rect.height) * 2 + 1;
  // --- CORREÇÃO TERMINA AQUI ---

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry.type === "SphereGeometry")
  );

  if (intersects.length > 0) {
    if (isAngleModeActive) {
      handleAngleAtomSelection(intersects[0].object);
    } else if (isDihedralModeActive) {
      handleDihedralAtomSelection(intersects[0].object);
    }
  }
};

// --- Ativação de Modos ---
const toggleAngleMode = () => {
  if (isDihedralModeActive) toggleDihedralMode();
  isAngleModeActive = !isAngleModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (isAngleModeActive) {
    renderer.domElement.style.cursor = "crosshair";
    controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    angleDisplay.querySelector("h2").innerText = "Medição de Ângulo";
    updateAngleInstructions();
  } else {
    renderer.domElement.style.cursor = "grab";
    controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearAngleSelection();
  }
};

const toggleDihedralMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  isDihedralModeActive = !isDihedralModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (isDihedralModeActive) {
    renderer.domElement.style.cursor = "crosshair";
    controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    angleDisplay.querySelector("h2").innerText = "Medição de Diedro";
    updateDihedralInstructions();
  } else {
    renderer.domElement.style.cursor = "grab";
    controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearDihedralSelection();
  }
};

export const resetMeasurementModes = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
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
    atom.material = originalMaterial;
  });
};
const applyAngleHighlights = () => {
  selectedAtomsForAngle.forEach(({ atom, originalMaterial }, index) => {
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
  const [atomA, atomB, atomC] = selectedAtomsForAngle.map(
    (item) => item.atom.position
  );
  const v1 = new THREE.Vector3().subVectors(atomA, atomB);
  const v2 = new THREE.Vector3().subVectors(atomC, atomB);
  const angleDeg = THREE.MathUtils.radToDeg(v1.angleTo(v2));
  document.getElementById("angle-text").innerText = `${angleDeg.toFixed(2)}°`;
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
    atom.material = originalMaterial;
  });
};
const applyDihedralHighlights = () => {
  selectedAtomsForDihedral.forEach(({ atom, originalMaterial }, index) => {
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
  const [p1, p2, p3, p4] = selectedAtomsForDihedral.map(
    (item) => item.atom.position
  );
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
  document.getElementById("angle-text").innerText = `${angleDeg.toFixed(2)}°`;
};

// --- Função Comum ---
const clearAngleHelpers = () => {
  if (angleHelpersGroup) {
    while (angleHelpersGroup.children.length > 0)
      angleHelpersGroup.remove(angleHelpersGroup.children[0]);
  }
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = "";
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

  // Configura os eventos DENTRO do módulo
  window.addEventListener("keydown", handleKeyDown);
  renderer.domElement.addEventListener("mousedown", onMouseDown);

  return { resetMeasurementModes };
};
