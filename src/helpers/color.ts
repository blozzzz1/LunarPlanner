// Тип RGB цвета
type RGB = [number, number, number];

// Сопоставление высоты и RGB цвета по легенде
export const elevationRgbMap: { elevation: number, color: RGB }[] = [
    { elevation: 8400, color: [250, 250, 250] },
    { elevation: 8400, color: [250, 180, 155] },
    { elevation: 7670, color: [249, 95, 95] },
    { elevation: 6940, color: [254, 0, 0] },
    { elevation: 6210, color: [231, 70, 0] },
    { elevation: 5480, color: [250, 140, 0] },
    { elevation: 4750, color: [254, 230, 10] },
    { elevation: 4020, color: [230, 170, 21] },
    { elevation: 3290, color: [190, 130, 31] },
    { elevation: 2560, color: [159, 100, 24] },
    { elevation: 2240, color: [130, 80, 21] },
    { elevation: 1920, color: [75, 47, 34] },
    { elevation: 1600, color: [99, 100, 60] },
    { elevation: 1280, color: [120, 150, 86] },
    { elevation: 960, color: [90, 175, 74] },
    { elevation: 640, color: [66, 200, 75] },
    { elevation: 320, color: [150, 220, 150] },
    { elevation: 0, color: [210, 220, 211] },
    { elevation: -320, color: [210, 220, 211] },
    { elevation: -640, color: [120, 189, 220] },
    { elevation: -960, color: [61, 190, 221] },
    { elevation: -1280, color: [90, 225, 245] },
    { elevation: -1600, color: [31, 224, 255] },
    { elevation: -1920, color: [32, 190, 255] },
    { elevation: -2240, color: [32, 150, 240] },
    { elevation: -2560, color: [15, 110, 220] },
    { elevation: -2890, color: [15, 110, 220] },
    { elevation: -3290, color: [16, 64, 200] },
    { elevation: -4020, color: [32, 16, 200] },
    { elevation: -4750, color: [80, 30, 145] },
    { elevation: -5480, color: [134, 79, 181] },
    { elevation: -6210, color: [170, 113, 216] },
    { elevation: -6940, color: [189, 109, 158] },
    { elevation: -7670, color: [218, 122, 206] },
    { elevation: -8200, color: [32, 32, 32] }
];

// Вычисление расстояния между двумя цветами
function getColorDistance(a: RGB, b: RGB): number {
    return Math.sqrt(
        (a[0] - b[0]) ** 2 +
        (a[1] - b[1]) ** 2 +
        (a[2] - b[2]) ** 2
    );
}

// Интерполяция высоты по цвету пикселя
export function getElevationFromColor(r: number, g: number, b: number): number | null {
    const target: RGB = [r, g, b];
    const distances = elevationRgbMap.map((entry) => ({
        elevation: entry.elevation,
        color: entry.color,
        dist: getColorDistance(entry.color, target)
    }));

    distances.sort((a, b) => a.dist - b.dist);

    const [first, second] = distances;

    if (!first || !second || first.dist === 0) {
        return first?.elevation ?? null;
    }

    const t = first.dist / (first.dist + second.dist);
    return first.elevation * (1 - t) + second.elevation * t;
}