/** Camera bindings the rig implements; pages append their own for the help overlay. */
export interface Control { keys: string; action: string }

export const CAMERA_CONTROLS: readonly Control[] = [
  { keys: 'Drag', action: 'look around (free) · orbit target (orbit)' },
  { keys: 'Right-drag', action: 'pan' },
  { keys: 'Scroll', action: 'zoom in / out' },
  { keys: 'W / S', action: 'forward / back' },
  { keys: 'A / D', action: 'strafe left / right' },
  { keys: 'R / F', action: 'up / down' },
  { keys: 'Q / E', action: 'roll' },
  { keys: 'Shift', action: 'boost' },
  { keys: '- / =', action: 'throttle down / up' },
  { keys: 'Tab', action: 'switch free / orbit' },
  { keys: 'Click body', action: 'fly to it' },
  { keys: 'Esc · double-click', action: 'release target' },
  { keys: 'H', action: 'return to overview' },
];
