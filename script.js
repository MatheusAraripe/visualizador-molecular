import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  loadMoleculeFile,
  parseAllVersions,
  calculateCenter,
} from "./utils.js";

// Variáveis de estado e da cena
let scene, camera, renderer, controls, moleculeGroup, angleHelpersGroup;
let allMoleculeVersions = [];
let isAngleModeActive = false;
let selectedAtomsForAngle = [];
let isDihedralModeActive = false; // Novo estado para o modo diedro
let selectedAtomsForDihedral = []; // Novo array para o diedro
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Constantes de configuração
const atomData = {
  H: { color: 0xf5f5f5, radius: 0.25 },
  C: { color: 0xaeb6bf, radius: 0.4 },
  N: { color: 0x82a9d9, radius: 0.42 },
  O: { color: 0xf08080, radius: 0.42 },
  DEFAULT: { color: 0xd3d3d3, radius: 0.4 },
};
const covalentRadii = { H: 0.37, C: 0.77, N: 0.75, O: 0.73, DEFAULT: 0.6 };
const BOND_DISTANCE_TOLERANCE = 1.2;
const HIGHLIGHT_COLORS = {
  end_point: 0x00ff00, // Verde para as pontas
  vertex: 0xff8c00, // Laranja para o centro (ângulo) ou eixo (diedro)
};

const main = async () => {
  initThreeJS();
  setupEventListeners();
  try {
    const fileContent = await loadMoleculeFile("data/data_limpo.txt");
    allMoleculeVersions = parseAllVersions(fileContent);
    if (allMoleculeVersions.length > 0) {
      populateVersionSelector(allMoleculeVersions.length);
      displayMoleculeVersion(0);
    } else {
      document.getElementById("version-select").innerHTML =
        "<option>Nenhum ciclo encontrado.</option>";
    }
  } catch (error) {
    console.error("Erro ao carregar ou processar o arquivo:", error);
    document.getElementById("version-select").innerHTML =
      "<option>Falha ao carregar.</option>";
  }
};

const populateVersionSelector = (numVersions) => {
  const selector = document.getElementById("version-select");
  selector.innerHTML = "";
  for (let i = 0; i < numVersions; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.innerText = `Ciclo ${i + 1}`;
    selector.appendChild(option);
  }
  selector.addEventListener("change", (event) => {
    displayMoleculeVersion(parseInt(event.target.value, 10));
  });
};

const displayMoleculeVersion = (index) => {
  if (!allMoleculeVersions[index]) return;
  document.getElementById("version-select").value = index;
  if (isAngleModeActive) toggleAngleMode();
  else clearAngleSelection();

  while (moleculeGroup.children.length > 0)
    moleculeGroup.remove(moleculeGroup.children[0]);

  const atoms = allMoleculeVersions[index];
  const center = calculateCenter(atoms);
  const centeredAtoms = atoms.map((atom) => ({
    ...atom,
    vec: new THREE.Vector3().copy(atom.vec).sub(center),
  }));
  drawAtoms(centeredAtoms);
  drawBonds(centeredAtoms);
};

const setupEventListeners = () => {
  window.addEventListener("keydown", handleKeyDown);
  renderer.domElement.addEventListener("mousedown", onMouseDown);
};

// --- Lógica de Ativação dos Modos ---

const handleKeyDown = (event) => {
  const key = event.key.toLowerCase();
  if (key === "a") toggleAngleMode();
  if (key === "d") toggleDihedralMode();
};

