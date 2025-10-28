import * as THREE from "three";

/**
 * Carrega um arquivo de texto do servidor.
 */
export const loadMoleculeFile = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.text();
};

/**
 * Processa um único bloco de texto de ciclo e extrai as coordenadas.
 * (Mantida para a visualização da molécula)
 */
const parseSingleMoleculeAtoms = (blockText) => {
  const atoms = [];
  const lines = blockText.split("\n");
  let foundCoordinates = false;
  const coordsMarker = "CARTESIAN COORDINATES (ANGSTROEM)";

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (trimmedLine.includes(coordsMarker)) {
      foundCoordinates = true;
      continue;
    }
    if (foundCoordinates && trimmedLine.startsWith("---")) {
      continue;
    }
    if (!foundCoordinates) {
      continue;
    }

    const parts = trimmedLine.split(/\s+/);
    if (parts.length === 4) {
      const symbol = parts[0].toUpperCase();
      const [x, y, z] = parts.slice(1).map(parseFloat);
      if (!isNaN(x) && /^[A-Z]{1,2}$/.test(symbol)) {
        atoms.push({ symbol, vec: new THREE.Vector3(x, y, z) });
      } else if (atoms.length > 0) {
        break; // Assume fim do bloco de átomos
      }
    } else if (atoms.length > 0) {
      break; // Assume fim do bloco de átomos
    }
  }
  return atoms; // Retorna apenas os átomos
};

/**
 * Separa o arquivo em blocos de ciclo e processa os átomos de cada um.
 * (Mantida para a visualização da molécula)
 */
export const parseAllVersions = (text) => {
  return text
    .split("GEOMETRY OPTIMIZATION CYCLE")
    .slice(1)
    .map((block) => parseSingleMoleculeAtoms(block)) // Usa a função de átomos
    .filter((atoms) => atoms.length > 0); // Filtra ciclos sem átomos
};

/**
 * Calcula o centro geométrico.
 */
export const calculateCenter = (atoms) => {
  const center = new THREE.Vector3();
  if (!atoms || atoms.length === 0) return center;
  atoms.forEach((atom) => center.add(atom.vec));
  return center.divideScalar(atoms.length);
};

/**
 * Extrai apenas as energias de cada ciclo do texto.
 * @param {string} text - O conteúdo completo do arquivo.
 * @returns {Array<number | null>} Um array com as energias (ou null se não encontrada).
 */
export const extractCycleEnergies = (text) => {
  const cycleBlocks = text.split("GEOMETRY OPTIMIZATION CYCLE").slice(1);
  const energies = [];
  const energyMarker = "Total Energy after SMD CDS correction =";

  for (const block of cycleBlocks) {
    let foundEnergy = null; // Energia para este ciclo específico
    const lines = block.split("\n");
    for (const line of lines) {
      const trimmedLine = line.trim();
      if (trimmedLine.startsWith(energyMarker)) {
        const parts = trimmedLine.split("=");
        if (parts.length > 1) {
          const valueString = parts[1].trim().split(/\s+/)[0];
          const parsedEnergy = parseFloat(valueString);
          if (!isNaN(parsedEnergy)) {
            foundEnergy = parsedEnergy;
            break; // Encontrou a energia para este bloco, vai para o próximo
          }
        }
      }
    }
    energies.push(foundEnergy); // Adiciona a energia (ou null) ao array
  }
  return energies;
};
