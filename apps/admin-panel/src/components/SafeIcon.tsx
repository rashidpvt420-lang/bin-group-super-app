import React from 'react';

type IconModule = {
  default?: unknown;
};

type SafeIconProps = Record<string, any> & {
  icon?: unknown;
  fallback?: React.ReactNode;
};

const REACT_ELEMENT_TYPE = Symbol.for('react.element');
const REACT_FORWARD_REF_TYPE = Symbol.for('react.forward_ref');
const REACT_MEMO_TYPE = Symbol.for('react.memo');
const REACT_LAZY_TYPE = Symbol.for('react.lazy');

function unwrapIcon(icon: unknown): unknown {
  if (!icon) return null;

  if (React.isValidElement(icon)) return icon.type;

  const maybeModule = icon as IconModule;
  if (maybeModule && typeof maybeModule === 'object' && 'default' in maybeModule && maybeModule.default) {
    return React.isValidElement(maybeModule.default) ? maybeModule.default.type : maybeModule.default;
  }

  return icon;
}

function isRenderableComponent(candidate: unknown): candidate is React.ElementType {
  if (typeof candidate === 'string' || typeof candidate === 'function') return true;
  if (!candidate || typeof candidate !== 'object') return false;

  const reactType = (candidate as any).$$typeof;
  return reactType === REACT_FORWARD_REF_TYPE || reactType === REACT_MEMO_TYPE || reactType === REACT_LAZY_TYPE || reactType === REACT_ELEMENT_TYPE;
}

export function renderSafeIcon(icon: unknown, props: Record<string, any> = {}, fallback: React.ReactNode = null): React.ReactNode {
  if (!icon) return fallback;

  if (React.isValidElement(icon)) {
    const type = unwrapIcon(icon);
    if (isRenderableComponent(type)) return React.cloneElement(icon as React.ReactElement, props);
    console.warn('[SafeIcon] Blocked invalid React icon element type:', type);
    return fallback;
  }

  const IconComponent = unwrapIcon(icon);
  if (!isRenderableComponent(IconComponent)) {
    console.warn('[SafeIcon] Blocked invalid React icon component:', IconComponent);
    return fallback;
  }

  return React.createElement(IconComponent, props);
}

export default function SafeIcon({ icon, fallback = null, ...props }: SafeIconProps) {
  return <>{renderSafeIcon(icon, props, fallback)}</>;
}
