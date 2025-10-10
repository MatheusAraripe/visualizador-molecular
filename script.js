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
const raycaster = new THREE.Raycaster();
const mouse = new THREE.Vector2();

// Constantes de configuração
const atomData = {
  H: { color: 0xd3dedc, radius: 0.25 }, // Branco suave
  C: { color: 0x9d9d9d, radius: 0.4 }, // Cinza pastel
  N: { color: 0x4e709d, radius: 0.42 }, // Azul pastel
  O: { color: 0xda6c6c, radius: 0.42 }, // Vermelho/coral pastel
  DEFAULT: { color: "#252525", radius: 0.4 }, // Cinza claro
};
const covalentRadii = { H: 0.37, C: 0.77, N: 0.75, O: 0.73, DEFAULT: 0.6 };
const BOND_DISTANCE_TOLERANCE = 1.2;
const HIGHLIGHT_COLORS = {
  end_point: 0xace1af, // Verde para as pontas
  vertex: 0xef9c66, // Laranja para o centro (vértice)
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

const toggleAngleMode = () => {
  isAngleModeActive = !isAngleModeActive;
  const angleDisplay = document.getElementById("angle-display");
  if (isAngleModeActive) {
    renderer.domElement.style.cursor = "crosshair";
    controls.enabled = false;
    angleDisplay.classList.remove("hidden");
    updateAngleInstructions();
  } else {
    renderer.domElement.style.cursor = "grab";
    controls.enabled = true;
    angleDisplay.classList.add("hidden");
    clearAngleSelection();
  }
};

const handleKeyDown = (event) => {
  if (event.key.toLowerCase() === "a") toggleAngleMode();
};

const onMouseDown = (event) => {
  if (!isAngleModeActive) return;
  mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
  mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
  raycaster.setFromCamera(mouse, camera);
  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry.type === "SphereGeometry")
  );
  if (intersects.length > 0) {
    handleAtomSelection(intersects[0].object);
  }
};

const handleAtomSelection = (clickedAtom) => {
  const index = selectedAtomsForAngle.findIndex(
    (item) => item.atom === clickedAtom
  );
  if (index !== -1) {
    deselectAtom(index);
  } else if (selectedAtomsForAngle.length < 3) {
    selectAtom(clickedAtom);
  }
};

const selectAtom = (atom) => {
  const originalMaterial = atom.material;
  selectedAtomsForAngle.push({ atom, originalMaterial });
  applyHighlights();
  updateAngleInstructions();
  if (selectedAtomsForAngle.length === 3) {
    calculateAndDisplayAngle();
  }
};

const deselectAtom = (index) => {
  clearHighlights();
  selectedAtomsForAngle.splice(index, 1);
  applyHighlights();
  clearAngleHelpers();
  updateAngleInstructions();
};

const clearAngleSelection = () => {
  clearHighlights();
  selectedAtomsForAngle = [];
  clearAngleHelpers();
};

const clearHighlights = () => {
  selectedAtomsForAngle.forEach(({ atom, originalMaterial }) => {
    atom.material = originalMaterial;
  });
};

const applyHighlights = () => {
  selectedAtomsForAngle.forEach(({ atom, originalMaterial }, index) => {
    const highlightMaterial = originalMaterial.clone();
    // CORREÇÃO: Alteramos a propriedade .color em vez de .emissive
    highlightMaterial.color.setHex(
      index === 1 ? HIGHLIGHT_COLORS.vertex : HIGHLIGHT_COLORS.end_point
    );
    atom.material = highlightMaterial;
  });
};

const clearAngleHelpers = () => {
  if (angleHelpersGroup) {
    while (angleHelpersGroup.children.length > 0) {
      angleHelpersGroup.remove(angleHelpersGroup.children[0]);
    }
  }
  const angleText = document.getElementById("angle-text");
  if (angleText) angleText.innerText = "";
};

const updateAngleInstructions = () => {
  const instructions = document.getElementById("angle-instructions");
  const count = selectedAtomsForAngle.length;
  instructions.innerText =
    count < 3 ? `Selecione ${3 - count} átomo(s).` : `Ângulo calculado.`;
};

const calculateAndDisplayAngle = () => {
  // Limpa apenas os helpers antigos (se houver) e o texto da UI
  clearAngleHelpers();
  const [atomA, atomB, atomC] = selectedAtomsForAngle.map(
    (item) => item.atom.position
  );
  const v1 = new THREE.Vector3().subVectors(atomA, atomB);
  const v2 = new THREE.Vector3().subVectors(atomC, atomB);
  const angleRad = v1.angleTo(v2);
  const angleDeg = THREE.MathUtils.radToDeg(angleRad);

  // Apenas atualiza o painel da UI, sem desenhar o arco em 3D
  document.getElementById("angle-text").innerText = `${angleDeg.toFixed(2)}°`;
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

// Inicia a aplicação
main();
