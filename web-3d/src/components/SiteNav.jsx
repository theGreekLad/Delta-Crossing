import React from 'react';
import { platUrl, appUrl } from '../data/platUrls';

/**
 * Shared top-nav links used across 3D app pages.
 * @param {'plat' | '3d' | 'concepts' | 'layouts' | 'area' | 'proforma' | null} current
 */
export default function SiteNav({ current = null, extra = null, className = 'header-actions' }) {
  const links = [
    { id: 'plat', label: 'Plat Map', href: platUrl('index.html') },
    { id: '3d', label: '3D View', href: appUrl('index.html') },
    // Conceptual Drawings kept in repo but hidden from live nav for now.
    { id: 'layouts', label: 'Layouts', href: appUrl('layouts.html') },
    { id: 'area', label: 'Delta Area Information', href: appUrl('area-info.html') },
    { id: 'proforma', label: 'Proforma', href: appUrl('proforma.html') },
  ];

  return (
    <div className={`${className} site-nav`}>
      {links.map((link) => (
        <a
          key={link.id}
          className={`btn ${current === link.id ? 'active' : 'btn-primary'}`}
          href={link.href}
          aria-current={current === link.id ? 'page' : undefined}
        >
          {link.label}
        </a>
      ))}
      {extra}
    </div>
  );
}
