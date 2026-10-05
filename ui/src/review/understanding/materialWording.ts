export const campName = (color: "w" | "b") => color === "w" ? "Blancs" : "Noirs";
export const points = (value: number) => `${value < 0 ? "−" : value > 0 ? "+" : ""}${Math.abs(value)} ${Math.abs(value) === 1 ? "point" : "points"}`;
