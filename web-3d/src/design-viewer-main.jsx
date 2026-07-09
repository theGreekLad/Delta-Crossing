import React from 'react';
import { createRoot } from 'react-dom/client';
import DesignViewerPage from './pages/DesignViewerPage';
import './design-viewer.css';

createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <DesignViewerPage />
  </React.StrictMode>,
);
