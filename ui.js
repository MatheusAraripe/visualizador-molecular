import * as THREE from "three";

// Estado local
let labelsGroup;
let raycaster;
let mouse;
let camera;
let renderer;
let moleculeGroup;

// AGORA USAMOS UM MAP PARA GUARDAR MÚLTIPLOS RÓTULOS
// Chave: ID do átomo (ex: 1, 2, 3...)
// Valor: O objeto Sprite 3D correspondente
let activeLabels = new Map();

/**
 * Inicializa o sistema de UI para rótulos de átomos.
 */
export const initializeAtomLabels = (scene, cam, rend, molGroup) => {
  camera = cam;
  renderer = rend;
  moleculeGroup = molGroup;

  // Inicializa ferramentas do Three.js
  raycaster = new THREE.Raycaster();
  mouse = new THREE.Vector2();

  // Cria um grupo específico para os labels e adiciona à cena
  labelsGroup = new THREE.Group();
  scene.add(labelsGroup);

  // Adiciona o ouvinte de clique global ao canvas
  renderer.domElement.addEventListener("mousedown", onAtomClick);
};

/**
 * Função interna para lidar com o clique
 */
const onAtomClick = (event) => {
  // Evita calcular se não houver renderizador ativo
  if (!renderer || !camera) return;

  const rect = renderer.domElement.getBoundingClientRect();
  mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
  mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

  raycaster.setFromCamera(mouse, camera);

  const intersects = raycaster.intersectObjects(
    moleculeGroup.children.filter((c) => c.geometry?.type === "SphereGeometry"),
    false
  );

  if (intersects.length > 0) {
    const clickedAtom = intersects[0].object;
    const atomIndex = clickedAtom.userData.atomIndex;

    if (atomIndex === undefined) return;

    // Chama a função de alternância
    toggleLabel(atomIndex, clickedAtom.position);
  }
};

/**
 * Cria ou remove o rótulo (Lógica Atualizada)
 */
const toggleLabel = (index, position) => {
  // Ajuste o índice para exibição (começando em 1)
  const displayIndex = index + 1;

  // VERIFICAÇÃO: O átomo já tem um rótulo ativo?
  if (activeLabels.has(displayIndex)) {
    // SIM -> REMOVE O RÓTULO ESPECÍFICO
    const labelToRemove = activeLabels.get(displayIndex);
    labelsGroup.remove(labelToRemove); // Tira da cena 3D
    activeLabels.delete(displayIndex); // Tira da nossa lista de controle
  } else {
    // NÃO -> CRIA E ADICIONA O RÓTULO
    const labelSprite = createTextSprite(displayIndex.toString());

    // Posiciona levemente acima do átomo
    labelSprite.position.copy(position).add(new THREE.Vector3(0, 0.6, 0));
    labelSprite.userData.targetIndex = displayIndex;

    labelsGroup.add(labelSprite); // Adiciona na cena
    activeLabels.set(displayIndex, labelSprite); // Salva na lista de controle
  }
};

/**
 * Gera a textura de texto usando Canvas
 */
const createTextSprite = (message) => {
  const borderThickness = 4;
  const fontSize = 24;
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");

  context.font = "Bold " + fontSize + "px Arial";
  const metrics = context.measureText(message);
  const textWidth = metrics.width;

  canvas.width = textWidth + borderThickness * 2 + 20;
  canvas.height = fontSize * 1.4 + borderThickness * 2;

  // Fundo
  // context.fillStyle = "rgba(0, 0, 0, 0.7)";
  // context.strokeStyle = "rgba(0, 0, 0, 0.7)";
  // context.lineWidth = borderThickness;

  // roundRect(
  //   context,
  //   borderThickness / 2,
  //   borderThickness / 2,
  //   canvas.width - borderThickness,
  //   canvas.height - borderThickness,
  //   6
  // );
  // context.fillStyle = "rgba(0, 0, 0, 0.7)";
  // context.fill();

  // Texto
  context.font =
    "Bold " +
    fontSize +
    "px SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', 'Courier New'";
  context.fillStyle = "#000000ff";
  context.textAlign = "center";
  context.textBaseline = "middle";
  context.fillText(message, canvas.width / 2, canvas.height / 2);

  const texture = new THREE.CanvasTexture(canvas);
  const spriteMaterial = new THREE.SpriteMaterial({ map: texture });
  const sprite = new THREE.Sprite(spriteMaterial);

  sprite.scale.set(0.5 * (canvas.width / canvas.height), 0.5, 1);

  return sprite;
};

const roundRect = (ctx, x, y, w, h, r) => {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
};

/**
 * Limpa TODOS os labels (útil ao trocar de arquivo/ciclo)
 */
export const clearAllLabels = () => {
  if (labelsGroup) {
    labelsGroup.clear(); // Limpa visualmente do Three.js
  }
  if (activeLabels) {
    activeLabels.clear(); // Limpa a memória do Map
  }
};
