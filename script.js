import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import {
  loadMoleculeFile,
  parseAllVersions,
  calculateCenter,
  extractCycleEnergies,
  extractLastChelpgCharges,
  extractLastMullikenCharges,
  prepareChartData,
} from "./utils.js";
import {
  initializeMeasurementTools,
  setChargeData,
  setMullikenChargeData,
} from "./measurement.js";
import { initializeAtomLabels, clearAllLabels } from "./ui.js";

// Variáveis de estado e da cena
let scene, camera, renderer, controls, moleculeGroup, angleHelpersGroup;
let allMoleculeVersions = []; // Armazena APENAS os arrays de átomos
let cycleEnergies = []; // Array para armazenar apenas as energias
let measurementTools = {};
let lastChelpgCharges = []; //  ADICIONA ARRAY GLOBAL PARA CARGAS
let lastMullikenCharges = []; // ADICIONA ARRAY GLOBAL PARA MULLIKEN
let energyChartInstance = null; // guardar a instância do gráfico
let currentCycleIndex = 0; // NOVO: Rastreia o índice atual para a tabela

// Constantes de configuração
const atomData = {
  H: { color: 0xd3dedc, radius: 0.25 },
  C: { color: 0x9d9d9d, radius: 0.4 },
  N: { color: 0x4e709d, radius: 0.42 },
  O: { color: 0xda6c6c, radius: 0.42 },
  F: { color: 0x78ddcf, radius: 0.42 },
  DEFAULT: { color: 0x252525, radius: 0.4 },
};
const covalentRadii = { H: 0.37, C: 0.77, N: 0.75, O: 0.73, DEFAULT: 0.6 };
const BOND_DISTANCE_TOLERANCE = 1.2;

const setupFloatingToolbar = () => {
  // SE ESTIVER NO MOBILE (< 768px), NÃO FAZ NADA
  if (window.innerWidth < 768) return;

  const toolbar = document.getElementById("floating-toolbar");
  const handle = document.getElementById("toolbar-handle");
  const rotateBtn = document.getElementById("rotate-toolbar-btn");
  const btnContainer = document.getElementById("toolbar-buttons");

  if (!toolbar || !handle || !rotateBtn) return;

  // 1. Ativa o Drag and Drop (Com a correção aplicada acima)
  makeElementDraggable(toolbar, handle);

  // 2. Lógica de Rotação
  rotateBtn.addEventListener("click", () => {
    const isHorizontal = toolbar.classList.contains("flex-row");

    // Precisamos resetar transform e bottom caso o usuário gire ANTES de arrastar
    // Isso evita bugs visuais se ele girar a barra ainda centralizada
    const rect = toolbar.getBoundingClientRect();
    toolbar.style.left = rect.left + "px";
    toolbar.style.top = rect.top + "px";
    toolbar.style.bottom = "auto";
    toolbar.style.transform = "none";

    if (isHorizontal) {
      // Mudar para Vertical
      toolbar.classList.replace("flex-row", "flex-col");
      btnContainer.classList.replace("flex-row", "flex-col");

      // Ajustes na alça (handle) para visual vertical
      handle.classList.replace("border-r", "border-b");
      handle.classList.replace("mr-1", "mb-1");
      handle.classList.replace("pr-2", "pb-2");

      // Ajustes no botão de rotação
      rotateBtn.parentElement.classList.replace("border-l", "border-t");
      rotateBtn.parentElement.classList.replace("ml-1", "mt-1");
      rotateBtn.parentElement.classList.replace("pl-2", "pt-2");

      handle.querySelector("svg").classList.add("rotate-90");
    } else {
      // Voltar para Horizontal
      toolbar.classList.replace("flex-col", "flex-row");
      btnContainer.classList.replace("flex-col", "flex-row");

      handle.classList.replace("border-b", "border-r");
      handle.classList.replace("mb-1", "mr-1");
      handle.classList.replace("pb-2", "pr-2");

      rotateBtn.parentElement.classList.replace("border-t", "border-l");
      rotateBtn.parentElement.classList.replace("mt-1", "ml-1");
      rotateBtn.parentElement.classList.replace("pt-2", "pl-2");

      handle.querySelector("svg").classList.remove("rotate-90");
    }
  });
};

