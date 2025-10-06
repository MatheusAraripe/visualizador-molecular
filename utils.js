import * as THREE from "three";

/**
 * Carrega o arquivo de texto do servidor.
 * @param {string} url - O caminho para o arquivo de dados.
 * @returns {Promise<string>} O conteúdo do arquivo como texto.
 */
export const loadMoleculeFile = async (url) => {
  const response = await fetch(url);
  if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
  return await response.text();
};

/**
 * Processa um único bloco de texto e extrai as coordenadas dos átomos.
 * @param {string} blockText - Um bloco de texto contendo as coordenadas de uma versão da molécula.
 * @returns {Array<object>} Um array de objetos de átomos.
 */
const parseSingleMolecule = (blockText) => {
  const atoms = [];
  for (const line of blockText.split("\n")) {
    const parts = line.trim().split(/\s+/);
    if (parts.length === 4) {
      const symbol = parts[0].toUpperCase();
      const [x, y, z] = parts.slice(1).map(parseFloat);
      if (!isNaN(x) && /^[A-Z]{1,2}$/.test(symbol)) {
        atoms.push({ symbol, vec: new THREE.Vector3(x, y, z) });
      }
    }
  }
  return atoms;
};

/**
 * Separa o arquivo de texto em blocos, um para cada ciclo, e os processa.
 * @param {string} text - O conteúdo completo do arquivo de dados.
 * @returns {Array<Array<object>>} Um array contendo as listas de átomos de cada versão.
 */
export const parseAllVersions = (text) => {
  return text
    .split("GEOMETRY OPTIMIZATION CYCLE")
    .slice(1)
    .map((block) => parseSingleMolecule(block));
};

/**
 * Calcula o centro geométrico de um conjunto de átomos.
 * @param {Array<object>} atoms - Um array de objetos de átomos.
 * @returns {THREE.Vector3} O vetor do centro geométrico.
 */
export const calculateCenter = (atoms) => {
  const center = new THREE.Vector3();
  if (atoms.length === 0) return center;
  atoms.forEach((atom) => center.add(atom.vec));
  return center.divideScalar(atoms.length);
};
