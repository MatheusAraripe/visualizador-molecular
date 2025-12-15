// measurement.js
import * as THREE from "three";

// --- Variáveis de Estado ---
let isAngleModeActive = false;
let selectedAtomsForAngle = [];
let isDihedralModeActive = false;
let selectedAtomsForDihedral = [];
let isDistanceModeActive = false;
let selectedAtomsForDistance = [];
let isChargeModeActive = false;
let lastChelpgCharges = [];
let isMullikenModeActive = false;
let lastMullikenCharges = [];
let currentHoveredAtom = null;

// --- Elementos DOM ---
let camera,
  renderer,
  controls,
  moleculeGroup,
  angleHelpersGroup,
  raycaster,
  mouse;
let chargeTooltipElement;
// NOVOS ELEMENTOS
let measureCursorTooltip;
let measureResultBox;
let measureTypeLabel;
let measureTypewriterText;

const HIGHLIGHT_COLORS = {
  end_point: 0xace1af,
  vertex: 0xef9c66,
};

// ... (Funções de setChargeData e setMullikenChargeData permanecem iguais) ...
export const setChargeData = (charges) => {
  lastChelpgCharges = charges;
};
export const setMullikenChargeData = (charges) => {
  lastMullikenCharges = charges;
};

// --- Função de Animação de Digitação (Typewriter) ---
let typingTimeout; // Variável para controlar e limpar a animação anterior
const runTypewriterEffect = (text) => {
  if (!measureTypewriterText) return;

  // Limpa animação anterior se houver
  clearTimeout(typingTimeout);
  measureTypewriterText.textContent = "";
  measureResultBox.classList.remove("hidden");

  let i = 0;
  const speed = 50; // Velocidade em ms

  const type = () => {
    if (i < text.length) {
      measureTypewriterText.textContent += text.charAt(i);
      i++;
      typingTimeout = setTimeout(type, speed);
    }
  };
  type();
};

const hideMeasurementDisplays = () => {
  if (measureCursorTooltip) measureCursorTooltip.classList.add("hidden");
  if (measureResultBox) measureResultBox.classList.add("hidden");
};

// --- Manipuladores de Eventos ---
const onMouseMove = (event) => {
  // ATUALIZADO: Atualiza a posição do tooltip de medição se ele estiver visível
  if (
    measureCursorTooltip &&
    !measureCursorTooltip.classList.contains("hidden")
  ) {
    measureCursorTooltip.style.left = `${event.clientX + 20}px`;
    measureCursorTooltip.style.top = `${event.clientY + 20}px`;
  }

  // Lógica existente de Carga...
  if (
    (!isChargeModeActive && !isMullikenModeActive) ||
    !renderer ||
    !camera ||
    !raycaster ||
    !mouse ||
    !moleculeGroup ||
    !chargeTooltipElement
  ) {
    if (chargeTooltipElement) chargeTooltipElement.classList.add("hidden");
    currentHoveredAtom = null;
    return;
  }

  // ... (Resto da lógica de Carga permanece igual) ...
  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry?.type === "SphereGeometry")
  );

  if (intersects.length > 0) {
    const hoveredAtom = intersects[0].object;
    chargeTooltipElement.style.left = `${event.clientX + 15}px`;
    chargeTooltipElement.style.top = `${event.clientY + 15}px`;

    // ... (Lógica de exibição de carga continua aqui) ...
    if (hoveredAtom === currentHoveredAtom) return;

    currentHoveredAtom = hoveredAtom;
    const atomIndex = hoveredAtom.userData.atomIndex;

    let chargeText = null;
    if (
      isChargeModeActive &&
      atomIndex !== undefined &&
      lastChelpgCharges[atomIndex] !== undefined
    ) {
      chargeText = `${lastChelpgCharges[atomIndex].toFixed(6)}`;
    } else if (
      isMullikenModeActive &&
      atomIndex !== undefined &&
      lastMullikenCharges[atomIndex] !== undefined
    ) {
      chargeText = `${lastMullikenCharges[atomIndex].toFixed(6)}`;
    }

    if (chargeText) {
      chargeTooltipElement.textContent = chargeText;
      chargeTooltipElement.classList.remove("hidden");
    } else {
      chargeTooltipElement.classList.add("hidden");
      currentHoveredAtom = null;
    }
  } else {
    chargeTooltipElement.classList.add("hidden");
    currentHoveredAtom = null;
  }
};

// ... (handleKeyDown e onMouseDown permanecem iguais) ...
const handleKeyDown = (event) => {
  const key = event.key.toLowerCase();
  if (key === "a") toggleAngleMode();
  if (key === "d") toggleDihedralMode();
  if (key === "s") toggleDistanceMode();
  if (key === "c") toggleChargeMode();
  if (key === "m") toggleMullikenMode();
};

