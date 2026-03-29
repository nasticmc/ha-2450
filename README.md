# LD2450 Floorplan Card

A custom Home Assistant Lovelace card that displays HLK-LD2450 radar sensor targets on a floorplan map. Supports multiple rooms, sensors at various angles (straight or 45°), and configurable room layouts.

## Features

- Real-time target tracking from LD2450 sensors via [ld2450_ble](https://github.com/MassiPi/ld2450_ble) integration
- Up to 3 targets per sensor with distinct colors
- Configurable room dimensions, sensor positions, and rotation angles
- Multiple rooms in a single combined map
- Support for presence-only sensors (e.g., LD2410)
- Static furniture/landmark markers
- SVG-based rendering with 170° FOV cones
- Dark theme optimized

## Installation

### HACS (Recommended)

1. Add this repository as a custom repository in HACS
2. Install "LD2450 Floorplan Card"
3. Add the resource in your Lovelace config

### Manual

1. Copy `dist/ld2450-floorplan-card.js` to your `www/` folder
2. Add as a resource: `/local/ld2450-floorplan-card.js`

## Configuration

```yaml
type: custom:ld2450-floorplan-card
title: House Map
rooms:
  - name: Lounge
    entity_prefix: sensor.hlk_ld2450_lounge
    width: 5000        # mm
    height: 5000       # mm
    offset_x: 0        # global position
    offset_y: 0
    sensor_x: 0        # sensor position within room
    sensor_y: 0
    rotation: 45       # degrees (0 = straight, 45 = corner mount)
    flip_y: false
    landmarks:
      - name: Couch
        label: C
        x: 2700
        y: 2600

  - name: Garage
    entity_prefix: sensor.hlk_ld2450_59b7
    width: 4000
    height: 5000
    offset_x: -5000
    offset_y: 0
    sensor_x: 0
    sensor_y: 3000
    rotation: 0
    axis_swap: true    # sensor on side wall
    flip_y: true

  - name: Kitchen
    entity_prefix: sensor.hlk_ld2450_dea2
    width: 6000
    height: 6000
    offset_x: 2500
    offset_y: 4500
    sensor_x: 0
    sensor_y: 0
    rotation: 45
    flip_y: true       # sensor at top, targets go down

presence_sensors:
  - name: Study
    entity: binary_sensor.esp_sunroom_presence
    x: -500
    y: 2500
```

## Sensor Mounting Modes

| Mode | rotation | axis_swap | flip_y | Description |
|------|----------|-----------|--------|-------------|
| Corner 45° | 45 | false | false | Mounted in corner at 45° angle |
| Corner 45° (top) | 45 | false | true | Corner mount, sensor at top of map |
| Wall straight | 0 | false | false | Flat on wall, facing into room |
| Side wall | 0 | true | false | On side wall, axes swapped |
