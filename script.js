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
  H: { color: 0xffffff, radius: 0.25 },
  C: { color: 0x444444, radius: 0.4 },
  N: { color: 0x0000ff, radius: 0.42 },
  O: { color: 0xff0000, radius: 0.42 },
  DEFAULT: { color: 0xcccccc, radius: 0.4 },
};
const covalentRadii = { H: 0.37, C: 0.77, N: 0.75, O: 0.73, DEFAULT: 0.6 };
const BOND_DISTANCE_TOLERANCE = 1.2;
const HIGHLIGHT_COLORS = {
  end_point: 0x00ff00, // Verde para as pontas
  vertex: 0xff8c00, // Laranja para o centro (vértice)
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
    highlightMaterial.emissive.setHex(
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
  scene.background = new THREE.Color(0x111827);
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
  scene.add(new THREE.AmbientLight(0xcccccc, 0.8));
  const directionalLight = new THREE.DirectionalLight(0xffffff, 0.9);
  directionalLight.position.set(1, 1, 0.5).normalize();
  scene.add(directionalLight);
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
    const material = new THREE.MeshStandardMaterial({
      color: config.color,
      metalness: 0.2,
      roughness: 0.5,
    });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(atom.vec);
    moleculeGroup.add(sphere);
  });
};

const drawBonds = (atoms) => {
  const bondMaterial = new THREE.MeshStandardMaterial({
    color: 0xaaaaaa,
    metalness: 0.1,
    roughness: 0.6,
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
        const bondGeometry = new THREE.CylinderGeometry(0.1, 0.1, distance, 16);
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
