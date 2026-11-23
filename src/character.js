import { CHARACTER, PAPER, INK, BREATH_SECONDS, BREATH_SCALE } from './config.js';

const LINE = 2.6; // pen width in drawing pixels, matched to the artwork's ink lines
const BOTTOM_SPACE = 150; // CSS px kept free for the chat line

export function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(`이미지를 불러오지 못함: ${url}`));
    image.src = url;
  });
}

// Draws the base drawing (eyes closed, no mouth) and paints a face on top from face parameters.
// All face drawing happens in the drawing's own pixel space, so coordinates match config.CHARACTER.
export class CharacterView {
  constructor(canvas, image) {
    this.canvas = canvas;
    this.context = canvas.getContext('2d');
    this.image = image;
    this.resize();
  }

  // topReserved: CSS px at the top already taken by UI (narrow screens stack the status above Emot).
  resize(topReserved = 0) {
    const ratio = Math.min(window.devicePixelRatio, 2);
    this.ratio = ratio;
    this.canvas.width = Math.round(window.innerWidth * ratio);
    this.canvas.height = Math.round(window.innerHeight * ratio);
    const free = window.innerHeight - BOTTOM_SPACE - topReserved;
    const share = topReserved ? 0.95 : CHARACTER.screenHeight; // stacked layout: use all the room left
    this.scale = Math.max(0.1, (free * share) / CHARACTER.height);
    this.offsetX = window.innerWidth / 2 - CHARACTER.centerX * this.scale;
    this.offsetY = topReserved + (free - CHARACTER.height * this.scale) * 0.8; // feet near the chat line
  }

  toScreen({ x, y }) {
    return { x: this.offsetX + x * this.scale, y: this.offsetY + y * this.scale };
  }

  hitTest(clientX, clientY) {
    const x = (clientX - this.offsetX) / this.scale;
    const y = (clientY - this.offsetY) / this.scale;
    const { x0, y0, x1, y1 } = CHARACTER.hit;
    return x >= x0 && x <= x1 && y >= y0 && y <= y1;
  }

  draw(face, time) {
    const context = this.context;
    context.setTransform(this.ratio, 0, 0, this.ratio, 0, 0);
    context.fillStyle = PAPER;
    context.fillRect(0, 0, window.innerWidth, window.innerHeight);

    context.translate(this.offsetX, this.offsetY);
    context.scale(this.scale, this.scale);
    // Breathing: stretch from the feet so the shoulders and head rise and fall.
    const breath = 1 + Math.sin((time / BREATH_SECONDS) * Math.PI * 2) * BREATH_SCALE;
    context.translate(0, CHARACTER.feetY);
    context.scale(1, breath);
    context.translate(0, -CHARACTER.feetY);

    // Multiply turns the drawing's white into the paper colour, so the figure sits on the page.
    context.globalCompositeOperation = 'multiply';
    context.drawImage(this.image, 0, 0);
    context.globalCompositeOperation = 'source-over';

    context.lineCap = 'round';
    context.lineJoin = 'round';
    drawGloom(context, face.gloom);
    drawEye(context, CHARACTER.leftEye, 1, face);
    drawEye(context, CHARACTER.rightEye, -1, face);
    drawMouth(context, face);
    drawBlush(context, face.blush);
    drawAnger(context, face.anger);
    drawSweat(context, face.sweat);
    drawSurprise(context, face.surprise);
  }
}

function inFaceSpace(context, point, draw) {
  context.save();
  context.translate(point.x, point.y);
  context.rotate(CHARACTER.headTilt);
  draw();
  context.restore();
}

// side: +1 for the eye on the viewer's left (its inner corner points right), -1 for the other.
function drawEye(context, center, side, face) {
  inFaceSpace(context, center, () => {
    const { width, height: fullHeight } = CHARACTER.eye;
    const height = fullHeight * face.eyeOpen;
    if (face.eyeOpen >= 0.12) { // below that the drawing's own closed lids show
      drawOpenEye(context, width, height, face);
      if (side === 1) drawMole(context);
    }
    drawBrow(context, side, face, height); // after the eye: the eye's paper fill would cover it
  });
}

function drawOpenEye(context, width, height, face) {
  // Paint over the drawing's closed lid and lashes, then draw the open eye.
  context.fillStyle = PAPER;
  context.beginPath();
  context.ellipse(0, 1, width + 4, Math.max(11, height + 2), 0, 0, Math.PI * 2);
  context.fill();

  context.beginPath();
  context.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  context.fill();
  context.save();
  context.clip();
  context.fillStyle = INK;
  context.beginPath();
  context.arc(face.gazeX * width * 0.55, face.gazeY * height * 0.5, CHARACTER.eye.pupil * face.pupilSize, 0, Math.PI * 2);
  context.fill();
  context.restore();

  context.strokeStyle = INK;
  context.lineWidth = LINE;
  context.beginPath();
  context.ellipse(0, 0, width, height, 0, 0, Math.PI * 2);
  context.stroke();
  context.lineWidth = LINE * 1.5; // heavier upper lid, like the reference art
  context.beginPath();
  context.ellipse(0, 0, width, height, 0, Math.PI * 1.05, Math.PI * 1.95);
  context.stroke();

  // Dark circles: part of the character's look.
  context.globalAlpha = 0.45;
  context.lineWidth = LINE * 0.7;
  context.beginPath();
  context.ellipse(0, height * 0.35, width * 0.85, height * 0.65 + 4, 0, Math.PI * 0.2, Math.PI * 0.8);
  context.stroke();
  context.globalAlpha = 1;
}

