import * as THREE from "three";

/**
 * Carrega um arquivo de texto do servidor (usado para o arquivo padrão).
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
 * Esta função agora procura pelo cabeçalho "CARTESIAN COORDINATES"
 * e para de ler quando o bloco de coordenadas termina.
 * @param {string} blockText - Um bloco de texto contendo as coordenadas de uma versão da molécula.
 * @returns {Array<object>} Um array de objetos de átomos.
 */
const parseSingleMolecule = (blockText) => {
  const atoms = [];
  const lines = blockText.split("\n");
  let foundCoordinates = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    // 1. Procura pelo início do bloco de coordenadas
    if (trimmedLine.includes("CARTESIAN COORDINATES (ANGSTROEM)")) {
      foundCoordinates = true;
      continue; // Pula a linha do cabeçalho
    }

    // 2. Pula linhas de separação (ex: '---')
    if (foundCoordinates && trimmedLine.startsWith("---")) {
      continue;
    }

    // 3. Se não encontrou o cabeçalho ainda, continua procurando
    if (!foundCoordinates) {
      continue;
    }

    // 4. Se encontrou o cabeçalho, tenta processar a linha como um átomo
    const parts = trimmedLine.split(/\s+/);
    if (parts.length === 4) {
      const symbol = parts[0].toUpperCase();
      const [x, y, z] = parts.slice(1).map(parseFloat);

      // Verifica se é uma linha de átomo válida
      if (!isNaN(x) && /^[A-Z]{1,2}$/.test(symbol)) {
        atoms.push({ symbol, vec: new THREE.Vector3(x, y, z) });
      } else if (atoms.length > 0) {
        // Se a linha não é um átomo e já tínhamos átomos, o bloco terminou
        break;
      }
    } else if (atoms.length > 0) {
      // Se a linha não tem 4 partes e já tínhamos átomos, o bloco terminou
      break;
    }
  }
  return atoms;
};

/**
 * Separa o arquivo de texto em blocos, um para cada ciclo, e os processa.
 * Esta função usa "GEOMETRY OPTIMIZATION CYCLE" como delimitador.
 * @param {string} text - O conteúdo completo do arquivo de dados.
 * @returns {Array<Array<object>>} Um array contendo as listas de átomos de cada versão.
 */
export const parseAllVersions = (text) => {
  return text
    .split("GEOMETRY OPTIMIZATION CYCLE")
    .slice(1) // Ignora o texto antes do primeiro ciclo
    .map((block) => parseSingleMolecule(block)) // Processa cada bloco
    .filter((atoms) => atoms.length > 0); // Remove "ciclos" onde nenhum átomo foi encontrado
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
