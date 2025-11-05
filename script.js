import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  loadMoleculeFile,
  parseAllVersions,
  calculateCenter,
  extractCycleEnergies,
  extractLastChelpgCharges,
  extractLastMullikenCharges,
} from "./utils.js";
import {
  initializeMeasurementTools,
  setChargeData,
  setMullikenChargeData,
} from "./measurement.js";

// Variáveis de estado e da cena
let scene, camera, renderer, controls, moleculeGroup, angleHelpersGroup;
let allMoleculeVersions = []; // Armazena APENAS os arrays de átomos
let cycleEnergies = []; // Array para armazenar apenas as energias
let measurementTools = {};
let lastChelpgCharges = []; //  ADICIONA ARRAY GLOBAL PARA CARGAS
let lastMullikenCharges = []; // ADICIONA ARRAY GLOBAL PARA MULLIKEN

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

/**
 * Configura os listeners para os tooltips que seguem o cursor.
 */
const setupTooltipListeners = () => {
  const tooltipElement = document.getElementById("cursor-tooltip");
  if (!tooltipElement) return; // Sai se o elemento tooltip não existir

  // Seleciona todos os labels que devem ter um tooltip
  const elementsWithTooltip = document.querySelectorAll("[data-tooltip-text]");

  elementsWithTooltip.forEach((element) => {
    let isHovering = false; // Flag para controlar se o mouse está sobre o elemento

    element.addEventListener("mouseenter", (event) => {
      isHovering = true;
      const tooltipText = element.getAttribute("data-tooltip-text");
      if (tooltipText) {
        tooltipElement.textContent = tooltipText;
        // Posiciona inicialmente antes de mostrar
        tooltipElement.style.left = `${event.clientX + 15}px`;
        tooltipElement.style.top = `${event.clientY + 15}px`;
        tooltipElement.classList.remove("hidden");
        tooltipElement.style.opacity = "1"; // Garante visibilidade
      }
    });

    element.addEventListener("mousemove", (event) => {
      if (isHovering) {
        // Atualiza a posição enquanto o mouse se move sobre o elemento
        tooltipElement.style.left = `${event.clientX + 15}px`; // Pequeno offset à direita
        tooltipElement.style.top = `${event.clientY + 15}px`; // Pequeno offset abaixo
      }
    });

    element.addEventListener("mouseleave", () => {
      isHovering = false;
      tooltipElement.classList.add("hidden");
      tooltipElement.style.opacity = "0";
    });
  });
};

const setupColorPicker = () => {
  const colorPicker = document.getElementById("bg-color-picker");
  if (!colorPicker) {
    console.error("Não foi possível encontrar o seletor de cor.");
    return;
  }

  // Define a cor inicial da cena (pode ser qualquer cor)
  const initialColor = "#fefefe";
  if (scene) {
    scene.background = new THREE.Color(initialColor);
  }
  colorPicker.value = initialColor; // Sincroniza o seletor

  // Adiciona o listener para "input" (muda em tempo real)
  colorPicker.addEventListener("input", (event) => {
    const newColor = event.target.value;
    if (scene) {
      // ATUALIZADO: Muda a cor de fundo da cena do Three.js
      scene.background = new THREE.Color(newColor);
    }
  });
};

/**
 * Adiciona o listener para o botão de salvar imagem.
 */
const setupSaveButtonListener = () => {
  const saveBtn = document.getElementById("save-image-btn");
  if (saveBtn) {
    saveBtn.addEventListener("click", saveCanvasAsPNG);
  } else {
    console.warn("Botão #save-image-btn não encontrado.");
  }
};

/**
 * Captura o canvas do renderer e inicia o download de um PNG.
 */
const saveCanvasAsPNG = () => {
  if (!renderer) {
    console.error("Renderizador não está pronto para salvar imagem.");
    return;
  }

  try {
    // Força uma renderização extra para garantir que o buffer esteja atualizado
    renderer.render(scene, camera);

    const dataURL = renderer.domElement.toDataURL("image/png");
    const link = document.createElement("a");

    // Pega o nome do arquivo, se disponível, ou usa um padrão
    const fileNameDisplay = document.getElementById("file-name-display");
    let fileName = "VMA_IMG.png";
    if (fileNameDisplay && fileNameDisplay.textContent) {
      fileName = `${fileNameDisplay.textContent.split(".")[0]}.png`;
    }

    link.download = fileName;
    link.href = dataURL;

    // Adiciona, clica e remove o link (necessário para Firefox)
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  } catch (e) {
    console.error("Não foi possível salvar a imagem.", e);
    alert("Erro ao salvar imagem. Verifique o console para detalhes.");
  }
};

