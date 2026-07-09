import React from 'react';
import { createRoot } from 'react-dom/client';
import LayoutsPage from './pages/LayoutsPage';
import './gallery.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <LayoutsPage />
  </React.StrictMode>,
);
