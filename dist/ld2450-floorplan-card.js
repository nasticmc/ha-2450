/**
 * LD2450 Floorplan Card
 * Custom Lovelace card for displaying HLK-LD2450 radar targets on a floorplan
 * 
 * Supports: multiple rooms, 45° and straight mounting, flip/swap axes,
 * presence-only sensors, landmarks, configurable colors
 */

const CARD_VERSION = '0.1.0';

const TARGET_COLORS = ['#00aaff', '#ff6644', '#ffcc00'];
const TARGET_GLOW = ['#00aaff40', '#ff664440', '#ffcc0040'];
const SENSOR_COLOR = '#00ff88';
const LANDMARK_COLOR = 'rgba(100,140,180,0.5)';
const WALL_COLOR = 'rgba(100,150,200,0.3)';
const ROOM_FILL = 'rgba(10,20,35,0.25)';
const PRESENCE_COLOR = '#ff6464';
const COS45 = 0.7071;

// Target suffixes used by ld2450_ble
const TARGET_NAMES = ['one', 'two', 'three'];

class LD2450FloorplanCard extends HTMLElement {
  constructor() {
    super();
    this.attachShadow({ mode: 'open' });
    this._config = {};
    this._hass = null;
    this._svg = null;
    this._initialized = false;
  }

  // HA calls this when config changes
  setConfig(config) {
    if (!config.rooms || !Array.isArray(config.rooms)) {
      throw new Error('You must define at least one room');
    }
    this._config = {
      title: config.title || 'LD2450 Floorplan',
      rooms: config.rooms || [],
      presence_sensors: config.presence_sensors || [],
      padding: config.padding ?? 500,
      height: config.height ?? 500,
      show_fov: config.show_fov ?? false,
      show_grid: config.show_grid ?? false,
      background: config.background || 'transparent',
      ...config,
    };
    this._initialized = false;
    this._render();
  }

  // HA calls this on every state change
  set hass(hass) {
    this._hass = hass;
    if (!this._initialized) {
      this._render();
    }
    this._updateTargets();
  }

  // Calculate global bounds from all rooms
  _calculateBounds() {
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    const pad = this._config.padding;

    for (const room of this._config.rooms) {
      const rx = room.offset_x || 0;
      const ry = room.offset_y || 0;
      const rw = room.width || 5000;
      const rh = room.height || 5000;
      minX = Math.min(minX, rx);
      minY = Math.min(minY, ry);
      maxX = Math.max(maxX, rx + rw);
      maxY = Math.max(maxY, ry + rh);
    }

    // Include presence sensors in bounds
    for (const ps of this._config.presence_sensors) {
      minX = Math.min(minX, ps.x || 0);
      minY = Math.min(minY, ps.y || 0);
      maxX = Math.max(maxX, (ps.x || 0) + 500);
      maxY = Math.max(maxY, (ps.y || 0) + 500);
    }

    return {
      minX: minX - pad,
      minY: minY - pad,
      maxX: maxX + pad,
      maxY: maxY + pad,
    };
  }

  // Transform sensor-local coordinates to global room coordinates
  _transformTarget(room, sensorX, sensorY) {
    const rotation = room.rotation || 0;
    const offX = room.offset_x || 0;
    const offY = room.offset_y || 0;
    const sensX = room.sensor_x || 0;
    const sensY = room.sensor_y || 0;
    const flipY = room.flip_y || false;
    const flipX = room.flip_x || false;
    const axisSwap = room.axis_swap || false;

    let gx, gy;

    if (rotation === 45) {
      // 45° corner mount rotation
      const rx = (sensorY - sensorX) * COS45;
      const ry = (sensorX + sensorY) * COS45;
      gx = rx + offX + sensX;
      gy = flipY ? (-ry + offY + (room.height || 5000) + sensY) : (ry + offY + sensY);
    } else {
      // Straight mount
      let lx = sensorX;
      let ly = sensorY;
      if (axisSwap) {
        lx = sensorY;
        ly = sensorX;
      }
      gx = (flipX ? -lx : lx) + offX + sensX;
      gy = (flipY ? -ly : ly) + offY + sensY;
    }

    return { x: gx, y: gy };
  }