const main = async () => {
  // Tenta inicializar Three.js e verifica o sucesso
  const threeJsInitialized = initThreeJS();
  if (!threeJsInitialized) {
    console.error(
      "Falha na inicialização do Three.js. A aplicação não pode continuar."
    );
    document.body.innerHTML =
      "<p style='color: red; padding: 20px;'>Erro crítico ao inicializar a visualização 3D.</p>";
    return; // Interrompe se o Three.js falhar
  }

  // Tenta pegar os elementos do DOM
  const logContainer = document.getElementById("measurement-log");
  const instructions = document.getElementById("measurement-instructions");

  // Verifica se os elementos do DOM foram encontrados
  // (Movido para dentro de initializeMeasurementTools)

  // Verifica se os objetos Three.js essenciais existem ANTES de chamar initializeMeasurementTools
  if (
    !camera ||
    !renderer ||
    !controls ||
    !moleculeGroup ||
    !angleHelpersGroup
  ) {
    // Evita erro fatal mostrando msg e parando
    document.body.innerHTML =
      "<p style='color: red; padding: 20px;'>Erro crítico na inicialização 3D. Verifique o console.</p>";
    return;
  }

  // Inicializa as ferramentas de medição passando TUDO
  measurementTools = initializeMeasurementTools(
    {
      // Objeto com refs do Three.js
      camera,
      renderer,
      controls,
      moleculeGroup,
      angleHelpersGroup,
      raycaster: new THREE.Raycaster(),
      mouse: new THREE.Vector2(),
    },
    {
      // Objeto com refs do DOM (agora verificado dentro de init)
      logContainer: logContainer, // Passa mesmo que nulo, init verifica
      instructions: instructions, // Passa mesmo que nulo, init verifica
    }
  );

  setupTooltipListeners(); // exibe tooltip

  setupFileUploadListener(); // Configura o upload
  setupColorPicker();
  setupSaveButtonListener();

  // Estado inicial da UI
  populateVersionSelector(0, "Carregue um arquivo...");
  updateFileNameDisplay(null);
  updateEnergyDisplay(null); // Chama a função para ocultar/definir estado inicial
};

/**
 * Atualiza o elemento de exibição do nome do arquivo.
 * @param {string | null} fileName - O nome do arquivo a ser exibido, ou null para ocultar.
 */
const updateFileNameDisplay = (fileName) => {
  const displayElement = document.getElementById("file-name-display");
  if (!displayElement) return; // Segurança
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
  const uploaderLabel = document.getElementById("file-uploader-label"); // Assuming you have this label from previous steps
  if (!uploader || !uploaderLabel) {
    console.error("Elementos de upload de arquivo não encontrados.");
    return;
  }

  uploader.addEventListener("change", (event) => {
    const file = event.target.files[0];
    const spanInsideLabel = uploaderLabel.querySelector("span"); // Assuming span exists

    if (!file) {
      if (spanInsideLabel) spanInsideLabel.textContent = "Escolher arquivo"; // Volta ao texto original
      return;
    }

    if (spanInsideLabel) spanInsideLabel.textContent = file.name; // Mostra nome no span

    const reader = new FileReader();
    reader.onload = (e) => {
      const fileText = e.target.result;
      processFileContent(fileText, file.name);
    };
    reader.onerror = (e) => {
      // Add error handling
      console.error("Erro ao ler o arquivo:", e);
      if (spanInsideLabel) spanInsideLabel.textContent = "Erro ao ler";
      updateFileNameDisplay(null);
      populateVersionSelector(0, "Erro no arquivo");
    };
    reader.readAsText(file);

    uploader.value = null; // Limpa para permitir re-upload
  });
};

