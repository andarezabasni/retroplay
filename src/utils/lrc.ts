export interface LrcLine {
  time: number; // seconds
  text: string;
}

export function parseLrc(lrcContent: string): LrcLine[] {
  const lines: LrcLine[] = [];
  const regex = /\[(\d{2}):(\d{2})\.(\d{2,3})\]\s*(.*)/;

  for (const raw of lrcContent.split('\n')) {
    const match = raw.match(regex);
    if (match) {
      const minutes = parseInt(match[1], 10);
      const seconds = parseInt(match[2], 10);
      const ms = match[3].length === 2
        ? parseInt(match[3], 10) * 10
        : parseInt(match[3], 10);
      const time = minutes * 60 + seconds + ms / 1000;
      const text = match[4].trim();
      if (text) {
        lines.push({ time, text });
      }
    }
  }

  return lines.sort((a, b) => a.time - b.time);
}

export function findActiveLine(lines: LrcLine[], currentTime: number): number {
  if (lines.length === 0) return -1;

  for (let i = lines.length - 1; i >= 0; i--) {
    if (currentTime >= lines[i].time) {
      return i;
    }
  }
  return -1;
}