  // Get target state from HA
  _getTargetState(entityPrefix, targetName) {
    if (!this._hass) return null;
    const xKey = `${entityPrefix}_target_${targetName}_x`;
    const yKey = `${entityPrefix}_target_${targetName}_y`;
    const xState = this._hass.states[xKey];
    const yState = this._hass.states[yKey];

    if (!xState || !yState) return null;

    const x = Number(xState.state);
    const y = Number(yState.state);

    if (x === 0 && y === 0) return null;
    if (isNaN(x) || isNaN(y)) return null;

    return { x, y };
  }

  // Convert global coords to SVG coords
  _toSvg(gx, gy, bounds, svgW, svgH) {
    const scaleX = svgW / (bounds.maxX - bounds.minX);
    const scaleY = svgH / (bounds.maxY - bounds.minY);
    const scale = Math.min(scaleX, scaleY);
    const ox = (svgW - (bounds.maxX - bounds.minX) * scale) / 2;
    const oy = (svgH - (bounds.maxY - bounds.minY) * scale) / 2;
    return {
      x: (gx - bounds.minX) * scale + ox,
      y: svgH - ((gy - bounds.minY) * scale + oy), // flip Y for SVG
    };
  }

  _render() {
    if (!this._config.rooms) return;

    const bounds = this._calculateBounds();
    const aspect = (bounds.maxX - bounds.minX) / (bounds.maxY - bounds.minY);
    const svgH = 600;
    const svgW = svgH * aspect;

    this.shadowRoot.innerHTML = `
      <style>
        :host {
          display: block;
        }
        .card {
          padding: 12px;
          background: var(--ha-card-background, var(--card-background-color, #1a1a2e));
          border-radius: var(--ha-card-border-radius, 12px);
          box-shadow: var(--ha-card-box-shadow, none);
          overflow: hidden;
        }
        .title {
          font-size: 14px;
          font-weight: 500;
          color: var(--primary-text-color, #ccc);
          margin-bottom: 8px;
          font-family: var(--ha-card-header-font-family, inherit);
        }
        svg {
          width: 100%;
          height: auto;
          display: block;
        }
        .target-blip {
          transition: cx 0.3s ease, cy 0.3s ease, opacity 0.3s ease;
        }
        .target-label {
          transition: x 0.3s ease, y 0.3s ease, opacity 0.3s ease;
          font-family: 'JetBrains Mono', 'Fira Code', monospace;
        }
        .presence-dot {
          transition: opacity 0.3s ease;
        }
      </style>
      <ha-card>
        <div class="card">
          ${this._config.title ? `<div class="title">${this._config.title}</div>` : ''}
          <svg viewBox="0 0 ${svgW} ${svgH}" id="floorplan-svg">
            <defs>
              <filter id="glow">
                <feGaussianBlur stdDeviation="2" result="blur"/>
                <feMerge><feMergeNode in="blur"/><feMergeNode in="SourceGraphic"/></feMerge>
              </filter>
            </defs>
            <!-- Room outlines -->
            <g id="rooms"></g>
            <!-- Room labels -->
            <g id="labels"></g>
            <!-- Landmarks -->
            <g id="landmarks"></g>
            <!-- Sensors -->
            <g id="sensors"></g>
            <!-- Presence sensors -->
            <g id="presence"></g>
            <!-- Targets -->
            <g id="targets" filter="url(#glow)"></g>
          </svg>
        </div>
      </ha-card>
    `;

    this._svg = this.shadowRoot.querySelector('#floorplan-svg');
    this._bounds = bounds;
    this._svgW = svgW;
    this._svgH = svgH;

    // Draw static elements
    this._drawRooms();
    this._drawSensors();
    this._drawLandmarks();
    this._drawPresenceSensors();
    this._createTargetElements();

    this._initialized = true;
  }

  _drawRooms() {
    const g = this._svg.querySelector('#rooms');
    const lg = this._svg.querySelector('#labels');
    g.innerHTML = '';
    lg.innerHTML = '';

    for (const room of this._config.rooms) {
      const tl = this._toSvg(room.offset_x || 0, (room.offset_y || 0) + (room.height || 5000), this._bounds, this._svgW, this._svgH);
      const br = this._toSvg((room.offset_x || 0) + (room.width || 5000), room.offset_y || 0, this._bounds, this._svgW, this._svgH);

      const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
      rect.setAttribute('x', Math.min(tl.x, br.x));
      rect.setAttribute('y', Math.min(tl.y, br.y));
      rect.setAttribute('width', Math.abs(br.x - tl.x));
      rect.setAttribute('height', Math.abs(br.y - tl.y));
      rect.setAttribute('fill', room.fill || ROOM_FILL);
      rect.setAttribute('stroke', room.wall_color || WALL_COLOR);
      rect.setAttribute('stroke-width', '2');
      rect.setAttribute('rx', '2');
      g.appendChild(rect);

      // Room label
      const cx = (tl.x + br.x) / 2;
      const cy = (tl.y + br.y) / 2;
      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.setAttribute('x', cx);
      label.setAttribute('y', cy);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('dominant-baseline', 'middle');
      label.setAttribute('fill', 'rgba(100,150,200,0.25)');
      label.setAttribute('font-size', '13');
      label.textContent = room.name || '';
      lg.appendChild(label);
    }
  }

