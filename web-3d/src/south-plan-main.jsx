import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import SouthPlanPage from './pages/SouthPlanPage';
import './index.css';
import './proforma.css';
import './south-plan.css';

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <SouthPlanPage />
  </StrictMode>,
);
