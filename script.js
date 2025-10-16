import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  loadMoleculeFile,
  parseAllVersions,
  calculateCenter,
} from "./utils.js";
import { initializeMeasurementTools } from "./measurement.js";

// Variáveis de estado e da cena
let scene, camera, renderer, controls, moleculeGroup, angleHelpersGroup;
let allMoleculeVersions = [];
let measurementTools = {};

// Constantes de configuração
const atomData = {
  H: { color: 0xd3dedc, radius: 0.25 },
  C: { color: 0x9d9d9d, radius: 0.4 },
  N: { color: 0x4e709d, radius: 0.42 },
  O: { color: 0xda6c6c, radius: 0.42 },
  DEFAULT: { color: 0x252525, radius: 0.4 },
};
const covalentRadii = { H: 0.37, C: 0.77, N: 0.75, O: 0.73, DEFAULT: 0.6 };
const BOND_DISTANCE_TOLERANCE = 1.2;

const main = async () => {
  initThreeJS();

  measurementTools = initializeMeasurementTools({
    camera,
    renderer,
    controls,
    moleculeGroup,
    angleHelpersGroup,
    raycaster: new THREE.Raycaster(),
    mouse: new THREE.Vector2(),
  });

  setupFileUploadListener();

  // Inicia a aplicação com a mensagem para carregar um arquivo
  populateVersionSelector(0, "Carregue um arquivo...");
  updateFileNameDisplay(null); // Garante que o nome do arquivo esteja oculto no início
};

/**
 * Atualiza o elemento de exibição do nome do arquivo.
 * @param {string | null} fileName - O nome do arquivo a ser exibido, ou null para ocultar.
 */
const updateFileNameDisplay = (fileName) => {
  const displayElement = document.getElementById("file-name-display");
  if (fileName) {
    displayElement.textContent = fileName;
    displayElement.style.display = "block"; // Mostra o elemento
  } else {
    displayElement.textContent = "";
    displayElement.style.display = "none"; // Oculta o elemento
  }
};

const setupFileUploadListener = () => {
  const uploader = document.getElementById("file-uploader");
  uploader.addEventListener("change", (event) => {
    const file = event.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileText = e.target.result;
      processFileContent(fileText, file.name);
    };
    reader.readAsText(file);

    uploader.value = null;
  });
};

const processFileContent = (fileText, sourceName) => {
  allMoleculeVersions = parseAllVersions(fileText);

  if (allMoleculeVersions.length > 0) {
    updateFileNameDisplay(sourceName); // ATUALIZADO: Mostra o nome do arquivo no novo elemento
    populateVersionSelector(allMoleculeVersions.length); // ATUALIZADO: Não passa mais o nome do arquivo
    displayMoleculeVersion(0);
    console.log(
      `Arquivo "${sourceName}" processado. ${allMoleculeVersions.length} ciclos encontrados.`
    );
  } else {
    updateFileNameDisplay(null); // ATUALIZADO: Oculta o nome do arquivo se falhar
    console.error(
      "Nenhum ciclo de otimização válido foi encontrado no arquivo:",
      sourceName
    );
    populateVersionSelector(0, "Arquivo inválido");
  }
};

const populateVersionSelector = (numVersions, defaultMessage = "") => {
  const selector = document.getElementById("version-select");
  selector.innerHTML = "";

  if (numVersions === 0) {
    selector.innerHTML = `<option>${defaultMessage || "Nenhum ciclo"}</option>`;
    return;
  }

  // ATUALIZADO: O texto da opção agora é apenas o número do ciclo
  for (let i = 0; i < numVersions; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.innerText = `Ciclo ${i + 1}`; // APENAS "Ciclo X"
    selector.appendChild(option);
  }

  selector.replaceWith(selector.cloneNode(true));
  document
    .getElementById("version-select")
    .addEventListener("change", (event) => {
      displayMoleculeVersion(parseInt(event.target.value, 10));
    });
};

const displayMoleculeVersion = (index) => {
  if (!allMoleculeVersions[index] || allMoleculeVersions[index].length === 0) {
    while (moleculeGroup.children.length > 0)
      moleculeGroup.remove(moleculeGroup.children[0]);
    console.warn(`Ciclo ${index + 1} não contém átomos válidos.`);
    return;
  }

  document.getElementById("version-select").value = index;

  if (measurementTools.resetMeasurementModes) {
    measurementTools.resetMeasurementModes();
  }

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

// --- Funções de Renderização (sem alterações) ---

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
    const material = new THREE.MeshBasicMaterial({ color: config.color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(atom.vec);
    moleculeGroup.add(sphere);
  });
};

const drawBonds = (atoms) => {
  const bondMaterial = new THREE.MeshBasicMaterial({ color: 0xe0e0e0 });
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

main();