const toggleAngleMode = () => {
  if (isDihedralModeActive) toggleDihedralMode(); // Desativa o outro modo se estiver ativo
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
  if (isAngleModeActive) toggleAngleMode(); // Desativa o outro modo se estiver ativo
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

// --- Lógica de Seleção (Mouse) ---

const onMouseDown = (event) => {
  if (!isAngleModeActive && !isDihedralModeActive) return;

  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
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

// --- Funções para ÂNGULO CONVENCIONAL ---

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

// --- NOVAS Funções para ÂNGULO DE DIEDRO ---

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
    // Átomos 1 e 2 (índices 1 e 2) são o eixo central
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

  // Vetores das ligações
  const v1 = new THREE.Vector3().subVectors(p2, p1);
  const v2 = new THREE.Vector3().subVectors(p3, p2);
  const v3 = new THREE.Vector3().subVectors(p4, p3);

  // Normais aos planos
  const n1 = new THREE.Vector3().crossVectors(v1, v2);
  const n2 = new THREE.Vector3().crossVectors(v2, v3);

  // O ângulo entre as normais é o diedro
  let angleRad = n1.angleTo(n2);

  // Determina o sinal do ângulo
  if (n1.dot(v3) < 0) {
    angleRad = -angleRad;
  }

  const angleDeg = THREE.MathUtils.radToDeg(angleRad);
  document.getElementById("angle-text").innerText = `${angleDeg.toFixed(2)}°`;
};

// --- Funções Comuns e de Renderização ---
const clearAngleHelpers = () => {
  if (angleHelpersGroup) {
    while (angleHelpersGroup.children.length > 0) {
      angleHelpersGroup.remove(angleHelpersGroup.children[0]);
    }
  }
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = "";
};
const initThreeJS = () => {
  scene = new THREE.Scene();
  scene.background = new THREE.Color("#fefefe");
  camera = new THREE.PerspectiveCamera(
    75,
    window.innerWidth / window.innerHeight,
    0.1,
    1000
  );
  camera.position.z = 25;
  const container = document.getElementById("container3d");
  renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  container.appendChild(renderer.domElement);

  // As luzes foram removidas pois não são necessárias com MeshBasicMaterial

  controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  moleculeGroup = new THREE.Group();
  angleHelpersGroup = new THREE.Group();
  scene.add(moleculeGroup, angleHelpersGroup);
  window.addEventListener("resize", onWindowResize, false);
  animate();
};

const drawAtoms = (atoms) => {
  atoms.forEach((atom) => {
    const config = atomData[atom.symbol] || atomData.DEFAULT;
    const geometry = new THREE.SphereGeometry(config.radius, 32, 32);
    // Usando MeshBasicMaterial para um visual "flat"
    const material = new THREE.MeshBasicMaterial({
      color: config.color,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(atom.vec);
    moleculeGroup.add(sphere);
  });
};

const drawBonds = (atoms) => {
  // Usando MeshBasicMaterial e uma cor mais clara para as ligações
  const bondMaterial = new THREE.MeshBasicMaterial({
    color: 0xe0e0e0, // Um cinza bem claro
  });
  for (let i = 0; i < atoms.length; i++) {
    for (let j = i + 1; j < atoms.length; j++) {
      const atom1 = atoms[i];
      const atom2 = atoms[j];
      const maxBondLength =
        (covalentRadii[atom1.symbol] || covalentRadii.DEFAULT) +
        (covalentRadii[atom2.symbol] || covalentRadii.DEFAULT);
      const distance = atom1.vec.distanceTo(atom2.vec);
      if (
        distance > 0.5 &&
        distance < maxBondLength * BOND_DISTANCE_TOLERANCE
      ) {
        const bondGeometry = new THREE.CylinderGeometry(
          0.04,
          0.04,
          distance,
          16
        );
        const bondMesh = new THREE.Mesh(bondGeometry, bondMaterial);
        const midpoint = new THREE.Vector3()
          .addVectors(atom1.vec, atom2.vec)
          .multiplyScalar(0.5);
        bondMesh.position.copy(midpoint);
        const direction = new THREE.Vector3()
          .subVectors(atom2.vec, atom1.vec)
          .normalize();
        bondMesh.quaternion.setFromUnitVectors(
          new THREE.Vector3(0, 1, 0),
          direction
        );
        moleculeGroup.add(bondMesh);
      }
    }
  }
};

const onWindowResize = () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
};

const animate = () => {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
};

// --- CÓDIGO COMPLETO PARA AS FUNÇÕES OMITIDAS (COPIE E COLE ESTE BLOCO) ---
Object.assign(window, {
  populateVersionSelector: (numVersions) => {
    const selector = document.getElementById("version-select");
    selector.innerHTML = "";
    for (let i = 0; i < numVersions; i++) {
      const option = document.createElement("option");
      option.value = i;
      option.innerText = `Ciclo ${i + 1}`;
      selector.appendChild(option);
    }
    selector.addEventListener("change", (event) => {
      displayMoleculeVersion(parseInt(event.target.value, 10));
    });
  },
  displayMoleculeVersion: (index) => {
    if (!allMoleculeVersions[index]) return;
    document.getElementById("version-select").value = index;
    if (isAngleModeActive) toggleAngleMode();
    if (isDihedralModeActive) toggleDihedralMode();
    else clearAngleSelection();
    while (moleculeGroup.children.length > 0)
      moleculeGroup.remove(moleculeGroup.children[0]);
    const atoms = allMoleculeVersions[index];
    const center = calculateCenter(atoms);
    const centeredAtoms = atoms.map((atom) => ({
      ...atom,
      vec: new THREE.Vector3().copy(atom.vec).sub(center),
    }));
    drawAtoms(centeredAtoms);
    drawBonds(centeredAtoms);
  },
  setupEventListeners: () => {
    window.addEventListener("keydown", handleKeyDown);
    renderer.domElement.addEventListener("mousedown", onMouseDown);
  },
  clearAngleHelpers: () => {
    if (angleHelpersGroup) {
      while (angleHelpersGroup.children.length > 0) {
        angleHelpersGroup.remove(angleHelpersGroup.children[0]);
      }
    }
    const angleText = document.getElementById("angle-text");
    if (angleText) angleText.innerText = "";
  },
  initThreeJS: () => {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0xeeeeee);
    camera = new THREE.PerspectiveCamera(
      75,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    camera.position.z = 25;
    const container = document.getElementById("container3d");
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    container.appendChild(renderer.domElement);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    moleculeGroup = new THREE.Group();
    angleHelpersGroup = new THREE.Group();
    scene.add(moleculeGroup, angleHelpersGroup);
    window.addEventListener("resize", onWindowResize, false);
    animate();
  },
  drawAtoms: (atoms) => {
    atoms.forEach((atom) => {
      const config = atomData[atom.symbol] || atomData.DEFAULT;
      const geometry = new THREE.SphereGeometry(config.radius, 32, 32);
      const material = new THREE.MeshBasicMaterial({ color: config.color });
      const sphere = new THREE.Mesh(geometry, material);
      sphere.position.copy(atom.vec);
      moleculeGroup.add(sphere);
    });
  },
  drawBonds: (atoms) => {
    const bondMaterial = new THREE.MeshBasicMaterial({ color: 0x555555 });
    for (let i = 0; i < atoms.length; i++) {
      for (let j = i + 1; j < atoms.length; j++) {
        const atom1 = atoms[i];
        const atom2 = atoms[j];
        const maxBondLength =
          (covalentRadii[atom1.symbol] || covalentRadii.DEFAULT) +
          (covalentRadii[atom2.symbol] || covalentRadii.DEFAULT);
        const distance = atom1.vec.distanceTo(atom2.vec);
        if (
          distance > 0.5 &&
          distance < maxBondLength * BOND_DISTANCE_TOLERANCE
        ) {
          const bondGeometry = new THREE.CylinderGeometry(
            0.04,
            0.04,
            distance,
            16
          );
          const bondMesh = new THREE.Mesh(bondGeometry, bondMaterial);
          const midpoint = new THREE.Vector3()
            .addVectors(atom1.vec, atom2.vec)
            .multiplyScalar(0.5);
          bondMesh.position.copy(midpoint);
          const direction = new THREE.Vector3()
            .subVectors(atom2.vec, atom1.vec)
            .normalize();
          bondMesh.quaternion.setFromUnitVectors(
            new THREE.Vector3(0, 1, 0),
            direction
          );
          moleculeGroup.add(bondMesh);
        }
      }
    }
  },
  onWindowResize: () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  },
  animate: () => {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  },
});

main();