const onMouseDown = (event) => {
  if (isChargeModeActive || isMullikenModeActive) return;
  if (
    (!isAngleModeActive && !isDihedralModeActive && !isDistanceModeActive) ||
    !moleculeGroup
  )
    return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry?.type === "SphereGeometry")
  );

  if (intersects.length > 0) {
    if (isAngleModeActive) handleAngleAtomSelection(intersects[0].object);
    else if (isDihedralModeActive)
      handleDihedralAtomSelection(intersects[0].object);
    else if (isDistanceModeActive)
      handleDistanceAtomSelection(intersects[0].object);
  }
};

// --- Modificando os Toggles para esconder resultados ao trocar de ferramenta ---
const toggleAngleMode = () => {
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
  if (isChargeModeActive) toggleChargeMode();
  if (isMullikenModeActive) toggleMullikenMode();

  isAngleModeActive = !isAngleModeActive;

  // Limpa displays antigos
  // hideMeasurementDisplays();

  const btn = document.getElementById("angulo");
  if (!btn) return;

  if (isAngleModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    btn.classList.add("tool-active");
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    clearAngleSelection();
    btn.classList.remove("tool-active");
    hideMeasurementDisplays();
  }
};

// Faça o mesmo para toggleDihedralMode e toggleDistanceMode (adicionar hideMeasurementDisplays)
const toggleDihedralMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDistanceModeActive) toggleDistanceMode();
  if (isChargeModeActive) toggleChargeMode();
  if (isMullikenModeActive) toggleMullikenMode();

  isDihedralModeActive = !isDihedralModeActive;
  // hideMeasurementDisplays(); // NOVO

  const btn = document.getElementById("diedro");
  if (!btn) return;

  if (isDihedralModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    btn.classList.add("tool-active");
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    clearDihedralSelection();
    btn.classList.remove("tool-active");
    hideMeasurementDisplays();
  }
};

const toggleDistanceMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  if (isChargeModeActive) toggleChargeMode();
  if (isMullikenModeActive) toggleMullikenMode();

  isDistanceModeActive = !isDistanceModeActive;
  // hideMeasurementDisplays(); // NOVO

  const btn = document.getElementById("distancia");
  if (!btn) return;

  if (isDistanceModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "crosshair";
    if (controls) controls.enabled = false;
    btn.classList.add("tool-active");
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (controls) controls.enabled = true;
    clearDistanceSelection();
    btn.classList.remove("tool-active");
    hideMeasurementDisplays();
  }
};
// ... toggleChargeMode e toggleMullikenMode permanecem iguais ...
const toggleChargeMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
  if (isMullikenModeActive) toggleMullikenMode();
  isChargeModeActive = !isChargeModeActive;

  const btn = document.getElementById("carga");
  if (isChargeModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "default";
    if (controls) controls.enabled = true;
    if (btn) btn.classList.add("tool-active");
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (btn) btn.classList.remove("tool-active");
    if (chargeTooltipElement) chargeTooltipElement.classList.add("hidden");
    currentHoveredAtom = null;
  }
};

const toggleMullikenMode = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
  if (isChargeModeActive) toggleChargeMode();
  isMullikenModeActive = !isMullikenModeActive;

  const btn = document.getElementById("mulliken");
  if (isMullikenModeActive) {
    if (renderer?.domElement) renderer.domElement.style.cursor = "default";
    if (controls) controls.enabled = true;
    if (btn) btn.classList.add("tool-active");
  } else {
    if (renderer?.domElement) renderer.domElement.style.cursor = "grab";
    if (btn) btn.classList.remove("tool-active");
    if (chargeTooltipElement) chargeTooltipElement.classList.add("hidden");
    currentHoveredAtom = null;
  }
};

export const resetMeasurementModes = () => {
  if (isAngleModeActive) toggleAngleMode();
  if (isDihedralModeActive) toggleDihedralMode();
  if (isDistanceModeActive) toggleDistanceMode();
  if (isChargeModeActive) toggleChargeMode();
  if (isMullikenModeActive) toggleMullikenMode();
  hideMeasurementDisplays(); // NOVO
};

// --- Funções de Seleção de Átomos e Cálculo (Modificadas) ---

// ... Funções auxiliares (handleAngleAtomSelection, etc) permanecem iguais ...
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

  // Atualiza tooltip de progresso se quiser
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = `Ângulo: ${selectedAtomsForAngle.length}/3`;
    measureCursorTooltip.classList.remove("hidden");
  }

  if (selectedAtomsForAngle.length === 3) calculateAndDisplayAngle();
};
const deselectAtomForAngle = (index) => {
  clearAngleHighlights();
  selectedAtomsForAngle.splice(index, 1);
  applyAngleHighlights();
  // hideMeasurementDisplays();
};
const clearAngleSelection = () => {
  clearAngleHighlights();
  selectedAtomsForAngle = [];
  // hideMeasurementDisplays();
};

// ... applyAngleHighlights, clearAngleHighlights permanecem iguais ...
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