  _drawSensors() {
    const g = this._svg.querySelector('#sensors');
    g.innerHTML = '';

    for (const room of this._config.rooms) {
      const sx = (room.offset_x || 0) + (room.sensor_x || 0);
      const sy = (room.offset_y || 0) + (room.sensor_y || 0);
      const pt = this._toSvg(sx, sy, this._bounds, this._svgW, this._svgH);

      // Sensor diamond
      const diamond = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
      const s = 6;
      diamond.setAttribute('points',
        `${pt.x},${pt.y - s} ${pt.x + s},${pt.y} ${pt.x},${pt.y + s} ${pt.x - s},${pt.y}`);
      diamond.setAttribute('fill', SENSOR_COLOR);
      diamond.setAttribute('opacity', '0.9');
      g.appendChild(diamond);

      // Glow ring
      const ring = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      ring.setAttribute('cx', pt.x);
      ring.setAttribute('cy', pt.y);
      ring.setAttribute('r', '9');
      ring.setAttribute('fill', 'none');
      ring.setAttribute('stroke', SENSOR_COLOR);
      ring.setAttribute('stroke-width', '0.8');
      ring.setAttribute('opacity', '0.3');
      g.appendChild(ring);
    }
  }

  _drawLandmarks() {
    const g = this._svg.querySelector('#landmarks');
    g.innerHTML = '';

    for (const room of this._config.rooms) {
      const landmarks = room.landmarks || [];
      for (const lm of landmarks) {
        const gx = (room.offset_x || 0) + (lm.x || 0);
        const gy = (room.offset_y || 0) + (lm.y || 0);
        const pt = this._toSvg(gx, gy, this._bounds, this._svgW, this._svgH);

        const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
        rect.setAttribute('x', pt.x - 5);
        rect.setAttribute('y', pt.y - 5);
        rect.setAttribute('width', 10);
        rect.setAttribute('height', 10);
        rect.setAttribute('fill', LANDMARK_COLOR);
        rect.setAttribute('rx', '1');
        g.appendChild(rect);

        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('x', pt.x);
        label.setAttribute('y', pt.y - 10);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', 'rgba(255,255,255,0.4)');
        label.setAttribute('font-size', '9');
        label.textContent = lm.label || lm.name || '';
        g.appendChild(label);
      }
    }
  }

  _drawPresenceSensors() {
    const g = this._svg.querySelector('#presence');
    g.innerHTML = '';

    for (const ps of this._config.presence_sensors) {
      const pt = this._toSvg(ps.x || 0, ps.y || 0, this._bounds, this._svgW, this._svgH);

      const dot = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
      dot.classList.add('presence-dot');
      dot.setAttribute('cx', pt.x);
      dot.setAttribute('cy', pt.y);
      dot.setAttribute('r', '8');
      dot.setAttribute('fill', PRESENCE_COLOR);
      dot.setAttribute('opacity', '0');
      dot.dataset.entity = ps.entity;
      g.appendChild(dot);

      const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
      label.classList.add('presence-dot');
      label.setAttribute('x', pt.x);
      label.setAttribute('y', pt.y - 14);
      label.setAttribute('text-anchor', 'middle');
      label.setAttribute('fill', PRESENCE_COLOR);
      label.setAttribute('font-size', '9');
      label.setAttribute('opacity', '0');
      label.dataset.entity = ps.entity;
      label.textContent = ps.name || '';
      g.appendChild(label);
    }
  }

