import * as THREE from "three";

export const extractIRData = (text) => {
  const lines = text.split("\n");
  const peaks = [];
  let inSection = false;

  for (const line of lines) {
    // Detecta o início da seção
    if (line.includes("IR SPECTRUM")) {
      inSection = true;
      continue;
    }

    if (inSection) {
      // Pula linhas de cabeçalho ou separadores
      if (line.includes("------") || line.includes("Mode")) continue;

      // Detecta o fim da seção (linha vazia ou início de texto descritivo)
      if (line.trim() === "" || line.includes("The first frequency")) {
        if (peaks.length > 0) break;
        continue;
      }

      const parts = line.trim().split(/\s+/);
      // Formato esperado: "6: 15.44 ..."
      // parts[0]: "6:", parts[1]: freq, parts[3]: int
      if (parts.length > 3 && parts[0].includes(":")) {
        const freq = parseFloat(parts[1]);
        const inten = parseFloat(parts[3]);

        if (!isNaN(freq) && !isNaN(inten)) {
          peaks.push({ freq, inten });
        }
      }
    }
  }
  return peaks;
};

/**
 * @param {Array} peaks - Array de objetos {freq, inten}
 * @param {number} fwhm - Largura à meia altura (padrão 20 cm-1)
 * @param {number} resolution - Resolução em cm-1 (padrão 1)
 */
export const generateIRSpectrumPoints = (peaks, fwhm = 20, resolution = 1) => {
  if (!peaks || peaks.length === 0) return { labels: [], data: [] };

  // Define o intervalo do eixo X (Wavenumber)
  const freqs = peaks.map((p) => p.freq);
  const minFreq = Math.min(...freqs);
  const maxFreq = Math.max(...freqs);

  // Margem de 100 cm-1 nas bordas
  const startX = Math.max(0, Math.floor(minFreq) - 100);
  const endX = Math.ceil(maxFreq) + 100;

  const labels = [];
  const data = [];
  const gamma = fwhm / 2; // HWHM

  // Calcula a intensidade em cada ponto X somando a contribuição de cada pico
  for (let x = startX; x <= endX; x += resolution) {
    let y = 0;
    for (const peak of peaks) {
      // Fórmula Lorentziana
      y +=
        (peak.inten * gamma) /
        (Math.PI * (Math.pow(x - peak.freq, 2) + Math.pow(gamma, 2)));
    }
    labels.push(x);
    data.push(y);
  }

  // Prepara objeto para o Chart.js
  return {
    labels: labels,
    datasets: [
      {
        label: "Espectro Infravermelho",
        data: data,
        borderColor: "#ef4444", // Vermelho (red-500)
        backgroundColor: "rgba(239, 68, 68, 0.1)",
        borderWidth: 2,
        pointRadius: 0, // Remove bolinhas para parecer uma linha contínua
        pointHoverRadius: 4,
        fill: true,
        tension: 0.4,
      },
    ],
  };
};

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
  let atomIndex = 1;
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
        atoms.push({
          symbol,
          index: atomIndex++,
          vec: new THREE.Vector3(x, y, z),
        });
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

/**
 * Prepara os dados de energia para o Chart.js.
 * @param {Array<number>} energies - Array com os valores de energia.
 * @returns {Object} Objeto de configuração para o Chart.js.
 */
export const prepareChartData = (energies) => {
  // Filtra valores nulos ou inválidos, mantendo o índice original se necessário,
  // mas para um gráfico linear sequencial, geralmente plotamos o que temos.
  // Aqui assumimos que o array energies corresponde aos ciclos 1, 2, 3...

  const labels = energies.map((_, index) => `Ciclo ${index + 1}`);
  const data = energies.map((e) => (e !== null && !isNaN(e) ? e : null));

  return {
    labels: labels,
    datasets: [
      {
        label: "Energia Total (Eh)",
        data: data,
        borderColor: "#0ea5e9", // Cor da linha (sky-500)
        backgroundColor: "rgba(14, 165, 233, 0.2)", // Cor de preenchimento abaixo da linha
        borderWidth: 2,
        pointBackgroundColor: "#ffffff",
        pointBorderColor: "#0ea5e9",
        pointRadius: 4,
        pointHoverRadius: 6,
        fill: true,
        tension: 0.1, // Suavização da linha
      },
    ],
  };
};

/**
 * Extrai o *último* bloco de cargas CHELPG de um arquivo de texto.
 * @param {string} text - O conteúdo completo do arquivo.
 * @returns {Array<number>} Um array com os valores das cargas.
 */
export const extractLastChelpgCharges = (text) => {
  const chargeBlocks = text.split("CHELPG Charges");
  if (chargeBlocks.length < 2) {
    // Não encontrou nenhum bloco "CHELPG Charges"
    return [];
  }

  const lastBlock = chargeBlocks[chargeBlocks.length - 1]; // Pega o último bloco
  const lines = lastBlock.split("\n");
  const charges = [];
  let foundStart = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!foundStart) {
      // Procura a linha '---' que marca o início dos dados
      if (trimmedLine.startsWith("---")) {
        foundStart = true;
      }
      continue; // Pula cabeçalho e a linha '---'
    }

    // Se encontrou o início, começa a ler
    const parts = trimmedLine.split(/\s+/); // Divide por espaços

    // Formato esperado: [index, Symbol, ':', charge] (4 partes)
    if (parts.length === 4 && parts[2] === ":") {
      const chargeValue = parseFloat(parts[3]);
      if (!isNaN(chargeValue)) {
        charges.push(chargeValue);
      }
    } else if (trimmedLine.startsWith("---")) {
      // Se encontrou outra linha '---', é o fim do bloco
      break;
    }
  }
  return charges;
};

/**
 * Extrai o *último* bloco de cargas MULLIKEN de um arquivo de texto.
 * @param {string} text - O conteúdo completo do arquivo.
 * @returns {Array<number>} Um array com os valores das cargas.
 */
export const extractLastMullikenCharges = (text) => {
  const chargeBlocks = text.split("MULLIKEN ATOMIC CHARGES");
  if (chargeBlocks.length < 2) {
    return []; // Nenhum bloco encontrado
  }

  const lastBlock = chargeBlocks[chargeBlocks.length - 1]; // Pega o último bloco
  const lines = lastBlock.split("\n");
  const charges = [];
  let foundStart = false;

  for (const line of lines) {
    const trimmedLine = line.trim();

    if (!foundStart) {
      // Procura a linha '---' que marca o início dos dados
      if (trimmedLine.startsWith("---")) {
        foundStart = true;
      }
      continue; // Pula cabeçalho e a linha '---'
    }

    // Se encontrou o início, começa a ler
    const parts = trimmedLine.split(/\s+/); // Divide por espaços

    // Formato esperado: [index, Symbol, ':', charge] (4 partes)
    if (parts.length === 4 && parts[2] === ":") {
      const chargeValue = parseFloat(parts[3]);
      if (!isNaN(chargeValue)) {
        charges.push(chargeValue);
      }
    } else if (
      trimmedLine.startsWith("---") ||
      trimmedLine.startsWith("Sum of atomic charges:")
    ) {
      // Fim do bloco
      break;
    }
  }
  return charges;
};