// --- CÁLCULO DE ÂNGULO ---
const calculateAndDisplayAngle = () => {
  if (selectedAtomsForAngle.length < 3) return;
  const atoms = selectedAtomsForAngle
    .map((item) => item.atom?.position)
    .filter(Boolean);
  if (atoms.length < 3) return;
  const [atomA, atomB, atomC] = atoms;
  const v1 = new THREE.Vector3().subVectors(atomA, atomB);
  const v2 = new THREE.Vector3().subVectors(atomC, atomB);
  const angleDeg = THREE.MathUtils.radToDeg(v1.angleTo(v2));

  const resultText = `${angleDeg.toFixed(2)}°`;

  // 1. Atualiza o Tooltip do Cursor
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = resultText;
    measureCursorTooltip.classList.remove("hidden");
  }

  // 2. Atualiza e Anima o Display Inferior Esquerdo
  if (measureTypeLabel) measureTypeLabel.innerText = "Ângulo";
  runTypewriterEffect(resultText);
};

// --- CÁLCULO DE DIEDRO ---
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

  // Atualiza tooltip de progresso
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = `Diedro: ${selectedAtomsForDihedral.length}/4`;
    measureCursorTooltip.classList.remove("hidden");
  }

  if (selectedAtomsForDihedral.length === 4) calculateAndDisplayDihedral();
};
const deselectAtomForDihedral = (index) => {
  clearDihedralHighlights();
  selectedAtomsForDihedral.splice(index, 1);
  applyDihedralHighlights();
  hideMeasurementDisplays();
};
const clearDihedralSelection = () => {
  clearDihedralHighlights();
  selectedAtomsForDihedral = [];
  hideMeasurementDisplays();
};
// ... applyDihedralHighlights, clearDihedralHighlights permanecem iguais ...
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

const calculateAndDisplayDihedral = () => {
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

  const resultText = `${angleDeg.toFixed(2)}°`;

  // 1. Tooltip
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = resultText;
    measureCursorTooltip.classList.remove("hidden");
  }

  // 2. Animação Inferior
  if (measureTypeLabel) measureTypeLabel.innerText = "Diedro";
  runTypewriterEffect(resultText);
};

// --- CÁLCULO DE DISTÂNCIA ---
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

  // Atualiza tooltip de progresso
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = `Distância: ${selectedAtomsForDistance.length}/2`;
    measureCursorTooltip.classList.remove("hidden");
  }

  if (selectedAtomsForDistance.length === 2) calculateAndDisplayDistance();
};
const deselectAtomForDistance = (index) => {
  clearDistanceHighlights();
  selectedAtomsForDistance.splice(index, 1);
  applyDistanceHighlights();
  hideMeasurementDisplays();
};
const clearDistanceSelection = () => {
  clearDistanceHighlights();
  selectedAtomsForDistance = [];
  hideMeasurementDisplays();
};
// ... applyDistanceHighlights, clearDistanceHighlights permanecem iguais ...
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

const calculateAndDisplayDistance = () => {
  if (selectedAtomsForDistance.length < 2) return;
  const atomsPos = selectedAtomsForDistance
    .map((item) => item.atom?.position)
    .filter(Boolean);
  if (atomsPos.length < 2) return;
  const [posA, posB] = atomsPos;
  const distance = posA.distanceTo(posB);

  const resultText = `${distance.toFixed(3)} Å`;

  // 1. Tooltip
  if (measureCursorTooltip) {
    measureCursorTooltip.textContent = resultText;
    measureCursorTooltip.classList.remove("hidden");
  }

  // 2. Animação Inferior
  if (measureTypeLabel) measureTypeLabel.innerText = "Distância";
  runTypewriterEffect(resultText);
};

// --- Inicialização ---
export const initializeMeasurementTools = (three_objects, dom_elements) => {
  camera = three_objects.camera;
  renderer = three_objects.renderer;
  controls = three_objects.controls;
  moleculeGroup = three_objects.moleculeGroup;
  angleHelpersGroup = three_objects.angleHelpersGroup;
  raycaster = three_objects.raycaster;
  mouse = three_objects.mouse;

  chargeTooltipElement = document.getElementById("charge-tooltip");

  // NOVOS ELEMENTOS
  measureCursorTooltip = document.getElementById("measure-cursor-tooltip");
  measureResultBox = document.getElementById("measure-result-box");
  measureTypeLabel = document.getElementById("measure-type-label");
  measureTypewriterText = document.getElementById("measure-typewriter-text");

  // Listeners e setup igual ao anterior...
  window.addEventListener("keydown", handleKeyDown);
  renderer.domElement.addEventListener("mousedown", onMouseDown);
  renderer.domElement.addEventListener("mousemove", onMouseMove);
  renderer.domElement.addEventListener("mouseleave", () => {
    if (isChargeModeActive) {
      if (chargeTooltipElement) chargeTooltipElement.classList.add("hidden");
      currentHoveredAtom = null;
    }
  });

  document.getElementById("angulo")?.addEventListener("click", toggleAngleMode);
  document
    .getElementById("diedro")
    ?.addEventListener("click", toggleDihedralMode);
  document
    .getElementById("distancia")
    ?.addEventListener("click", toggleDistanceMode);
  document.getElementById("carga")?.addEventListener("click", toggleChargeMode);
  document
    .getElementById("mulliken")
    ?.addEventListener("click", toggleMullikenMode);

  return { resetMeasurementModes };
};