// --- NOVA FUNÇÃO: Configurar Janela da Tabela ---
const setupTableWindow = () => {
  const openBtn = document.getElementById("btn-tabela");
  const closeBtn = document.getElementById("close-table-btn");
  const tableWindow = document.getElementById("table-window");
  const tableHeader = document.getElementById("table-header");
  const overlay = document.getElementById("chart-overlay"); // Reutiliza o overlay

  makeElementDraggable(tableWindow, tableHeader);

  const closeTable = () => {
    tableWindow.classList.add("hidden");
    // Só esconde o overlay se o gráfico também estiver fechado (caso raro de ambos abertos)
    if (document.getElementById("chart-window").classList.contains("hidden")) {
      if (overlay) overlay.classList.add("hidden");
    }
  };

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (allMoleculeVersions.length === 0) {
        alert("Nenhuma geometria carregada.");
        return;
      }

      // Reset mobile
      if (window.innerWidth < 768) {
        tableWindow.style.top = "";
        tableWindow.style.left = "";
      }

      renderTable(currentCycleIndex); // Renderiza o ciclo atual
      tableWindow.classList.remove("hidden");
      if (overlay) overlay.classList.remove("hidden");
    });
  }

  closeBtn.addEventListener("click", closeTable);
  // Overlay click handling is shared in setupChartModal or added here if that runs first
  if (overlay) overlay.addEventListener("click", closeTable);
};

// --- NOVA FUNÇÃO: Renderizar Tabela ---
const renderTable = (index) => {
  const tbody = document.getElementById("geometry-table-body");
  if (!tbody) return;
  tbody.innerHTML = ""; // Limpa

  if (!allMoleculeVersions[index]) return;

  allMoleculeVersions[index].forEach((atom, i) => {
    const row = document.createElement("tr");
    row.className = "bg-[#f5f5f5] border-b hover:bg-gray-50";

    // Colunas: #, Símbolo, X, Y, Z
    row.innerHTML = `
            <td class="px-4 py-2 font-medium text-[#252525] whitespace-nowrap">${i}</td>
            <td class="px-4 py-2">${atom.symbol}</td>
            <td class="px-4 py-2 font-mono text-xs">${atom.vec.x.toFixed(
              6
            )}</td>
            <td class="px-4 py-2 font-mono text-xs">${atom.vec.y.toFixed(
              6
            )}</td>
            <td class="px-4 py-2 font-mono text-xs">${atom.vec.z.toFixed(
              6
            )}</td>
        `;
    tbody.appendChild(row);
  });
};

/**
 * Configura o botão hamburger e o clique fora para a sidebar móvel.
 */
const setupMobileSidebar = () => {
  const toggleBtn = document.getElementById("sidebar-toggle");
  const sidebar = document.getElementById("sidebar");
  const mainArea = document.getElementById("viewer-area"); // O <main>

  if (!toggleBtn || !sidebar || !mainArea) {
    console.warn("Elementos da sidebar móvel não encontrados.");
    return;
  }

  // Click no Hamburger: Alterna a visibilidade da sidebar
  toggleBtn.addEventListener("click", (e) => {
    e.stopPropagation(); // Impede o 'mainArea' de fechar imediatamente
    sidebar.classList.toggle("-translate-x-full");
  });

  // Click na Área Principal (Canvas): Fecha a sidebar
  mainArea.addEventListener("click", () => {
    // Verifica se a sidebar está aberta (não tem a classe)
    const isSidebarOpen = !sidebar.classList.contains("-translate-x-full");
    // Verifica se estamos em modo mobile (botão hamburger está visível)
    const isMobile = window.getComputedStyle(toggleBtn).display !== "none";

    if (isMobile && isSidebarOpen) {
      sidebar.classList.add("-translate-x-full");
    }
  });
};
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
  setupMobileSidebar();
  setupChartModal();
  setupTableWindow();
  // Estado inicial da UI
  populateVersionSelector(0, "Carregue um arquivo...");
  updateFileNameDisplay(null);
  updateEnergyDisplay(null); // Chama a função para ocultar/definir estado inicial
  setupFloatingToolbar();
};