// The open eye covers the drawing's mole, so it is put back just below.
function drawMole(context) {
  context.fillStyle = INK;
  context.beginPath();
  context.arc(CHARACTER.mole.x, CHARACTER.mole.y, 2.4, 0, Math.PI * 2);
  context.fill();
}

function drawBrow(context, side, face, eyeHeight) {
  const full = CHARACTER.eye.height;
  const y = -(full + 5) - face.browHeight * 7 - Math.max(0, eyeHeight - full) * 0.4; // close to the lid so it reads apart from the bangs
  const outer = { x: -side * 20, y: y + face.browTilt * 2 };
  const inner = { x: side * 16, y: y - face.browTilt * 6 };
  context.strokeStyle = INK;
  context.lineWidth = LINE * 1.35;
  context.beginPath();
  context.moveTo(outer.x, outer.y);
  context.quadraticCurveTo(0, Math.min(outer.y, inner.y) - 3, inner.x, inner.y);
  context.stroke();
}

function drawMouth(context, face) {
  inFaceSpace(context, CHARACTER.mouth, () => {
    const half = 9 * face.mouthWidth;
    const curve = face.mouthCurve * 4;
    const left = { x: -half, y: -curve + face.mouthSkew * 1.5 };
    const right = { x: half, y: -curve - face.mouthSkew * 3 };
    context.strokeStyle = INK;
    context.lineWidth = LINE;
    context.beginPath();
    context.moveTo(left.x, left.y);
    if (face.mouthOpen < 0.12) {
      context.quadraticCurveTo(0, curve * 0.8, right.x, right.y);
      context.stroke();
      return;
    }
    const open = 9 * face.mouthOpen;
    context.quadraticCurveTo(0, curve * 0.5 - open * 0.2, right.x, right.y);
    context.quadraticCurveTo(0, curve * 0.5 + open * 1.6, left.x, left.y);
    context.fillStyle = '#3a2a2a';
    context.fill();
    context.stroke();
  });
}

function withAlpha(context, weight, draw) {
  if (weight < 0.05) return;
  context.save();
  context.globalAlpha = Math.min(1, weight);
  draw();
  context.restore();
}

function drawBlush(context, weight) {
  withAlpha(context, weight, () => {
    context.strokeStyle = '#ff4f9a'; // the page's riso pink
    context.lineWidth = LINE * 0.8;
    for (const cheek of CHARACTER.cheeks) {
      inFaceSpace(context, cheek, () => {
        for (let index = -2; index <= 2; index++) {
          context.beginPath();
          context.moveTo(index * 5 - 3, 4);
          context.lineTo(index * 5 + 3, -4);
          context.stroke();
        }
      });
    }
  });
}

function drawGloom(context, weight) {
  withAlpha(context, weight * 0.6, () => {
    inFaceSpace(context, { x: 546, y: 180 }, () => {
      context.strokeStyle = INK;
      context.lineWidth = LINE * 0.6;
      for (let x = -70; x <= 70; x += 11) {
        context.beginPath();
        context.moveTo(x, -10 + Math.abs(x) * 0.15);
        context.lineTo(x, 22 - Math.abs(x) * 0.1);
        context.stroke();
      }
    });
  });
}

// Manga anger mark: four bulging arcs around a cross.
function drawAnger(context, weight) {
  withAlpha(context, weight, () => {
    context.save();
    context.translate(668, 92);
    context.strokeStyle = '#c62f2f';
    context.lineWidth = LINE * 1.3;
    for (let quarter = 0; quarter < 4; quarter++) {
      context.rotate(Math.PI / 2);
      context.beginPath();
      context.moveTo(4, 14);
      context.quadraticCurveTo(5, 5, 14, 4);
      context.stroke();
    }
    context.restore();
  });
}

function drawSweat(context, weight) {
  withAlpha(context, weight, () => {
    context.save();
    context.translate(672, 190);
    context.strokeStyle = INK;
    context.fillStyle = '#ffffff';
    context.lineWidth = LINE;
    context.beginPath();
    context.moveTo(0, -16);
    context.quadraticCurveTo(10, 2, 0, 8);
    context.quadraticCurveTo(-10, 2, 0, -16);
    context.fill();
    context.stroke();
    context.restore();
  });
}

function drawSurprise(context, weight) {
  withAlpha(context, weight, () => {
    context.strokeStyle = INK;
    context.lineWidth = LINE;
    for (const [x, y, angle] of [[420, 110, -2.4], [410, 150, -2.9], [680, 70, -0.7], [700, 112, -0.25]]) {
      context.beginPath();
      context.moveTo(x, y);
      context.lineTo(x + Math.cos(angle) * 18, y + Math.sin(angle) * 18);
      context.stroke();
    }
  });
}
