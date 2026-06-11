class PitchDetector {
  constructor(sampleRate = 44100) {
    this.sampleRate = sampleRate;
    this.threshold = 0.1;
  }

  getPitch(audioBuffer) {
    const yinBuffer = this.yin(audioBuffer);
    const tau = this.absoluteThreshold(yinBuffer);
    if (tau === -1) return null;
    const interpolatedTau = this.parabolicInterpolation(yinBuffer, tau);
    return this.sampleRate / interpolatedTau;
  }

  yin(buffer) {
    const length = buffer.length;
    const halfLength = Math.floor(length / 2);
    const result = new Float32Array(halfLength);

    let sum = 0;
    for (let tau = 0; tau < halfLength; tau++) {
      for (let j = 0; j < halfLength; j++) {
        const diff = buffer[j] - buffer[j + tau];
        sum += diff * diff;
      }
      result[tau] = sum;
      sum = 0;
    }

    if (result[0] > 0) {
      result[0] = 1;
      for (let tau = 1; tau < halfLength; tau++) {
        result[tau] = result[tau] / ((result[0] / 1) * tau);
      }
    }

    const runningSum = 0;
    for (let tau = 1; tau < halfLength; tau++) {
      result[tau] = result[tau] * (tau / (runningSum + tau));
    }

    return result;
  }

  absoluteThreshold(yinBuffer) {
    const length = yinBuffer.length;
    let tau = 2;
    while (tau < length) {
      if (yinBuffer[tau] < this.threshold) {
        while (tau + 1 < length && yinBuffer[tau + 1] < yinBuffer[tau]) {
          tau++;
        }
        return tau;
      }
      tau++;
    }
    if (yinBuffer[0] < this.threshold) return 0;
    return -1;
  }

  parabolicInterpolation(yinBuffer, tau) {
    if (tau < 1 || tau >= yinBuffer.length - 1) return tau;
    const s0 = yinBuffer[tau - 1];
    const s1 = yinBuffer[tau];
    const s2 = yinBuffer[tau + 1];
    const denominator = 2 * (2 * s1 - s0 - s2);
    if (denominator === 0) return tau;
    return tau + (s0 - s2) / denominator;
  }
}

const NOTE_FREQUENCIES = {
  'C0': 16.35, 'C#0': 17.32, 'D0': 18.35, 'D#0': 19.45, 'E0': 20.60, 'F0': 21.83,
  'F#0': 23.12, 'G0': 24.50, 'G#0': 25.96, 'A0': 27.50, 'A#0': 29.14, 'B0': 30.87,
  'C1': 32.70, 'C#1': 34.65, 'D1': 36.71, 'D#1': 38.89, 'E1': 41.20, 'F1': 43.65,
  'F#1': 46.25, 'G1': 49.00, 'G#1': 51.91, 'A1': 55.00, 'A#1': 58.27, 'B1': 61.74,
  'C2': 65.41, 'C#2': 69.30, 'D2': 73.42, 'D#2': 77.78, 'E2': 82.41, 'F2': 87.31,
  'F#2': 92.50, 'G2': 98.00, 'G#2': 103.83, 'A2': 110.00, 'A#2': 116.54, 'B2': 123.47,
  'C3': 130.81, 'C#3': 138.59, 'D3': 146.83, 'D#3': 155.56, 'E3': 164.81, 'F3': 174.61,
  'F#3': 185.00, 'G3': 196.00, 'G#3': 207.65, 'A3': 220.00, 'A#3': 233.08, 'B3': 246.94,
  'C4': 261.63, 'C#4': 277.18, 'D4': 293.66, 'D#4': 311.13, 'E4': 329.63, 'F4': 349.23,
  'F#4': 369.99, 'G4': 392.00, 'G#4': 415.30, 'A4': 440.00, 'A#4': 466.16, 'B4': 493.88,
  'C5': 523.25, 'C#5': 554.37, 'D5': 587.33, 'D#5': 622.25, 'E5': 659.25, 'F5': 698.46,
  'F#5': 739.99, 'G5': 783.99, 'G#5': 830.61, 'A5': 880.00, 'A#5': 932.33, 'B5': 987.77,
  'C6': 1046.50, 'C#6': 1108.73, 'D6': 1174.66, 'D#6': 1244.51, 'E6': 1318.51, 'F6': 1396.91,
  'F#6': 1479.98, 'G6': 1567.98, 'G#6': 1661.22, 'A6': 1760.00, 'A#6': 1864.66, 'B6': 1975.53,
  'C7': 2093.00, 'C#7': 2217.46, 'D7': 2349.32, 'D#7': 2489.02, 'E7': 2637.02, 'F7': 2793.83,
  'F#7': 2959.96, 'G7': 3135.96, 'G#7': 3322.44, 'A7': 3520.00, 'A#7': 3729.31, 'B7': 3951.07,
  'C8': 4186.01,
};

class Scorer {
  constructor() {
    this.totalNotes = 0;
    this.correctNotes = 0;
    this.scoreHistory = [];
  }

  getNoteName(frequency) {
    if (!frequency || frequency < 16) return null;
    let closestNote = 'A4';
    let closestDiff = Infinity;
    for (const [name, freq] of Object.entries(NOTE_FREQUENCIES)) {
      const diff = Math.abs(frequency - freq);
      if (diff < closestDiff) {
        closestDiff = diff;
        closestNote = name;
      }
    }
    return closestNote;
  }

  scoreNote(detectedFreq, expectedNote) {
    if (!detectedFreq || !expectedNote) return null;
    const expectedFreq = NOTE_FREQUENCIES[expectedNote];
    if (!expectedFreq) return null;

    this.totalNotes++;

    const ratio = detectedFreq / expectedFreq;
    const semitones = 12 * Math.log2(ratio);
    const absSemitones = Math.abs(semitones);

    let score = 0;
    if (absSemitones <= 0.5) {
      score = 100;
      this.correctNotes++;
    } else if (absSemitones <= 1) {
      score = 70;
    } else if (absSemitones <= 2) {
      score = 40;
    } else if (absSemitones <= 3) {
      score = 20;
    }

    this.scoreHistory.push({ semitones: absSemitones, score, detectedFreq, expectedNote });
    return { score, semitones: absSemitones, detectedNote: this.getNoteName(detectedFreq) };
  }

  getAccuracy() {
    if (this.totalNotes === 0) return 0;
    return Math.round((this.correctNotes / this.totalNotes) * 100);
  }

  reset() {
    this.totalNotes = 0;
    this.correctNotes = 0;
    this.scoreHistory = [];
  }
}