  _createTargetElements() {
    const g = this._svg.querySelector('#targets');
    g.innerHTML = '';

    for (let ri = 0; ri < this._config.rooms.length; ri++) {
      const room = this._config.rooms[ri];
      for (let ti = 0; ti < 3; ti++) {
        const color = TARGET_COLORS[ti];
        const glow = TARGET_GLOW[ti];
        const id = `t-${ri}-${ti}`;

        // Glow circle
        const gc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        gc.setAttribute('id', `${id}-glow`);
        gc.setAttribute('r', '14');
        gc.setAttribute('fill', glow);
        gc.setAttribute('opacity', '0');
        gc.classList.add('target-blip');
        g.appendChild(gc);

        // Main dot
        const mc = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        mc.setAttribute('id', `${id}-dot`);
        mc.setAttribute('r', '6');
        mc.setAttribute('fill', color);
        mc.setAttribute('opacity', '0');
        mc.classList.add('target-blip');
        g.appendChild(mc);

        // Inner highlight
        const ic = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
        ic.setAttribute('id', `${id}-inner`);
        ic.setAttribute('r', '2.5');
        ic.setAttribute('fill', '#fff');
        ic.setAttribute('opacity', '0');
        ic.classList.add('target-blip');
        g.appendChild(ic);

        // Label
        const label = document.createElementNS('http://www.w3.org/2000/svg', 'text');
        label.setAttribute('id', `${id}-label`);
        label.setAttribute('text-anchor', 'middle');
        label.setAttribute('fill', color);
        label.setAttribute('font-size', '9');
        label.setAttribute('opacity', '0');
        label.classList.add('target-label');
        label.textContent = `${(room.name || 'R')[0]}${ti + 1}`;
        g.appendChild(label);
      }
    }
  }

  _updateTargets() {
    if (!this._hass || !this._svg || !this._bounds) return;

    // Update radar targets
    for (let ri = 0; ri < this._config.rooms.length; ri++) {
      const room = this._config.rooms[ri];
      const prefix = room.entity_prefix;

      for (let ti = 0; ti < 3; ti++) {
        const targetData = this._getTargetState(prefix, TARGET_NAMES[ti]);
        const id = `t-${ri}-${ti}`;
        const glowEl = this._svg.querySelector(`#${id}-glow`);
        const dotEl = this._svg.querySelector(`#${id}-dot`);
        const innerEl = this._svg.querySelector(`#${id}-inner`);
        const labelEl = this._svg.querySelector(`#${id}-label`);

        if (!glowEl || !dotEl) continue;

        if (targetData) {
          const global = this._transformTarget(room, targetData.x, targetData.y);
          const svgPt = this._toSvg(global.x, global.y, this._bounds, this._svgW, this._svgH);

          for (const el of [glowEl, dotEl, innerEl]) {
            el.setAttribute('cx', svgPt.x);
            el.setAttribute('cy', svgPt.y);
            el.setAttribute('opacity', el === innerEl ? '0.25' : el === glowEl ? '0.6' : '0.85');
          }
          labelEl.setAttribute('x', svgPt.x);
          labelEl.setAttribute('y', svgPt.y - 12);
          labelEl.setAttribute('opacity', '0.8');
        } else {
          for (const el of [glowEl, dotEl, innerEl, labelEl]) {
            el.setAttribute('opacity', '0');
          }
        }
      }
    }

    // Update presence sensors
    const presenceEls = this._svg.querySelectorAll('.presence-dot');
    for (const el of presenceEls) {
      const entity = el.dataset.entity;
      if (entity && this._hass.states[entity]) {
        const isOn = this._hass.states[entity].state === 'on';
        el.setAttribute('opacity', isOn ? '0.9' : '0');
      }
    }
  }

  // Card size for HA layout
  getCardSize() {
    return 4;
  }

  // Config editor stub (for future visual editor)
  static getConfigElement() {
    return document.createElement('ld2450-floorplan-card-editor');
  }

  static getStubConfig() {
    return {
      title: 'LD2450 Floorplan',
      rooms: [
        {
          name: 'Room 1',
          entity_prefix: 'sensor.hlk_ld2450_XXXX',
          width: 5000,
          height: 5000,
          offset_x: 0,
          offset_y: 0,
          sensor_x: 0,
          sensor_y: 0,
          rotation: 45,
        },
      ],
    };
  }
}

// Register the card
customElements.define('ld2450-floorplan-card', LD2450FloorplanCard);

// Register with HA card picker
window.customCards = window.customCards || [];
window.customCards.push({
  type: 'ld2450-floorplan-card',
  name: 'LD2450 Floorplan',
  description: 'Display LD2450 radar targets on a floorplan map',
  preview: true,
});

console.info(`%c LD2450-FLOORPLAN-CARD %c v${CARD_VERSION} `, 'background:#00ff88;color:#000', 'background:#333;color:#fff');