const processFileContent = (fileText, sourceName) => {
  // Processa átomos e energias separadamente
  allMoleculeVersions = parseAllVersions(fileText); // Retorna [ [átomosCiclo1], [átomosCiclo2], ... ]
  cycleEnergies = extractCycleEnergies(fileText); // Retorna [ energiaCiclo1, energiaCiclo2, ... ]
  lastChelpgCharges = extractLastChelpgCharges(fileText); // cargas
  lastMullikenCharges = extractLastMullikenCharges(fileText); // CARGAS MULLIKEN

  // ENVIA AS CARGAS PARA O MÓDULO DE MEDIÇÃO
  if (setChargeData) {
    setChargeData(lastChelpgCharges);
  }
  if (setMullikenChargeData) {
    setMullikenChargeData(lastMullikenCharges);
  }

  // Verifica se pelo menos foram encontrados ciclos com átomos
  if (allMoleculeVersions.length > 0) {
    updateFileNameDisplay(sourceName);
    populateVersionSelector(allMoleculeVersions.length); // Popula com base no número de geometrias
    displayMoleculeVersion(0); // Exibe o primeiro ciclo
    console.log(
      `Cargas CHELPG encontradas: ${lastChelpgCharges.length} átomos.`
    );
    console.log(
      `Cargas Mulliken encontradas: ${lastMullikenCharges.length} átomos.`
    );
  } else {
    updateFileNameDisplay(sourceName + " (Inválido)");
    console.error("Nenhuma geometria válida encontrada:", sourceName);
    populateVersionSelector(0, "Arquivo inválido");
    updateEnergyDisplay(null);
    cycleEnergies = []; // Limpa energias se não houver geometrias
    lastChelpgCharges = []; // Limpa cargas em caso de erro
    lastMullikenCharges = [];
  }
};

const populateVersionSelector = (numVersions, defaultMessage = "") => {
  const selector = document.getElementById("version-select");
  if (!selector) return; // Safety check
  selector.innerHTML = "";

  if (numVersions === 0) {
    selector.innerHTML = `<option>${defaultMessage || "Nenhum ciclo"}</option>`;
    selector.disabled = true; // Disable if no options
    return;
  }

  selector.disabled = false; // Enable if options exist
  for (let i = 0; i < numVersions; i++) {
    const option = document.createElement("option");
    option.value = i;
    option.innerText = `Ciclo ${i + 1}`;
    selector.appendChild(option);
  }

  // Clone to remove old listeners and add new one
  const newSelector = selector.cloneNode(true);
  selector.parentNode.replaceChild(newSelector, selector);
  newSelector.addEventListener("change", (event) => {
    displayMoleculeVersion(parseInt(event.target.value, 10));
  });
};

/**
 * Exibe a molécula e a energia do ciclo selecionado.
 * @param {number} index - O índice do ciclo a ser exibido.
 */
const displayMoleculeVersion = (index) => {
  if (!moleculeGroup) {
    console.error("displayMoleculeVersion: moleculeGroup não definido!");
    return;
  }

  // Verifica se o índice é válido e se há dados para ele
  if (
    !allMoleculeVersions ||
    index < 0 ||
    index >= allMoleculeVersions.length ||
    !allMoleculeVersions[index]
  ) {
    console.warn(`Índice de ciclo inválido ou dados não encontrados: ${index}`);
    updateEnergyDisplay(cycleEnergies[index] ?? null); // Tenta mostrar energia mesmo assim
    while (moleculeGroup.children.length > 0)
      moleculeGroup.remove(moleculeGroup.children[0]);
    return;
  }

  // const cycleData = allMoleculeVersions[index]; // Errado - allMoleculeVersions só tem átomos
  const atoms = allMoleculeVersions[index]; // Correto
  const energy = cycleEnergies[index] ?? null; // Pega energia do array separado

  // Limpa a cena ANTES de verificar se há átomos
  while (moleculeGroup.children.length > 0)
    moleculeGroup.remove(moleculeGroup.children[0]);

  if (!atoms || atoms.length === 0) {
    console.warn(`Ciclo ${index + 1} não contém átomos válidos.`);
    updateEnergyDisplay(energy); // Mostra energia mesmo sem átomos
    return;
  }

  const selector = document.getElementById("version-select");
  if (selector) selector.value = index;

  if (measurementTools.resetMeasurementModes) {
    measurementTools.resetMeasurementModes();
  }

  const center = calculateCenter(atoms);
  const centeredAtoms = atoms.map((atom) => ({
    ...atom,
    vec: new THREE.Vector3().copy(atom.vec).sub(center),
  }));

  drawAtoms(centeredAtoms);
  drawBonds(centeredAtoms);
  updateEnergyDisplay(energy);
};

