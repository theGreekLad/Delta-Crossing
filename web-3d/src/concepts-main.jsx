import React, { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import ConceptsPage from './pages/ConceptsPage';
import './index.css';
import './concepts.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <ConceptsPage />
  </StrictMode>,
);