// --- NOVA FUNÇÃO: Tornar Elemento Redimensionável (Customizado) ---
const makeElementResizable = (element, handle) => {
  // Configurações de Limites (Desktop)
  const MIN_WIDTH = 300;
  const MIN_HEIGHT = 250;
  const MAX_WIDTH = 800; // Limite máximo fixo ou relativo
  const MAX_HEIGHT = 600;

  let isResizing = false;
  let originalWidth = 0;
  let originalHeight = 0;
  let originalMouseX = 0;
  let originalMouseY = 0;

  handle.addEventListener("mousedown", (e) => {
    // Garante que só funciona no desktop
    if (window.innerWidth < 768) return;

    e.preventDefault();
    isResizing = true;

    // Captura dimensões atuais
    const rect = element.getBoundingClientRect();
    originalWidth = rect.width;
    originalHeight = rect.height;
    originalMouseX = e.pageX;
    originalMouseY = e.pageY;

    // Adiciona listeners globais para movimento suave
    document.addEventListener("mousemove", resize);
    document.addEventListener("mouseup", stopResize);
  });

  const resize = (e) => {
    if (!isResizing) return;

    // Calcula nova largura/altura baseada no deslocamento do mouse
    let newWidth = originalWidth + (e.pageX - originalMouseX);
    let newHeight = originalHeight + (e.pageY - originalMouseY);

    // Aplica os limites MÍNIMOS
    if (newWidth < MIN_WIDTH) newWidth = MIN_WIDTH;
    if (newHeight < MIN_HEIGHT) newHeight = MIN_HEIGHT;

    // Aplica os limites MÁXIMOS
    if (newWidth > MAX_WIDTH) newWidth = MAX_WIDTH;
    if (newHeight > MAX_HEIGHT) newHeight = MAX_HEIGHT;

    // Aplica ao elemento
    element.style.width = `${newWidth}px`;
    element.style.height = `${newHeight}px`;

    // Se houver um gráfico Chart.js dentro, ele redimensionará automaticamente
    // graças ao 'maintainAspectRatio: false' já configurado.
  };

  const stopResize = () => {
    isResizing = false;
    document.removeEventListener("mousemove", resize);
    document.removeEventListener("mouseup", stopResize);
  };
};

// --- Configurar o Modal do Gráfico ---
const setupChartModal = () => {
  const openBtn = document.getElementById("btn-grafico");
  const closeBtn = document.getElementById("close-chart-btn");
  const chartWindow = document.getElementById("chart-window");
  const chartHeader = document.getElementById("chart-header");
  const resizeHandle = document.getElementById("resize-handle"); // Pegamos a alça
  const canvas = document.getElementById("energyChart");
  const overlay = document.getElementById("chart-overlay");

  makeElementDraggable(chartWindow, chartHeader);

  // NOVO: Torna a janela redimensionável (aumentar/diminuir)
  if (resizeHandle && chartWindow) {
    makeElementResizable(chartWindow, resizeHandle);
  }

  // Função para fechar (usada pelo botão e pelo clique no overlay)
  const closeChart = () => {
    chartWindow.classList.add("hidden");
    if (overlay) overlay.classList.add("hidden"); // Esconde o overlay
  };

  if (openBtn) {
    openBtn.addEventListener("click", () => {
      if (cycleEnergies.length === 0) {
        alert(
          "Não há dados de energia para exibir. Carregue um arquivo primeiro."
        );
        return;
      }

      // Reset de posição para mobile
      if (window.innerWidth < 768) {
        chartWindow.style.top = "";
        chartWindow.style.left = "";
      }

      chartWindow.classList.remove("hidden");
      if (overlay) overlay.classList.remove("hidden"); // Mostra o overlay

      // Resetar tamanho padrão ao abrir
      chartWindow.style.width = "400px";
      chartWindow.style.height = "350px";
      renderChart(canvas);
    });
  }

  // Fecha ao clicar no X
  closeBtn.addEventListener("click", closeChart);

  // Fecha ao clicar no fundo escuro
  if (overlay) {
    overlay.addEventListener("click", closeChart);
  }
};