/**
 * Atualiza a exibição da energia na UI.
 * @param {number | null} energyValue - O valor da energia ou null para ocultar/indicar N/A.
 */
const updateEnergyDisplay = (energyValue) => {
  const energyContainer = document.getElementById("energy-display-container");
  const energyValueElement = document.getElementById("energy-value");
  if (!energyContainer || !energyValueElement) return;

  if (energyValue !== null && !isNaN(energyValue)) {
    energyValueElement.textContent = energyValue.toFixed(6);
    energyContainer.style.display = "block";
  } else {
    energyValueElement.textContent = "N/A";
    energyContainer.style.display = "block"; // Mantém visível mesmo com N/A
  }
};

// --- Funções de Renderização (initThreeJS com Debugging) ---
const initThreeJS = () => {
  try {
    scene = new THREE.Scene();
    // ATUALIZADO: Define uma cor de fundo inicial (que o color picker vai sobrescrever)
    scene.background = new THREE.Color("#f5f5f5");

    const container = document.getElementById("viewer-area");
    if (!container) {
      console.error("Elemento #viewer-area não encontrado!");
      return false;
    }
    const canvasContainer = document.getElementById("container3d");
    if (!canvasContainer) {
      console.error("Elemento #container3d não encontrado!");
      return false;
    }

    const initialWidth = container.clientWidth || 100;
    const initialHeight = container.clientHeight || 100;

    camera = new THREE.PerspectiveCamera(
      75,
      initialWidth / initialHeight,
      0.1,
      1000
    );
    camera.position.z = 25;

    // ATUALIZADO: Renderer NÃO é mais transparente (alpha: false por padrão)
    renderer = new THREE.WebGLRenderer({
      antialias: true,
      preserveDrawingBuffer: true, // Essencial para salvar a imagem
    });
    renderer.setSize(initialWidth, initialHeight);
    // renderer.setClearColor(0x000000, 0); // REMOVIDO
    canvasContainer.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    moleculeGroup = new THREE.Group();
    angleHelpersGroup = new THREE.Group();
    scene.add(moleculeGroup, angleHelpersGroup);

    window.addEventListener("resize", onWindowResize, false);
    setTimeout(onWindowResize, 50);
    animate();

    return true; // Success
  } catch (error) {
    console.error("Erro durante a inicialização do Three.js:", error);
    return false; // Failure
  }
};

const drawAtoms = (atoms) => {
  if (!moleculeGroup) return; // Segurança
  let count = 0;
  atoms.forEach((atom, index) => {
    const config = atomData[atom.symbol] || atomData.DEFAULT;
    const geometry = new THREE.SphereGeometry(config.radius, 32, 32);
    const material = new THREE.MeshBasicMaterial({ color: config.color });
    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.copy(atom.vec);
    // 7. ADICIONA O ÍNDICE DO ÁTOMO AO OBJETO 3D
    sphere.userData.atomIndex = index;
    moleculeGroup.add(sphere);
    count++;
  });
};

const drawBonds = (atoms) => {
  if (!moleculeGroup) return; // Segurança
  const bondMaterial = new THREE.MeshBasicMaterial({ color: 0xe0e0e0 });
  let bondCount = 0; // Contador de ligações
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
        bondCount++; // Incrementa
      }
    }
  }
};

const onWindowResize = () => {
  const viewerArea = document.getElementById("viewer-area");
  if (!viewerArea || !camera || !renderer) return;
  const width = viewerArea.clientWidth;
  const height = viewerArea.clientHeight;
  if (width === 0 || height === 0) {
    console.warn("onWindowResize: viewerArea com dimensões zero.");
    return;
  }
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
  renderer.setSize(width, height);
};

const animate = () => {
  requestAnimationFrame(animate);
  if (controls) controls.update();
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  } else {
    // console.warn("Renderização pulada: objeto essencial faltando."); // Evita poluir console
  }
};

// Garante que o DOM está completamente carregado antes de executar o script principal
document.addEventListener("DOMContentLoaded", main);
