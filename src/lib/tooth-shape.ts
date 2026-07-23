import { isDecidua } from "@/lib/odonto";

/** Geometria de coroa+raiz (vista frontal/labial) por tipo de dente FDI. */

export type ToothType = "molar" | "premolar" | "canine" | "incisor";

export function toothType(d: number): ToothType {
  const p = d % 10; // 1..8 (permanente) ou 1..5 (decíduo)
  if (p >= 6) return "molar";
  if (p >= 4) return isDecidua(d) ? "molar" : "premolar"; // decíduos 4,5 são molares
  if (p === 3) return "canine";
  return "incisor";
}

export interface ToothShape {
  crownPath: string;
  rootPath: string;
  cx0: number;
  crownY: number;
  cw: number;
  ch: number;
  vbW: number;
  vbH: number;
}

export function toothShape(dente: number, superior: boolean): ToothShape {
  const type = toothType(dente);
  const vbW = 40;
  const vbH = 90;
  const chByType: Record<ToothType, number> = { molar: 26, premolar: 26, canine: 30, incisor: 28 };
  const rhByType: Record<ToothType, number> = { molar: 40, premolar: 44, canine: 50, incisor: 42 };
  const cwByType: Record<ToothType, number> = { molar: 30, premolar: 22, canine: 19, incisor: 18 };
  const ch = chByType[type];
  const rootH = rhByType[type];
  const cw = cwByType[type];
  const cx0 = (vbW - cw) / 2;
  const topPad = 6;
  const crownY = superior ? topPad + rootH : topPad;
  const rootNeck = superior ? crownY : crownY + ch;
  const rootTip = superior ? topPad : crownY + ch + rootH;
  const cx = cx0 + cw / 2;

  const crownPath = buildCrownPath(type, cx0, crownY, cw, ch, superior);

  let rootPath = "";
  const single = (x: number, w: number, curve = 0) =>
    singleRootPath(x, w, rootNeck, rootTip, superior, curve);
  if (type === "molar") {
    if (superior) {
      rootPath = [single(cx0 + 5, 6, -3), single(cx0 + cw - 5, 6, 3), single(cx, 5.5, 0)].join(" ");
    } else {
      rootPath = [single(cx0 + 7, 7, -3), single(cx0 + cw - 7, 7, 3)].join(" ");
    }
  } else if (type === "premolar") {
    rootPath = single(cx, 7.5);
  } else if (type === "canine") {
    rootPath = single(cx, 7);
  } else {
    rootPath = single(cx, 6.5);
  }

  return { crownPath, rootPath, cx0, crownY, cw, ch, vbW, vbH };
}

export function buildCrownPath(
  type: ToothType,
  cx0: number,
  crownY: number,
  cw: number,
  ch: number,
  superior: boolean,
): string {
  const neckY = superior ? crownY : crownY + ch;
  const edgeY = superior ? crownY + ch : crownY;
  const dir = superior ? 1 : -1;
  const neckShrink = type === "molar" ? 0.06 : type === "premolar" ? 0.08 : 0.1;
  const nxL = cx0 + cw * neckShrink;
  const nxR = cx0 + cw - cw * neckShrink;
  const rEdge = type === "molar" ? 2.5 : type === "premolar" ? 2.5 : type === "canine" ? 2.5 : 2;
  const eL = cx0 + rEdge;
  const eR = cx0 + cw - rEdge;
  const cx = cx0 + cw / 2;
  const bulgeShift = 0.6;
  const bulgeY = superior ? neckY + ch * 0.55 : neckY - ch * 0.55;
  const bxL = cx0 - bulgeShift;
  const bxR = cx0 + cw + bulgeShift;

  function edge(): string {
    if (type === "molar") {
      const seg = (eR - eL) / 4;
      const cusp = 1.4;
      const valley = 0.9;
      const parts: string[] = [];
      for (let i = 0; i < 4; i++) {
        const x0 = eL + seg * i;
        const x1 = eL + seg * (i + 1);
        const mid = (x0 + x1) / 2;
        parts.push(`Q ${mid},${edgeY + dir * cusp} ${x1},${edgeY}`);
        if (i < 3) parts.push(`Q ${x1},${edgeY - dir * valley} ${x1 + 0.01},${edgeY}`);
      }
      return parts.join(" ");
    }
    if (type === "premolar") {
      const cusp = 1.8;
      const mid = (eL + eR) / 2;
      return [
        `Q ${(eL + mid) / 2},${edgeY + dir * cusp} ${mid},${edgeY}`,
        `Q ${(mid + eR) / 2},${edgeY + dir * cusp} ${eR},${edgeY}`,
      ].join(" ");
    }
    if (type === "canine") {
      const tip = 4;
      return [`L ${cx},${edgeY + dir * tip}`, `L ${eR},${edgeY}`].join(" ");
    }
    return `L ${eR},${edgeY}`;
  }

  return [
    `M ${nxL},${neckY}`,
    `C ${bxL},${bulgeY} ${cx0},${edgeY} ${eL},${edgeY}`,
    edge(),
    `C ${cx0 + cw},${edgeY} ${bxR},${bulgeY} ${nxR},${neckY}`,
    `Z`,
  ].join(" ");
}

export function singleRootPath(
  x: number,
  width: number,
  neckY: number,
  tipY: number,
  superior: boolean,
  curveX = 0,
): string {
  const half = width / 2;
  const tipHalf = 1.0;
  const tipX = x + curveX;
  const sign = superior ? 1 : -1;
  const shoulderY = neckY - sign * 2;
  const preTipY = tipY + sign * 3;
  return [
    `M ${x - half},${shoulderY}`,
    `L ${tipX - tipHalf},${preTipY}`,
    `Q ${tipX},${tipY} ${tipX + tipHalf},${preTipY}`,
    `L ${x + half},${shoulderY}`,
    `Q ${x},${neckY + sign * 0.5} ${x - half},${shoulderY}`,
    `Z`,
  ].join(" ");
}