// --- Função para Tornar Elemento Arrastável (ATUALIZADO) ---

const makeElementDraggable = (element, handle) => {
  let pos1 = 0,
    pos2 = 0,
    pos3 = 0,
    pos4 = 0;

  handle.onmousedown = dragMouseDown;

  function dragMouseDown(e) {
    // Apenas para Desktop
    if (window.innerWidth < 768) return;

    e = e || window.event;
    e.preventDefault();

    // --- CORREÇÃO DO BUG DE ESTICAMENTO ---
    // 1. Pega a posição exata onde o elemento está AGORA visualmente
    const rect = element.getBoundingClientRect();

    // 2. Define top/left explícitos baseados na posição visual atual
    element.style.left = rect.left + "px";
    element.style.top = rect.top + "px";

    // 3. Remove as amarras do CSS que causam o conflito/esticamento
    element.style.bottom = "auto"; // Solta o fundo para não esticar
    element.style.transform = "none"; // Remove a centralização automática
    element.style.right = "auto"; // Garante que right não interfira
    // ---------------------------------------

    // Pega a posição inicial do mouse
    pos3 = e.clientX;
    pos4 = e.clientY;

    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;

    handle.style.cursor = "grabbing";
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();

    // Calcula o deslocamento do mouse
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Define a nova posição
    element.style.top = element.offsetTop - pos2 + "px";
    element.style.left = element.offsetLeft - pos1 + "px";
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
    handle.style.cursor = "grab";
  }
};

// ---Renderizar o Gráfico ---
const renderChart = (canvasElement) => {
  if (energyChartInstance) {
    energyChartInstance.destroy(); // Destrói o anterior para não sobrepor
  }

  const chartConfig = prepareChartData(cycleEnergies);

  // Ajuste fino para responsividade do Chart.js dentro do modal
  const config = {
    type: "line",
    data: chartConfig,
    options: {
      responsive: true,
      maintainAspectRatio: false,
      scales: {
        y: {
          beginAtZero: false, // Energias geralmente não começam em 0
          title: {
            display: true,
            text: "Energia (Hartree)",
            font: {
              weight: "bold",
              family: "'Roboto Mono', monospace",
              size: 14,
            },
          },
        },
        x: {
          title: {
            display: true,
            text: "Ciclos",
            font: {
              weight: "bold",
              family: "'Roboto Mono', monospace",
              size: 14,
            },
          },
        },
      },
      plugins: {
        tooltip: {
          callbacks: {
            label: function (context) {
              return `Energia: ${context.parsed.y.toFixed(6)} Eh`;
            },
          },
        },
      },
    },
  };

  energyChartInstance = new Chart(canvasElement, config);
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
  currentCycleIndex = index; // Salva o índice globalmente
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
    clearAllLabels();
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

  // ATUALIZADO: Se a tabela estiver aberta, atualize-a
  const tableWindow = document.getElementById("table-window");
  if (tableWindow && !tableWindow.classList.contains("hidden")) {
    renderTable(index);
  }
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

const initThreeJS = () => {
  try {
    scene = new THREE.Scene();
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

    initializeAtomLabels(scene, camera, renderer, moleculeGroup);

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
